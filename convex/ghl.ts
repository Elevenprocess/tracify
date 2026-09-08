/**
 * Synchro GoHighLevel → Tracify : chaque campagne peut être rattachée à un
 * sous-compte GHL ; ses nouveaux contacts sont récupérés toutes les 10 min
 * (API contacts/search, filtre dateAdded), sans rien configurer côté GHL.
 * Chaque contact est rangé dans la campagne Meta de son attribution GHL
 * (créée si nouvelle, voir convex/routing.ts) ; sans attribution il est
 * ignoré. Complément du webhook (convex/leads.ts), idempotent avec lui.
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
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { requireUser } from './guard'
import { findDuplicate } from './prospects'
import { routeToCampaign } from './routing'

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

// Token statique connu pour un sous-compte : GHL_TOKEN_<locationId> (intégration
// privée créée dans ce sous-compte) sinon le token par défaut (ECOI).
export function tokenFor(locationId: string): string | undefined {
  return (
    (locationId ? process.env[`GHL_TOKEN_${locationId}`] : undefined) ??
    process.env.GHL_PRIVATE_INTEGRATION_TOKEN
  )
}

// Marge avant expiration d'un accès sous-compte généré (GHL donne ~24 h).
const TOKEN_MARGIN_MS = 10 * 60_000

// Token à utiliser pour un sous-compte, dans l'ordre :
//  1. GHL_TOKEN_<locationId> (intégration privée du sous-compte) ;
//  2. GHL_AGENCY_TOKEN (intégration privée AGENCE, scope oauth.write) : accès
//     au sous-compte généré via /oauth/locationToken et mis en cache ;
//  3. GHL_PRIVATE_INTEGRATION_TOKEN (token par défaut, sous-compte ECOI).
export async function resolveToken(
  ctx: ActionCtx,
  locationId: string,
): Promise<string | undefined> {
  const dedicated = locationId
    ? process.env[`GHL_TOKEN_${locationId}`]
    : undefined
  if (dedicated) return dedicated

  const agency = process.env.GHL_AGENCY_TOKEN
  if (agency && locationId) {
    const cached = await ctx.runQuery(internal.ghl.cachedLocationToken, {
      locationId,
    })
    if (cached) return cached
    try {
      const minted = await mintLocationToken(agency, locationId)
      await ctx.runMutation(internal.ghl.storeLocationToken, {
        locationId,
        token: minted.token,
        expiresAt: minted.expiresAt,
      })
      return minted.token
    } catch (e) {
      console.error(`Accès agence au sous-compte ${locationId} refusé :`, e)
    }
  }
  return process.env.GHL_PRIVATE_INTEGRATION_TOKEN
}

async function ghlGet(token: string, path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok)
    throw new Error(
      `GHL ${res.status} sur ${path} : ${str(data.message) || str(data.error) || 'erreur inconnue'}`,
    )
  return data
}

// POST /oauth/locationToken : le token agence génère un accès au sous-compte.
// companyId = GHL_AGENCY_COMPANY_ID sinon lu sur la fiche du sous-compte.
async function mintLocationToken(
  agencyToken: string,
  locationId: string,
): Promise<{ token: string; expiresAt: string }> {
  let companyId = process.env.GHL_AGENCY_COMPANY_ID ?? ''
  if (!companyId) {
    const loc = await ghlGet(agencyToken, `/locations/${locationId}`)
    companyId = str(obj(loc.location).companyId)
    if (!companyId)
      throw new Error(
        'companyId introuvable : renseigne GHL_AGENCY_COMPANY_ID (ID de l’agence) dans Convex.',
      )
  }
  const res = await fetch(`${BASE_URL}/oauth/locationToken`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${agencyToken}`,
      Version: API_VERSION,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ companyId, locationId }).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !str(data.access_token))
    throw new Error(
      `GHL ${res.status} sur /oauth/locationToken : ${str(data.message) || str(data.error) || 'erreur inconnue'} (le token agence a-t-il le scope oauth.write ?)`,
    )
  const ttl =
    typeof data.expires_in === 'number' ? data.expires_in * 1000 : 86_400_000
  return {
    token: str(data.access_token),
    expiresAt: new Date(Date.now() + ttl - TOKEN_MARGIN_MS).toISOString(),
  }
}

export const cachedLocationToken = internalQuery({
  args: { locationId: v.string() },
  handler: async (ctx, { locationId }) => {
    const row = await ctx.db
      .query('ghlLocationTokens')
      .withIndex('by_location', (q) => q.eq('locationId', locationId))
      .unique()
    if (!row || row.expiresAt <= new Date().toISOString()) return null
    return row.token
  },
})

export const storeLocationToken = internalMutation({
  args: { locationId: v.string(), token: v.string(), expiresAt: v.string() },
  handler: async (ctx, { locationId, token, expiresAt }) => {
    const row = await ctx.db
      .query('ghlLocationTokens')
      .withIndex('by_location', (q) => q.eq('locationId', locationId))
      .unique()
    if (row) await ctx.db.patch(row._id, { token, expiresAt })
    else
      await ctx.db.insert('ghlLocationTokens', { locationId, token, expiresAt })
  },
})

// Fiche complète d'un contact (attribution incluse) — sert au webhook quand
// le payload GHL n'embarque pas l'attribution.
export async function fetchContact(
  token: string,
  contactId: string,
): Promise<GhlContact | null> {
  const res = await fetch(`${BASE_URL}/contacts/${contactId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Version: API_VERSION,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const contact = obj(data.contact)
  return contact.id ? (contact as unknown as GhlContact) : null
}

// Campagne Meta désignée par l'attribution GHL d'un contact (lead ads) :
// campaignId = ID de campagne Meta, campaign = son nom.
export function attributedCampaign(attr: Record<string, unknown>): {
  id?: string
  name?: string
} {
  return {
    id: str(attr.campaignId) || undefined,
    name: str(attr.campaign) || str(attr.utmCampaign) || undefined,
  }
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
    const message = str(data.message) || str(data.error) || 'erreur inconnue'
    if (res.status === 403 || res.status === 401)
      throw new Error(
        `Le token GHL n'a pas accès à ce sous-compte (${res.status}). Enregistre dans Convex soit le token de l'intégration privée AGENCE (GHL_AGENCY_TOKEN, scopes Contacts lecture + OAuth écriture), soit une intégration privée créée dans ce sous-compte (GHL_TOKEN_${locationId}).`,
      )
    throw new Error(`GHL ${res.status} : ${message}`)
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
    // Conservé pour compatibilité : l'aiguillage se fait par attribution.
    metaId: v.optional(v.string()),
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
      attributedCampaignName: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { clientSlug, contact }) => {
    const known = await ctx.db
      .query('prospects')
      .withIndex('by_ghl', (q) => q.eq('ghlContactId', contact.id))
      .first()
    if (known) return 'duplicate' as const

    // Le lead va dans la campagne de son attribution Meta (créée si
    // nouvelle) — jamais dans la campagne synchronisée « par défaut ».
    const routed = await routeToCampaign(
      ctx,
      clientSlug,
      contact.attributedCampaignId,
      contact.attributedCampaignName,
    )
    if (routed.kind !== 'campaign') return 'no-campaign' as const
    const campaignId = routed.metaId

    const dup = await findDuplicate(
      ctx,
      clientSlug,
      contact.phone,
      contact.email,
    )
    if (dup) {
      const patch: { ghlContactId?: string; campaignId?: string } = {}
      if (!dup.ghlContactId) patch.ghlContactId = contact.id
      if (!dup.campaignId) patch.campaignId = campaignId
      if (Object.keys(patch).length) await ctx.db.patch(dup._id, patch)
      return 'duplicate' as const
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
  // Sans téléphone ni email
  skipped: number
  // Sans campagne Meta dans l'attribution (simulateur, workflows, saisie…)
  noCampaign: number
  scanned: number
  error?: string
}

// Parcourt les contacts d'un sous-compte créés depuis `since` et les dépose
// (aiguillage par attribution). Partagé par la synchro par campagne (legacy)
// et la synchro par client.
async function scanLocation(
  ctx: ActionCtx,
  args: {
    clientSlug: string
    locationId: string
    token: string
    since: Date
    startedAt: string
  },
): Promise<Omit<SyncResult, 'ok' | 'error'>> {
  const counts = {
    inserted: 0,
    duplicates: 0,
    skipped: 0,
    noCampaign: 0,
    scanned: 0,
  }
  let searchAfter: Array<unknown> | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const { contacts } = await searchContacts(
      args.token,
      args.locationId,
      args.since.toISOString(),
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
      const attributed = attributedCampaign(attr)
      // Sans campagne : inutile d'ouvrir une transaction.
      if (!attributed.id) {
        counts.noCampaign++
        continue
      }
      const result = await ctx.runMutation(internal.ghl.upsertContact, {
        clientSlug: args.clientSlug,
        contact: {
          id: c.id,
          name,
          phone,
          email,
          dateAdded: str(c.dateAdded) || args.startedAt,
          source,
          medium,
          attributedCampaignId: attributed.id,
          attributedCampaignName: attributed.name,
        },
      })
      if (result === 'inserted') counts.inserted++
      else if (result === 'no-campaign') counts.noCampaign++
      else counts.duplicates++
    }
    if (contacts.length < PAGE) break
    searchAfter = contacts[contacts.length - 1]?.searchAfter
    if (!searchAfter) break
  }
  return counts
}

export const syncCampaign = internalAction({
  args: { metaId: v.string() },
  handler: async (ctx, { metaId }): Promise<SyncResult> => {
    const campaigns = await ctx.runQuery(internal.ghl.campaignsWithGhl, {})
    const campaign = campaigns.find((c) => c.metaId === metaId)
    const empty = {
      inserted: 0,
      duplicates: 0,
      skipped: 0,
      noCampaign: 0,
      scanned: 0,
    }
    if (!campaign)
      return { ok: false, ...empty, error: 'Aucun sous-compte GHL rattaché.' }

    const token = await resolveToken(ctx, campaign.locationId)
    if (!token) {
      const error =
        'Token GHL manquant (GHL_AGENCY_TOKEN ou GHL_PRIVATE_INTEGRATION_TOKEN).'
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

    try {
      const counts = await scanLocation(ctx, {
        clientSlug: campaign.clientSlug,
        locationId: campaign.locationId,
        token,
        since,
        startedAt,
      })
      await ctx.runMutation(internal.ghl.markSync, { metaId, at: startedAt })
      return { ok: true, ...counts }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await ctx.runMutation(internal.ghl.markSync, {
        metaId,
        at: startedAt,
        error,
      })
      return { ok: false, ...empty, error }
    }
  },
})

// --- Synchro par client (sous-compte GHL rattaché au client) ---------------
//
// Au branchement du webhook on renseigne le sous-compte GHL du client :
// « Détecter maintenant » relit les contacts des 90 derniers jours pour
// créer les campagnes, rattacher le compte publicitaire et importer les
// prospects déjà attribués — sans attendre le premier lead. Ensuite le cron
// relit les nouveaux contacts toutes les 10 min (curseur clients.ghlLastSyncAt).

const BOOTSTRAP_WINDOW_DAYS = 90

export const clientGhl = internalQuery({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (!client?.ghlLocationId) return null
    return {
      locationId: client.ghlLocationId,
      lastSyncAt: client.ghlLastSyncAt ?? null,
    }
  },
})

export const clientsWithGhl = internalQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect()
    return clients
      .filter((c) => c.ghlLocationId)
      .map((c) => ({ clientSlug: c.slug, locationId: c.ghlLocationId! }))
  },
})

export const markClientSync = internalMutation({
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
      ...(error ? {} : { ghlLastSyncAt: at }),
      ghlSyncError: error,
    })
  },
})

async function patchClientLocation(
  ctx: MutationCtx,
  clientSlug: string,
  locationId: string,
) {
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
}

// Rattache (ou détache avec une chaîne vide) le sous-compte GHL du client.
export const setClientLocation = mutation({
  args: { clientSlug: v.string(), locationId: v.string() },
  handler: async (ctx, { clientSlug, locationId }) => {
    await requireUser(ctx)
    await patchClientLocation(ctx, clientSlug, locationId)
  },
})

// Outil CLI : `npx convex run ghl:setClientLocationCli '{"clientSlug":"…","locationId":"…"}'`
export const setClientLocationCli = internalMutation({
  args: { clientSlug: v.string(), locationId: v.string() },
  handler: async (ctx, { clientSlug, locationId }) => {
    await patchClientLocation(ctx, clientSlug, locationId)
  },
})

export const syncClient = internalAction({
  args: {
    clientSlug: v.string(),
    // Forcé (bootstrap) : relit N jours au lieu de repartir du curseur.
    windowDays: v.optional(v.number()),
  },
  handler: async (ctx, { clientSlug, windowDays }): Promise<SyncResult> => {
    const empty = {
      inserted: 0,
      duplicates: 0,
      skipped: 0,
      noCampaign: 0,
      scanned: 0,
    }
    const link = await ctx.runQuery(internal.ghl.clientGhl, { clientSlug })
    if (!link)
      return { ok: false, ...empty, error: 'Aucun sous-compte GHL rattaché.' }
    const token = await resolveToken(ctx, link.locationId)
    const startedAt = new Date().toISOString()
    if (!token) {
      const error =
        'Token GHL manquant (GHL_AGENCY_TOKEN ou GHL_PRIVATE_INTEGRATION_TOKEN).'
      await ctx.runMutation(internal.ghl.markClientSync, {
        clientSlug,
        at: startedAt,
        error,
      })
      return { ok: false, ...empty, error }
    }
    const since = windowDays
      ? new Date(Date.now() - windowDays * 86_400_000)
      : link.lastSyncAt
        ? new Date(Date.parse(link.lastSyncAt) - OVERLAP_MS)
        : new Date(Date.now() - INITIAL_WINDOW_MS)
    try {
      const counts = await scanLocation(ctx, {
        clientSlug,
        locationId: link.locationId,
        token,
        since,
        startedAt,
      })
      await ctx.runMutation(internal.ghl.markClientSync, {
        clientSlug,
        at: startedAt,
      })
      return { ok: true, ...counts }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await ctx.runMutation(internal.ghl.markClientSync, {
        clientSlug,
        at: startedAt,
        error,
      })
      return { ok: false, ...empty, error }
    }
  },
})

// Sous-comptes de l'agence (token GHL_AGENCY_TOKEN) pour choisir le client
// dans une liste au lieu de recopier un Location ID. Vide sans token agence.
export const agencyLocations = action({
  args: {},
  handler: async (ctx): Promise<Array<{ id: string; name: string }>> => {
    await requireUser(ctx)
    const agency = process.env.GHL_AGENCY_TOKEN
    if (!agency) return []
    const companyId = process.env.GHL_AGENCY_COMPANY_ID ?? ''
    const out: Array<{ id: string; name: string }> = []
    for (let skip = 0; skip < 1000; skip += 100) {
      const qs = new URLSearchParams({ limit: '100', skip: String(skip) })
      if (companyId) qs.set('companyId', companyId)
      let data: Record<string, unknown>
      try {
        data = await ghlGet(agency, `/locations/search?${qs}`)
      } catch (e) {
        console.error('Liste des sous-comptes agence en échec :', e)
        break
      }
      const rows = Array.isArray(data.locations)
        ? (data.locations as Array<Record<string, unknown>>)
        : []
      for (const l of rows) {
        const id = str(l.id)
        if (id) out.push({ id, name: str(l.name) || id })
      }
      if (rows.length < 100) break
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  },
})

// Bouton « Détecter maintenant » (fiche client) : enregistre le sous-compte
// puis relit 90 jours de contacts. Le rattachement du compte publicitaire
// est déclenché par l'aiguillage (routing.ts) sur la première campagne vue.
export const detectNow = action({
  args: { clientSlug: v.string(), locationId: v.string() },
  handler: async (ctx, { clientSlug, locationId }): Promise<SyncResult> => {
    await requireUser(ctx)
    const cleaned = locationId.trim()
    if (!cleaned) throw new Error('Location ID GHL requis.')
    await ctx.runMutation(internal.ghl.setClientLocationCli, {
      clientSlug,
      locationId: cleaned,
    })
    return await ctx.runAction(internal.ghl.syncClient, {
      clientSlug,
      windowDays: BOOTSTRAP_WINDOW_DAYS,
    })
  },
})

// Cron : sous-comptes rattachés aux clients, puis (legacy) aux campagnes —
// sauf si le client couvre déjà le même sous-compte.
export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.runQuery(internal.ghl.clientsWithGhl, {})
    for (const c of clients) {
      await ctx.runAction(internal.ghl.syncClient, { clientSlug: c.clientSlug })
    }
    const covered = new Set(
      clients.map((c) => `${c.clientSlug}:${c.locationId}`),
    )
    const campaigns = await ctx.runQuery(internal.ghl.campaignsWithGhl, {})
    for (const c of campaigns) {
      if (covered.has(`${c.clientSlug}:${c.locationId}`)) continue
      await ctx.runAction(internal.ghl.syncCampaign, { metaId: c.metaId })
    }
  },
})
