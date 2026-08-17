/**
 * Synchro GoHighLevel → Tracify : les nouveaux contacts du sous-compte GHL
 * d'un client sont récupérés toutes les 10 min (API contacts/search, filtre
 * dateAdded) et déposés dans son pipeline, sans rien configurer côté GHL.
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
} from './_generated/server'
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

// --- Côté admin -------------------------------------------------------------

// Rattache (ou détache avec une chaîne vide) le sous-compte GHL d'un client.
export const setLocation = mutation({
  args: { clientSlug: v.string(), locationId: v.string() },
  handler: async (ctx, { clientSlug, locationId }) => {
    await requireUser(ctx)
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (!client) throw new Error('Client introuvable.')
    const id = locationId.trim()
    await ctx.db.patch(client._id, {
      ghlLocationId: id || undefined,
      ghlLastSyncAt: undefined,
      ghlSyncError: undefined,
    })
  },
})

// Outil CLI : `npx convex run ghl:setLocationCli '{"clientSlug":"…","locationId":"…"}'`
export const setLocationCli = internalMutation({
  args: { clientSlug: v.string(), locationId: v.string() },
  handler: async (ctx, { clientSlug, locationId }) => {
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (!client) throw new Error('Client introuvable.')
    await ctx.db.patch(client._id, {
      ghlLocationId: locationId.trim() || undefined,
      ghlLastSyncAt: undefined,
      ghlSyncError: undefined,
    })
  },
})

// Bouton « Synchroniser maintenant » sur la fiche client.
export const syncNow = action({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }): Promise<SyncResult> => {
    await requireUser(ctx)
    return await ctx.runAction(internal.ghl.syncClient, { clientSlug })
  },
})

// --- Synchro ---------------------------------------------------------------

export const clientsWithGhl = internalQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect()
    return clients
      .filter((c) => c.ghlLocationId)
      .map((c) => ({
        slug: c.slug,
        locationId: c.ghlLocationId!,
        lastSyncAt: c.ghlLastSyncAt ?? null,
      }))
  },
})

export const markSync = internalMutation({
  args: {
    clientSlug: v.string(),
    at: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { clientSlug, at, error }) => {
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (!client) return
    await ctx.db.patch(client._id, {
      // En cas d'erreur on garde l'ancien curseur pour ré-essayer la fenêtre.
      ...(error ? {} : { ghlLastSyncAt: at }),
      ghlSyncError: error,
    })
  },
})

// Dépose un contact GHL dans le pipeline (idempotent : ID GHL, puis
// téléphone/email). Retourne 'inserted' | 'duplicate' | 'skipped'.
export const upsertContact = internalMutation({
  args: {
    clientSlug: v.string(),
    contact: v.object({
      id: v.string(),
      name: v.string(),
      phone: v.string(),
      email: v.optional(v.string()),
      dateAdded: v.string(),
      source: v.string(),
      medium: v.string(),
      campaignId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { clientSlug, contact }) => {
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
      if (!dup.ghlContactId)
        await ctx.db.patch(dup._id, { ghlContactId: contact.id })
      return 'duplicate' as const
    }

    // Campagne Meta rattachée seulement si elle appartient au client.
    let campaignId: string | undefined
    if (contact.campaignId) {
      const campaign = await ctx.db
        .query('campaigns')
        .withIndex('by_meta', (q) => q.eq('metaId', contact.campaignId!))
        .unique()
      if (campaign?.clientSlug === clientSlug) campaignId = campaign.metaId
    }

    const now = new Date().toISOString()
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
      createdAt: contact.dateAdded || now,
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

export const syncClient = internalAction({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }): Promise<SyncResult> => {
    const clients = await ctx.runQuery(internal.ghl.clientsWithGhl, {})
    const client = clients.find((c) => c.slug === clientSlug)
    const empty = { inserted: 0, duplicates: 0, skipped: 0, scanned: 0 }
    if (!client)
      return { ok: false, ...empty, error: 'Aucun sous-compte GHL rattaché.' }

    const token = tokenFor(client.locationId)
    if (!token) {
      const error = 'Token GHL manquant (GHL_PRIVATE_INTEGRATION_TOKEN).'
      await ctx.runMutation(internal.ghl.markSync, {
        clientSlug,
        at: new Date().toISOString(),
        error,
      })
      return { ok: false, ...empty, error }
    }

    const startedAt = new Date().toISOString()
    const since = client.lastSyncAt
      ? new Date(Date.parse(client.lastSyncAt) - OVERLAP_MS)
      : new Date(Date.now() - INITIAL_WINDOW_MS)

    const counts = { ...empty }
    try {
      let searchAfter: Array<unknown> | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const { contacts } = await searchContacts(
          token,
          client.locationId,
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
            clientSlug,
            contact: {
              id: c.id,
              name,
              phone,
              email,
              dateAdded: str(c.dateAdded) || startedAt,
              source,
              medium,
              campaignId: str(attr.campaignId) || undefined,
            },
          })
          if (result === 'inserted') counts.inserted++
          else counts.duplicates++
        }
        if (contacts.length < PAGE) break
        searchAfter = contacts[contacts.length - 1]?.searchAfter
        if (!searchAfter) break
      }
      await ctx.runMutation(internal.ghl.markSync, {
        clientSlug,
        at: startedAt,
      })
      return { ok: true, ...counts }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await ctx.runMutation(internal.ghl.markSync, {
        clientSlug,
        at: startedAt,
        error,
      })
      return { ok: false, ...counts, error }
    }
  },
})

// Cron : tous les clients rattachés à un sous-compte GHL.
export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.runQuery(internal.ghl.clientsWithGhl, {})
    for (const c of clients) {
      await ctx.runAction(internal.ghl.syncClient, { clientSlug: c.slug })
    }
  },
})
