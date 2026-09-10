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

// Journal des dernières réceptions du webhook (fiche client et page
// campagne) : ce que GHL a envoyé et ce que Tracify en a fait.
export const webhookEvents = query({
  args: { clientSlug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { clientSlug, limit }) => {
    await requireUser(ctx)
    const rows = await ctx.db
      .query('webhookEvents')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .order('desc')
      .take(limit ?? 10)
    const names = new Map<string, string>()
    for (const r of rows) {
      const id = r.campaignId ?? r.campaignParam
      if (id && !names.has(id)) {
        const c = await ctx.db
          .query('campaigns')
          .withIndex('by_meta', (q) => q.eq('metaId', id))
          .unique()
        names.set(id, c?.name ?? id)
      }
    }
    return rows.map((r) => ({
      id: r._id,
      at: r.at,
      outcome: r.outcome,
      detail: r.detail ?? null,
      name: r.name ?? null,
      campaignParam: r.campaignParam ?? null,
      bodyCampaign: r.bodyCampaign ?? null,
      campaignId: r.campaignId ?? null,
      campaignName: (() => {
        const id = r.campaignId ?? r.campaignParam
        return id ? (names.get(id) ?? id) : null
      })(),
      hasAttribution: r.hasAttribution,
      test: r.test,
      userAgent: r.userAgent ?? null,
    }))
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
  | 'imported'
  | 'duplicate'
  | 'no-campaign'
  | 'test-no-campaign'
  | 'other-client'
  | 'test'

const OUTCOME_LABEL: Record<Outcome, string> = {
  imported: 'prospect ajouté',
  duplicate: 'déjà connu',
  'no-campaign': 'ignoré : aucune campagne Meta dans son attribution',
  'test-no-campaign':
    "test GHL reçu SANS campagne dans l'adresse : colle l'adresse « GHL » de la page de la campagne (…&campaign=…)",
  'other-client': 'ignoré : campagne rattachée à un autre client',
  test: 'test GHL reçu, prospect « Test GHL » ajouté dans la campagne',
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
      imported:
        c.imported + (outcome === 'imported' || outcome === 'test' ? 1 : 0),
      duplicates: c.duplicates + (outcome === 'duplicate' ? 1 : 0),
      noCampaign:
        c.noCampaign +
        (outcome === 'no-campaign' ||
        outcome === 'test-no-campaign' ||
        outcome === 'other-client'
          ? 1
          : 0),
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
    // Envoi du bouton « Tester » de GHL (données factices) : importé comme
    // un vrai prospect « Test GHL » (demande Mario : le test doit toujours
    // faire apparaître une carte), sans dédoublonnage pour que chaque clic
    // ajoute une carte.
    test: v.optional(v.boolean()),
    // Pour le journal des réceptions
    campaignParam: v.optional(v.string()),
    bodyCampaign: v.optional(v.string()),
    hasAttribution: v.optional(v.boolean()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const client = await ctx.db
      .query('clients')
      .withIndex('by_webhook', (q) => q.eq('webhookKey', a.key))
      .unique()
    const log = async (
      outcome: Outcome | 'bad-key',
      detail?: string,
      campaignId?: string,
    ) => {
      await ctx.db.insert('webhookEvents', {
        clientSlug: client?.slug,
        at: new Date().toISOString(),
        outcome,
        detail,
        name: a.name.trim() || undefined,
        campaignParam: a.campaignParam || undefined,
        bodyCampaign: a.bodyCampaign || undefined,
        campaignId: campaignId || undefined,
        hasAttribution: a.hasAttribution ?? false,
        test: a.test ?? false,
        keyOk: !!client,
        userAgent: a.userAgent,
      })
    }
    if (!client) {
      await log('bad-key', `clé reçue : ${a.key.slice(0, 12)}…`)
      return { ok: false as const, error: 'Clé invalide.' }
    }

    const name = a.name.trim()

    // Déjà reçu (même contact GHL) → rien à faire.
    if (!a.test && a.ghlContactId) {
      const known = await ctx.db
        .query('prospects')
        .withIndex('by_ghl', (q) => q.eq('ghlContactId', a.ghlContactId))
        .first()
      if (known) {
        await recordWebhook(ctx, client, 'duplicate', name)
        await log('duplicate', `même contact GHL (${name})`, known.campaignId)
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
        routed.kind === 'none'
          ? a.test
            ? 'test-no-campaign'
            : 'no-campaign'
          : 'other-client'
      await recordWebhook(ctx, client, outcome, name)
      await log(outcome, name, a.campaignId)
      return {
        ok: true as const,
        skipped: outcome,
        reason: OUTCOME_LABEL[outcome],
      }
    }
    const campaignId = routed.metaId

    // Anti-doublon : même téléphone ou email déjà présent chez ce client
    // (jamais pour un test GHL : chaque clic « Tester » ajoute une carte).
    const phone = a.phone?.trim() ?? ''
    const email = a.email?.trim().toLowerCase() || undefined
    const dup = a.test
      ? null
      : await findDuplicate(ctx, client.slug, phone, email)
    if (dup) {
      const patch: { ghlContactId?: string; campaignId?: string } = {}
      if (!dup.ghlContactId && a.ghlContactId)
        patch.ghlContactId = a.ghlContactId
      if (!dup.campaignId) patch.campaignId = campaignId
      if (Object.keys(patch).length) await ctx.db.patch(dup._id, patch)
      await recordWebhook(ctx, client, 'duplicate', name)
      await log(
        'duplicate',
        `même téléphone ou email que « ${dup.name} »`,
        campaignId,
      )
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
      a.test ? 'test' : 'imported',
      routed.created ? `${name} · nouvelle campagne détectée` : name,
    )
    await log(
      a.test ? 'test' : 'imported',
      routed.created ? `${name} · nouvelle campagne détectée` : name,
      campaignId,
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
  // Bouton « Tester » d'un workflow GHL : valeurs factices du type
  // « <test lead: dummy data for full_name> ».
  const isGhlTest = /dummy data|<test lead/i.test(
    [name, phone, email].join(' '),
  )

  // `campaign` / `campaign_id` dans le corps = solution de repli si GHL
  // n'envoie pas les paramètres de l'adresse (champ « Custom data »).
  const bodyCampaign = (
    str(body.campaignId) ||
    str(body.campaign_id) ||
    str(body.campaign)
  ).replace(/\D/g, '')
  let campaignId =
    bodyCampaign || forcedCampaign || attributedCampaign(attr).id
  let campaignName =
    str(body.campaignName) ||
    str(body.campaign_name) ||
    attributedCampaign(attr).name

  // Payload GHL sans attribution : on relit la fiche contact par l'API
  // (le workflow n'embarque pas toujours attributionSource).
  if (!campaignId && ghlContactId && !isGhlTest) {
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

  // Données factices de GHL (« <test lead: dummy data for phone> »…) :
  // remplacées par un nom lisible et daté, sans téléphone ni email.
  const testName = `Test GHL ${new Date().toLocaleString('fr-FR', {
    timeZone: 'Indian/Reunion',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`

  const result = await ctx.runMutation(internal.leads.ingest, {
    key,
    name: isGhlTest ? testName : name || phone || email,
    phone: isGhlTest ? undefined : phone || undefined,
    email: isGhlTest ? undefined : email || undefined,
    source: isGhlTest
      ? 'Test GHL'
      : str(body.source) || (hasAttr ? ghl.source : undefined),
    medium:
      str(body.medium) ||
      str(body.utm_medium) ||
      (hasAttr ? ghl.medium : undefined),
    campaignId: campaignId || undefined,
    campaignName: campaignName || undefined,
    date: str(body.date) || str(body.date_created) || undefined,
    ghlContactId: isGhlTest ? undefined : ghlContactId,
    test: isGhlTest || undefined,
    campaignParam: forcedCampaign || undefined,
    bodyCampaign: bodyCampaign || undefined,
    hasAttribution: hasAttr,
    userAgent: req.headers.get('user-agent')?.slice(0, 120) ?? undefined,
  })
  if (!result.ok) return json(result, 401)
  return json(result, 'skipped' in result ? 200 : 201)
})
