/**
 * Synchro GoHighLevel → Tracify : chaque campagne peut être rattachée à un
 * sous-compte GHL ; ses nouveaux contacts sont récupérés toutes les 10 min
 * (API contacts/search, filtre dateAdded) et déposés dans le CRM de la
 * campagne, sans rien configurer côté GHL.
 * Token d'intégration privée (PIT) dans l'env Convex :
 *   GHL_PRIVATE_INTEGRATION_TOKEN (par défaut) ou GHL_TOKEN_<locationId>.
 */
import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { requireUser } from './guard'
import { findDuplicate } from './prospects'

const BASE_URL = 'https://services.leadconnectorhq.com'
const API_VERSION = '2021-07-28'
const PAGE = 100
const MAX_PAGES = 20
// Première synchro : on remonte 7 jours en arrière.
const INITIAL_WINDOW_MS = 7 * 86_400_000
// Recouvrement entre deux passages (contacts créés pendant la synchro).
const OVERLAP_MS = 2 * 3_600_000

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
const obj = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {}

// Libellé lisible de la provenance à partir de l'attribution GHL
// (contact.source est vide la plupart du temps ; le vrai canal est dans
// attributionSource.medium / sessionSource).
export function describeAttribution(
  attr: Record<string, unknown>,
  tags: Array<string>,
  contactSource?: string,
): { source: string; medium: string } {
  const medium = str(attr.medium).toLowerCase()
  const session = str(attr.sessionSource)
  const paid = /paid/i.test(session)
  const lowerTags = tags.map((t) => t.toLowerCase())

  let source: string
  if (contactSource) source = contactSource
  else if (lowerTags.includes('simulateur')) source = 'Simulateur'
  else if (medium === 'facebook') source = paid ? 'Pub Facebook' : 'Facebook'
  else if (medium === 'instagram') source = paid ? 'Pub Instagram' : 'Instagram'
  else if (medium === 'whatsapp') source = 'WhatsApp'
  else if (medium === 'form' || medium === 'survey') source = 'Formulaire'
  else if (medium === 'manual' && /workflow/i.test(session))
    source = 'Workflow GHL'
  else if (medium === 'manual') source = 'Saisie GHL'
  else if (session) source = session
  else if (medium) source = medium
  else source = 'GHL'

  return { source, medium: session || medium || '—' }
}

function tokenFor(locationId: string): string | undefined {
  return (
    process.env[`GHL_TOKEN_${locationId}`] ??
    process.env.GHL_PRIVATE_INTEGRATION_TOKEN
  )
}

interface GhlContact {
  id: string
  firstName?: string
  lastName?: string
  contactName?: string
  phone?: string | null
  email?: string | null
  dateAdded?: string
  source?: string | null
  tags?: Array<string>
  attributionSource?: Record<string, unknown>
  lastAttributionSource?: Record<string, unknown>
  searchAfter?: Array<unknown>
}

async function searchContacts(
  token: string,
  locationId: string,
  sinceIso: string,
  searchAfter?: Array<unknown>,
): Promise<{ contacts: Array<GhlContact>; total: number }> {
  const res = await fetch(`${BASE_URL}/contacts/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      locationId,
      pageLimit: PAGE,
      filters: [
        { field: 'dateAdded', operator: 'range', value: { gt: sinceIso } },
      ],
      sort: [{ field: 'dateAdded', direction: 'asc' }],
      ...(searchAfter ? { searchAfter } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      `GHL ${res.status} : ${str(data.message) || str(data.error) || 'erreur inconnue'}`,
    )
  }
  return {
    contacts: Array.isArray(data.contacts)
      ? (data.contacts as Array<GhlContact>)
      : [],
    total: typeof data.total === 'number' ? data.total : 0,
  }
}

// --- Côté admin (page campagne) --------------------------------------------

async function campaignByMeta(
  ctx: { db: MutationCtx['db'] } | { db: QueryCtx['db'] },
  metaId: string,
) {
  return await ctx.db
    .query('campaigns')
    .withIndex('by_meta', (q) => q.eq('metaId', metaId))
    .unique()
}

// État de la synchro d'une campagne + nombre de prospects venus de GHL.
export const campaignStatus = query({
  args: { metaId: v.string() },
  handler: async (ctx, { metaId }) => {
    await requireUser(ctx)
    const campaign = await campaignByMeta(ctx, metaId)
    if (!campaign) return null
    const prospects = await ctx.db
      .query('prospects')
      .withIndex('by_campaign', (q) => q.eq('campaignId', metaId))
      .collect()
    return {
      ghl: campaign.ghlLocationId
        ? {
            locationId: campaign.ghlLocationId,
            lastSyncAt: campaign.ghlLastSyncAt ?? null,
            error: campaign.ghlSyncError ?? null,
          }
        : null,
      fromGhl: prospects.filter((p) => p.ghlContactId).length,
    }
  },
})

async function patchLocation(
  ctx: MutationCtx,
  metaId: string,
  locationId: string,
) {
  const campaign = await campaignByMeta(ctx, metaId)
  if (!campaign) throw new Error('Campagne introuvable.')
  await ctx.db.patch(campaign._id, {
    ghlLocationId: locationId.trim() || undefined,
    ghlLastSyncAt: undefined,
    ghlSyncError: undefined,
  })
}

// Rattache (ou détache avec une chaîne vide) le sous-compte GHL d'une campagne.
export const setLocation = mutation({
  args: { metaId: v.string(), locationId: v.string() },
  handler: async (ctx, { metaId, locationId }) => {
    await requireUser(ctx)
    await patchLocation(ctx, metaId, locationId)
  },
})

// Outil CLI : `npx convex run ghl:setLocationCli '{"metaId":"…","locationId":"…"}'`
export const setLocationCli = internalMutation({
  args: { metaId: v.string(), locationId: v.string() },
  handler: async (ctx, { metaId, locationId }) => {
    await patchLocation(ctx, metaId, locationId)
  },
})

// Migration 18/08 : rattache à une campagne les prospects du client qui n'en
// ont pas (leads GHL/webhook arrivés avant la synchro par campagne).
export const attachUnassignedCli = internalMutation({
  args: { clientSlug: v.string(), metaId: v.string() },
  handler: async (ctx, { clientSlug, metaId }) => {
    const campaign = await campaignByMeta(ctx, metaId)
    if (!campaign || campaign.clientSlug !== clientSlug)
      throw new Error('Campagne introuvable pour ce client.')
    const rows = await ctx.db
      .query('prospects')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    let n = 0
    for (const p of rows) {
      if (p.campaignId) continue
      await ctx.db.patch(p._id, { campaignId: metaId })
      n++
    }
    // Nettoyage de l'ancien rattachement client.
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (client?.ghlLocationId)
      await ctx.db.patch(client._id, {
        ghlLocationId: undefined,
        ghlLastSyncAt: undefined,
        ghlSyncError: undefined,
      })
    return { attached: n }
  },
})

// Bouton « Synchroniser maintenant » sur la page campagne.
export const syncNow = action({
  args: { metaId: v.string() },
  handler: async (ctx, { metaId }): Promise<SyncResult> => {
    await requireUser(ctx)
    return await ctx.runAction(internal.ghl.syncCampaign, { metaId })
  },
})

// --- Synchro ---------------------------------------------------------------

export const campaignsWithGhl = internalQuery({
  args: {},
  handler: async (ctx) => {
    const campaigns = await ctx.db.query('campaigns').collect()
    return campaigns
      .filter((c) => c.ghlLocationId)
      .map((c) => ({
        metaId: c.metaId,
        clientSlug: c.clientSlug,
        locationId: c.ghlLocationId!,
        lastSyncAt: c.ghlLastSyncAt ?? null,
      }))
  },
})

export const markSync = internalMutation({
  args: {
    metaId: v.string(),
    at: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { metaId, at, error }) => {
    const campaign = await campaignByMeta(ctx, metaId)
    if (!campaign) return
    await ctx.db.patch(campaign._id, {
      // En cas d'erreur on garde l'ancien curseur pour ré-essayer la fenêtre.
      ...(error ? {} : { ghlLastSyncAt: at }),
      ghlSyncError: error,
    })
  },
})

// Dépose un contact GHL dans le CRM de la campagne (idempotent : ID GHL,
// puis téléphone/email). Retourne 'inserted' | 'duplicate'.
export const upsertContact = internalMutation({
  args: {
    clientSlug: v.string(),
    metaId: v.string(),
    contact: v.object({
      id: v.string(),
      name: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
      dateAdded: v.string(),
      source: v.string(),
      medium: v.string(),
      // Campagne Meta indiquée par l'attribution GHL (lead ads), si connue
      attributedCampaignId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { clientSlug, metaId, contact }) => {
    const known = await ctx.db
      .query('prospects')
      .withIndex('by_ghl', (q) => q.eq('ghlContactId', contact.id))
      .first()
    if (known) return 'duplicate' as const

    const dup = await findDuplicate(
      ctx,
      clientSlug,
      contact.phone,
      contact.email,
    )
    if (dup) {
      const patch: { ghlContactId?: string; campaignId?: string } = {}
      if (!dup.ghlContactId) patch.ghlContactId = contact.id
      if (!dup.campaignId) patch.campaignId = metaId
      if (Object.keys(patch).length) await ctx.db.patch(dup._id, patch)
      return 'duplicate' as const
    }

    // Par défaut le lead va dans la campagne synchronisée ; si l'attribution
    // GHL désigne une autre campagne du même client, on la respecte.
    let campaignId = metaId
    if (
      contact.attributedCampaignId &&
      contact.attributedCampaignId !== metaId
    ) {
      const other = await campaignByMeta(ctx, contact.attributedCampaignId)
      if (other?.clientSlug === clientSlug) campaignId = other.metaId
    }

    await ctx.db.insert('prospects', {
      clientSlug,
      campaignId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      date: contact.dateAdded.slice(0, 10),
      source: contact.source,
      medium: contact.medium,
      status: 'new',
      viaWebhook: true,
      ghlContactId: contact.id,
      history: [{ status: 'new', at: contact.dateAdded, by: 'ghl' }],
      // Date d'arrivée réelle chez GHL (sert au badge « nouveau »).
      createdAt: contact.dateAdded,
    })
    return 'inserted' as const
  },
})

export interface SyncResult {
  ok: boolean
  inserted: number
  duplicates: number
  skipped: number
  scanned: number
  error?: string
}

export const syncCampaign = internalAction({
  args: { metaId: v.string() },
  handler: async (ctx, { metaId }): Promise<SyncResult> => {
    const campaigns = await ctx.runQuery(internal.ghl.campaignsWithGhl, {})
    const campaign = campaigns.find((c) => c.metaId === metaId)
    const empty = { inserted: 0, duplicates: 0, skipped: 0, scanned: 0 }
    if (!campaign)
      return { ok: false, ...empty, error: 'Aucun sous-compte GHL rattaché.' }

    const token = tokenFor(campaign.locationId)
    if (!token) {
      const error = 'Token GHL manquant (GHL_PRIVATE_INTEGRATION_TOKEN).'
      await ctx.runMutation(internal.ghl.markSync, {
        metaId,
        at: new Date().toISOString(),
        error,
      })
      return { ok: false, ...empty, error }
    }

    const startedAt = new Date().toISOString()
    const since = campaign.lastSyncAt
      ? new Date(Date.parse(campaign.lastSyncAt) - OVERLAP_MS)
      : new Date(Date.now() - INITIAL_WINDOW_MS)

    const counts = { ...empty }
    try {
      let searchAfter: Array<unknown> | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const { contacts } = await searchContacts(
          token,
          campaign.locationId,
          since.toISOString(),
          searchAfter,
        )
        for (const c of contacts) {
          counts.scanned++
          const phone = str(c.phone)
          const email = str(c.email).toLowerCase() || undefined
          // Sans téléphone ni email (conversation Messenger anonyme…) : on ne
          // crée pas de prospect injoignable.
          if (!phone && !email) {
            counts.skipped++
            continue
          }
          const name =
            [str(c.firstName), str(c.lastName)].filter(Boolean).join(' ') ||
            str(c.contactName) ||
            phone ||
            email!
          const attr = {
            ...obj(c.lastAttributionSource),
            ...obj(c.attributionSource),
          }
          const tags = Array.isArray(c.tags)
            ? c.tags.filter((t): t is string => typeof t === 'string')
            : []
          const { source, medium } = describeAttribution(
            attr,
            tags,
            str(c.source) || undefined,
          )
          const result = await ctx.runMutation(internal.ghl.upsertContact, {
            clientSlug: campaign.clientSlug,
            metaId,
            contact: {
              id: c.id,
              name,
              phone,
              email,
              dateAdded: str(c.dateAdded) || startedAt,
              source,
              medium,
              attributedCampaignId: str(attr.campaignId) || undefined,
            },
          })
          if (result === 'inserted') counts.inserted++
          else counts.duplicates++
        }
        if (contacts.length < PAGE) break
        searchAfter = contacts[contacts.length - 1]?.searchAfter
        if (!searchAfter) break
      }
      await ctx.runMutation(internal.ghl.markSync, { metaId, at: startedAt })
      return { ok: true, ...counts }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await ctx.runMutation(internal.ghl.markSync, {
        metaId,
        at: startedAt,
        error,
      })
      return { ok: false, ...counts, error }
    }
  },
})

// Cron : toutes les campagnes rattachées à un sous-compte GHL.
export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const campaigns = await ctx.runQuery(internal.ghl.campaignsWithGhl, {})
    for (const c of campaigns) {
      await ctx.runAction(internal.ghl.syncCampaign, { metaId: c.metaId })
    }
  },
})
