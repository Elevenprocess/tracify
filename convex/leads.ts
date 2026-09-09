/**
 * Entrée des leads : un webhook par client (POST /api/leads, clé secrète),
 * conçu pour l'action « Webhook » d'un workflow GoHighLevel (mais utilisable
 * depuis n8n, Zapier…). Chaque lead est rangé dans la campagne Meta de son
 * attribution GHL — créée dans Tracify si elle est nouvelle — et jamais dans
 * une autre campagne ; sans campagne il est ignoré (voir convex/routing.ts).
 * Si le payload GHL n'embarque pas l'attribution, la fiche contact est relue
 * par l'API GHL (contact_id) avant l'aiguillage.
 */
import { v } from 'convex/values'
import {
  httpAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { requireUser } from './guard'
import { findDuplicate } from './prospects'
import {
  attributedCampaign,
  describeAttribution,
  fetchContact,
  resolveToken,
} from './ghl'
import { routeToCampaign } from './routing'

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

// État du branchement GHL : dernière réception, compteurs, campagnes
// détectées automatiquement — affiché sur la fiche client.
export const webhookStatus = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (!client) return null
    const campaigns = await ctx.db
      .query('campaigns')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    return {
      key: client.webhookKey ?? null,
      // Sous-compte GHL du client (relecture 10 min + « Détecter maintenant »)
      ghl: client.ghlLocationId
        ? {
            locationId: client.ghlLocationId,
            lastSyncAt: client.ghlLastSyncAt ?? null,
            error: client.ghlSyncError ?? null,
          }
        : null,
      adAccountId: client.adAccountId || null,
      lastAt: client.webhookLastAt ?? null,
      lastOutcome: client.webhookLastOutcome ?? null,
      counts: client.webhookCounts ?? {
        received: 0,
        imported: 0,
        duplicates: 0,
        noCampaign: 0,
      },
      detected: campaigns
        .filter((c) => c.origin === 'ghl')
        .map((c) => ({ metaId: c.metaId, name: c.name ?? null })),
    }
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

type Outcome =
  'imported' | 'duplicate' | 'no-campaign' | 'other-client' | 'test'

const OUTCOME_LABEL: Record<Outcome, string> = {
  imported: 'prospect ajouté',
  duplicate: 'déjà connu',
  'no-campaign': 'ignoré : aucune campagne Meta dans son attribution',
  'other-client': 'ignoré : campagne rattachée à un autre client',
  test: 'test GHL reçu, le webhook est bien branché (données factices non importées)',
}

async function recordWebhook(
  ctx: MutationCtx,
  client: Doc<'clients'>,
  outcome: Outcome,
  detail?: string,
) {
  const c = client.webhookCounts ?? {
    received: 0,
    imported: 0,
    duplicates: 0,
    noCampaign: 0,
  }
  await ctx.db.patch(client._id, {
    webhookLastAt: new Date().toISOString(),
    webhookLastOutcome: detail
      ? `${OUTCOME_LABEL[outcome]} (${detail})`
      : OUTCOME_LABEL[outcome],
    webhookCounts: {
      received: c.received + 1,
      imported: c.imported + (outcome === 'imported' ? 1 : 0),
      duplicates: c.duplicates + (outcome === 'duplicate' ? 1 : 0),
      noCampaign:
        c.noCampaign +
        (outcome === 'no-campaign' || outcome === 'other-client' ? 1 : 0),
    },
  })
}

export const ingest = internalMutation({
  args: {
    key: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    source: v.optional(v.string()),
    medium: v.optional(v.string()),
    // ID de campagne Meta (attribution GHL ou champ explicite) + son nom
    campaignId: v.optional(v.string()),
    campaignName: v.optional(v.string()),
    date: v.optional(v.string()),
    ghlContactId: v.optional(v.string()),
    // Envoi du bouton « Tester » de GHL (données factices) : on note la
    // réception pour prouver le branchement, sans créer de prospect.
    test: v.optional(v.boolean()),
  },
  handler: async (ctx, a) => {
    const client = await ctx.db
      .query('clients')
      .withIndex('by_webhook', (q) => q.eq('webhookKey', a.key))
      .unique()
    if (!client) return { ok: false as const, error: 'Clé invalide.' }

    const name = a.name.trim()

    if (a.test) {
      await recordWebhook(ctx, client, 'test', name)
      return {
        ok: true as const,
        skipped: 'test' as const,
        reason: OUTCOME_LABEL.test,
      }
    }

    // Déjà reçu (même contact GHL) → rien à faire.
    if (a.ghlContactId) {
      const known = await ctx.db
        .query('prospects')
        .withIndex('by_ghl', (q) => q.eq('ghlContactId', a.ghlContactId))
        .first()
      if (known) {
        await recordWebhook(ctx, client, 'duplicate', name)
        return { ok: true as const, id: known._id, duplicate: true }
      }
    }

    // Aiguillage strict : la campagne de l'attribution, créée si nouvelle ;
    // sans campagne (ou campagne d'un autre client) le lead n'est pas importé.
    const routed = await routeToCampaign(
      ctx,
      client.slug,
      a.campaignId,
      a.campaignName,
    )
    if (routed.kind !== 'campaign') {
      const outcome: Outcome =
        routed.kind === 'none' ? 'no-campaign' : 'other-client'
      await recordWebhook(ctx, client, outcome, name)
      return {
        ok: true as const,
        skipped: outcome,
        reason: OUTCOME_LABEL[outcome],
      }
    }
    const campaignId = routed.metaId

    // Anti-doublon : même téléphone ou email déjà présent chez ce client.
    const phone = a.phone?.trim() ?? ''
    const email = a.email?.trim().toLowerCase() || undefined
    const dup = await findDuplicate(ctx, client.slug, phone, email)
    if (dup) {
      const patch: { ghlContactId?: string; campaignId?: string } = {}
      if (!dup.ghlContactId && a.ghlContactId)
        patch.ghlContactId = a.ghlContactId
      if (!dup.campaignId) patch.campaignId = campaignId
      if (Object.keys(patch).length) await ctx.db.patch(dup._id, patch)
      await recordWebhook(ctx, client, 'duplicate', name)
      return { ok: true as const, id: dup._id, duplicate: true }
    }

    const now = new Date()
    const iso = now.toISOString()
    const id = await ctx.db.insert('prospects', {
      clientSlug: client.slug,
      campaignId,
      name,
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
    await recordWebhook(
      ctx,
      client,
      'imported',
      routed.created ? `${name} · nouvelle campagne détectée` : name,
    )
    return {
      ok: true as const,
      id,
      duplicate: false,
      campaignId,
      campaignCreated: routed.created,
    }
  },
})

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')

const obj = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {}

// Attribution d'un payload GHL : imbriquée (contact.attributionSource) ou à
// plat ; la « dernière » attribution est écrasée par la première (celle de
// la création du contact = la pub d'origine).
function attributionOf(body: Record<string, unknown>) {
  const contact = obj(body.contact)
  return {
    ...obj(body.lastAttributionSource),
    ...obj(contact.lastAttributionSource),
    ...obj(body.attributionSource),
    ...obj(contact.attributionSource),
  }
}

// POST /api/leads — JSON, clé dans le corps (`key`), dans l'URL (`?key=`)
// ou en en-tête `Authorization: Bearer <clé>`. Accepte des noms de champs
// courants (name / full_name / firstName+lastName, phone / telephone,
// email…) et le payload standard d'une action « Webhook » de workflow
// GoHighLevel (first_name, phone, email, contact_id, location.id,
// attributionSource…).
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

  const ghlContactId = str(body.contact_id) || str(body.contactId) || undefined
  let attr = attributionOf(body)
  let tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === 'string')
    : []

  // Campagne forcée par l'adresse (`?campaign=` : webhook affiché sur la page
  // d'une campagne) → tout lead reçu par cette adresse va dans cette campagne.
  const forcedCampaign = str(new URL(req.url).searchParams.get('campaign'))
    .replace(/\s/g, '')
    .replace(/\D/g, '')

  // Campagne explicite (n8n, Zapier…) ou forcée par l'adresse, sinon
  // attribution GHL.
  let campaignId =
    str(body.campaignId) ||
    str(body.campaign_id) ||
    forcedCampaign ||
    attributedCampaign(attr).id
  let campaignName =
    str(body.campaignName) ||
    str(body.campaign_name) ||
    attributedCampaign(attr).name

  // Payload GHL sans attribution : on relit la fiche contact par l'API
  // (le workflow n'embarque pas toujours attributionSource).
  if (!campaignId && ghlContactId) {
    const locationId =
      str(obj(body.location).id) ||
      str(body.locationId) ||
      str(body.location_id)
    const token = await resolveToken(ctx, locationId)
    if (token) {
      try {
        const contact = await fetchContact(token, ghlContactId)
        if (contact) {
          attr = {
            ...obj(contact.lastAttributionSource),
            ...obj(contact.attributionSource),
            ...attr,
          }
          if (tags.length === 0 && Array.isArray(contact.tags))
            tags = contact.tags.filter(
              (t): t is string => typeof t === 'string',
            )
          const found = attributedCampaign(attr)
          campaignId = found.id
          campaignName = campaignName || found.name
        }
      } catch (e) {
        console.error(`Relecture GHL du contact ${ghlContactId} en échec :`, e)
      }
    }
  }

  const ghl = describeAttribution(attr, tags, str(body.contact_source))
  const hasAttr = Object.keys(attr).length > 0 || tags.length > 0

  // Bouton « Tester » d'un workflow GHL : valeurs factices du type
  // « <test lead: dummy data for full_name> ».
  const isGhlTest = /dummy data|<test lead/i.test(
    [name, phone, email].join(' '),
  )

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
    campaignId: campaignId || undefined,
    campaignName: campaignName || undefined,
    date: str(body.date) || str(body.date_created) || undefined,
    ghlContactId,
    test: isGhlTest || undefined,
  })
  if (!result.ok) return json(result, 401)
  return json(result, 'skipped' in result ? 200 : 201)
})
