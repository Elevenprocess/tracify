/**
 * Entrée des leads : un webhook par client (POST /api/leads, clé secrète)
 * pour pousser les prospects depuis n8n, GHL, un formulaire Meta… Les leads
 * atterrissent dans le pipeline du client (fiche admin + espace client).
 */
import { v } from 'convex/values'
import {
  httpAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { internal } from './_generated/api'
import { requireUser } from './guard'
import { findDuplicate } from './prospects'
import { describeAttribution } from './ghl'

const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
function randomKey(len = 32) {
  let out = ''
  for (let i = 0; i < len; i++)
    out += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)]
  return `trk_${out}`
}

// --- Côté admin -------------------------------------------------------------

export const webhookKey = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    return client?.webhookKey ?? null
  },
})

// Génère (ou régénère) la clé : l'ancienne cesse d'être acceptée.
export const generateWebhookKey = mutation({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (!client) throw new Error('Client introuvable.')
    const key = randomKey()
    await ctx.db.patch(client._id, { webhookKey: key })
    return key
  },
})

export const revokeWebhookKey = mutation({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (client) await ctx.db.patch(client._id, { webhookKey: undefined })
  },
})

// Outil CLI : `npx convex run leads:setWebhookKey '{"clientSlug":"…","key":"trk_…"}'`
export const setWebhookKey = internalMutation({
  args: { clientSlug: v.string(), key: v.string() },
  handler: async (ctx, { clientSlug, key }) => {
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (!client) throw new Error('Client introuvable.')
    await ctx.db.patch(client._id, { webhookKey: key })
  },
})

// --- Réception ---------------------------------------------------------------

export const ingest = internalMutation({
  args: {
    key: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    source: v.optional(v.string()),
    medium: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    date: v.optional(v.string()),
    ghlContactId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const client = await ctx.db
      .query('clients')
      .withIndex('by_webhook', (q) => q.eq('webhookKey', a.key))
      .unique()
    if (!client) return { ok: false as const, error: 'Clé invalide.' }

    // Déjà reçu (même contact GHL) → rien à faire.
    if (a.ghlContactId) {
      const known = await ctx.db
        .query('prospects')
        .withIndex('by_ghl', (q) => q.eq('ghlContactId', a.ghlContactId))
        .first()
      if (known) return { ok: true as const, id: known._id, duplicate: true }
    }

    // Campagne facultative : ignorée si elle n'appartient pas au client.
    // Sans campagne valable, le lead va dans la campagne active la plus
    // récente du client (les prospects vivent dans les campagnes).
    let campaignId: string | undefined
    if (a.campaignId) {
      const campaign = await ctx.db
        .query('campaigns')
        .withIndex('by_meta', (q) => q.eq('metaId', a.campaignId!))
        .unique()
      if (campaign?.clientSlug === client.slug) campaignId = campaign.metaId
    }
    if (!campaignId) {
      const campaigns = await ctx.db
        .query('campaigns')
        .withIndex('by_client', (q) => q.eq('clientSlug', client.slug))
        .collect()
      const pick =
        campaigns
          .filter((c) => !c.status || c.status === 'ACTIVE')
          .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
          .at(0) ??
        campaigns.sort((x, y) => y.createdAt.localeCompare(x.createdAt)).at(0)
      campaignId = pick?.metaId
    }

    // Anti-doublon : même téléphone ou email déjà présent chez ce client.
    const phone = a.phone?.trim() ?? ''
    const email = a.email?.trim().toLowerCase() || undefined
    const dup = await findDuplicate(ctx, client.slug, phone, email)
    if (dup) return { ok: true as const, id: dup._id, duplicate: true }

    const now = new Date()
    const iso = now.toISOString()
    const id = await ctx.db.insert('prospects', {
      clientSlug: client.slug,
      campaignId,
      name: a.name.trim(),
      phone,
      email,
      date: a.date?.slice(0, 10) || iso.slice(0, 10),
      source: a.source?.trim() || 'Webhook',
      medium: a.medium?.trim() || '—',
      status: 'new',
      viaWebhook: true,
      ghlContactId: a.ghlContactId,
      history: [{ status: 'new', at: iso, by: 'webhook' }],
      createdAt: iso,
    })
    return { ok: true as const, id, duplicate: false }
  },
})

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')

const obj = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {}

// POST /api/leads — JSON, clé dans le corps (`key`), dans l'URL (`?key=`)
// ou en en-tête `Authorization: Bearer <clé>`. Accepte des noms de champs
// courants (name / full_name / firstName+lastName, phone / telephone,
// email…) et le payload standard d'une action « Webhook » de workflow
// GoHighLevel (first_name, phone, email, contact_id, attributionSource…).
export const receive = httpAction(async (ctx, req) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
    })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'Corps JSON attendu.' }, 400)
  }
  const auth = req.headers.get('authorization') ?? ''
  const key =
    str(body.key) ||
    str(new URL(req.url).searchParams.get('key')) ||
    (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '')
  if (!key) return json({ ok: false, error: 'Clé manquante.' }, 401)

  const name =
    str(body.name) ||
    str(body.full_name) ||
    str(body.fullName) ||
    [
      str(body.first_name) || str(body.firstName),
      str(body.last_name) || str(body.lastName),
    ]
      .filter(Boolean)
      .join(' ')
  const phone = str(body.phone) || str(body.telephone) || str(body.phone_number)
  const email = str(body.email)
  if (!name && !phone && !email)
    return json({ ok: false, error: 'name, phone ou email requis.' }, 400)

  // Payload GHL : l'attribution est imbriquée (contact.attributionSource),
  // la source contact est souvent vide → on la déduit du medium/sessionSource.
  const contact = obj(body.contact)
  const attr = {
    ...obj(body.lastAttributionSource),
    ...obj(contact.lastAttributionSource),
    ...obj(body.attributionSource),
    ...obj(contact.attributionSource),
  }
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === 'string')
    : []
  const ghl = describeAttribution(attr, tags, str(body.contact_source))
  const hasAttr = Object.keys(attr).length > 0 || tags.length > 0

  const result = await ctx.runMutation(internal.leads.ingest, {
    key,
    name: name || phone || email,
    phone: phone || undefined,
    email: email || undefined,
    source: str(body.source) || (hasAttr ? ghl.source : undefined),
    medium:
      str(body.medium) ||
      str(body.utm_medium) ||
      (hasAttr ? ghl.medium : undefined),
    campaignId:
      str(body.campaignId) ||
      str(body.campaign_id) ||
      str(attr.campaignId) ||
      undefined,
    date: str(body.date) || str(body.date_created) || undefined,
    ghlContactId: str(body.contact_id) || str(body.contactId) || undefined,
  })
  if (!result.ok) return json(result, 401)
  return json(result, 201)
})
