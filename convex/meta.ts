/**
 * Sync Meta Ads par campagne — même approche que Velora (Graph API directe,
 * token utilisateur longue durée dans META_ACCESS_TOKEN, lignes quotidiennes
 * via time_increment=1), mais au niveau campagne : chaque client Tracify
 * référence simplement des IDs de campagnes Meta.
 */
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { requireUser } from './guard'

const GRAPH_BASE = 'https://graph.facebook.com/v21.0'
// 62 jours pour pouvoir comparer les 30 derniers jours aux 30 précédents.
const SYNC_WINDOW_DAYS = 62

function metaAccessToken(): string {
  const t = process.env.META_ACCESS_TOKEN
  if (!t) throw new Error('META_ACCESS_TOKEN absente sur le déploiement Convex')
  return t
}

// Types d'actions Graph comptés comme prospects, par ordre de préférence
// (on prend le premier présent pour ne pas compter deux fois le même lead).
const LEAD_ACTION_TYPES = [
  'lead',
  'leadgen_grouped',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
]

interface GraphInsightRow {
  date_start?: string
  ad_id?: string
  ad_name?: string
  spend?: string
  impressions?: string
  clicks?: string
  actions?: Array<{ action_type?: string; value?: string }>
}

function leadsFromActions(actions: GraphInsightRow['actions']): number {
  if (!actions) return 0
  for (const type of LEAD_ACTION_TYPES) {
    const hit = actions.find((a) => a.action_type === type)
    if (hit) return Number(hit.value ?? 0) || 0
  }
  return 0
}

async function fetchCampaignMeta(metaId: string) {
  const params = new URLSearchParams({
    fields: 'name,effective_status',
    access_token: metaAccessToken(),
  })
  const res = await fetch(`${GRAPH_BASE}/${metaId}?${params}`)
  if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`)
  return (await res.json()) as { name?: string; effective_status?: string }
}

async function fetchCampaignDaily(metaId: string, from: string, to: string) {
  const params = new URLSearchParams({
    fields: 'spend,actions',
    time_range: JSON.stringify({ since: from, until: to }),
    time_increment: '1',
    limit: '500',
    access_token: metaAccessToken(),
  })
  const rows: Array<{ date: string; spend: number; leads: number }> = []
  let url: string | undefined = `${GRAPH_BASE}/${metaId}/insights?${params}`
  while (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as {
      data?: Array<GraphInsightRow>
      paging?: { next?: string }
    }
    for (const r of json.data ?? []) {
      if (!r.date_start) continue
      rows.push({
        date: r.date_start,
        spend: Number(r.spend ?? 0) || 0,
        leads: leadsFromActions(r.actions),
      })
    }
    url = json.paging?.next
  }
  return rows
}

// Lignes quotidiennes par créative (level=ad).
async function fetchCampaignAdsDaily(metaId: string, from: string, to: string) {
  const params = new URLSearchParams({
    level: 'ad',
    fields: 'ad_id,ad_name,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since: from, until: to }),
    time_increment: '1',
    limit: '500',
    access_token: metaAccessToken(),
  })
  const rows: Array<{
    adId: string
    adName: string
    date: string
    spend: number
    impressions: number
    clicks: number
    leads: number
  }> = []
  let url: string | undefined = `${GRAPH_BASE}/${metaId}/insights?${params}`
  while (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as {
      data?: Array<GraphInsightRow>
      paging?: { next?: string }
    }
    for (const r of json.data ?? []) {
      if (!r.date_start || !r.ad_id) continue
      rows.push({
        adId: r.ad_id,
        adName: r.ad_name ?? r.ad_id,
        date: r.date_start,
        spend: Number(r.spend ?? 0) || 0,
        impressions: Number(r.impressions ?? 0) || 0,
        clicks: Number(r.clicks ?? 0) || 0,
        leads: leadsFromActions(r.actions),
      })
    }
    url = json.paging?.next
  }
  return rows
}

// Détails (statut + miniature) de créatives par lots de 40 via ?ids=…
async function fetchAdDetails(adIds: Array<string>) {
  const out = new Map<string, { status?: string; thumbnailUrl?: string }>()
  for (let i = 0; i < adIds.length; i += 40) {
    const batch = adIds.slice(i, i + 40)
    const params = new URLSearchParams({
      ids: batch.join(','),
      fields: 'effective_status,creative{thumbnail_url}',
      access_token: metaAccessToken(),
    })
    const res = await fetch(`${GRAPH_BASE}/?${params}`)
    if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as Record<
      string,
      | { effective_status?: string; creative?: { thumbnail_url?: string } }
      | undefined
    >
    for (const id of batch) {
      const d = json[id]
      if (d)
        out.set(id, {
          status: d.effective_status,
          thumbnailUrl: d.creative?.thumbnail_url,
        })
    }
  }
  return out
}

// Toutes les publicités d'une campagne (nom, statut, miniature), qu'elles
// aient dépensé ou non : c'est ce qui permet d'afficher les créatives d'une
// campagne en pause ou terminée.
async function fetchCampaignAds(metaId: string) {
  const params = new URLSearchParams({
    fields: 'name,effective_status,creative{thumbnail_url}',
    limit: '200',
    access_token: metaAccessToken(),
  })
  const out: Array<{
    adId: string
    name?: string
    status?: string
    thumbnailUrl?: string
  }> = []
  let url: string | undefined = `${GRAPH_BASE}/${metaId}/ads?${params}`
  while (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as {
      data?: Array<{
        id: string
        name?: string
        effective_status?: string
        creative?: { thumbnail_url?: string }
      }>
      paging?: { next?: string }
    }
    for (const a of json.data ?? [])
      out.push({
        adId: a.id,
        name: a.name,
        status: a.effective_status,
        thumbnailUrl: a.creative?.thumbnail_url,
      })
    url = json.paging?.next
  }
  return out
}

// Upsert idempotent des lignes quotidiennes d'une campagne.
export const saveDaily = internalMutation({
  args: {
    clientSlug: v.string(),
    campaignId: v.string(),
    rows: v.array(
      v.object({ date: v.string(), spend: v.number(), leads: v.number() }),
    ),
  },
  handler: async (ctx, { clientSlug, campaignId, rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query('dailyStats')
        .withIndex('by_campaign_date', (q) =>
          q.eq('campaignId', campaignId).eq('date', row.date),
        )
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, {
          spend: row.spend,
          leads: row.leads,
        })
      } else {
        await ctx.db.insert('dailyStats', {
          clientSlug,
          campaignId,
          date: row.date,
          spend: row.spend,
          leads: row.leads,
        })
      }
    }
  },
})

// Upsert des lignes quotidiennes par créative.
export const saveAdDaily = internalMutation({
  args: {
    campaignId: v.string(),
    rows: v.array(
      v.object({
        adId: v.string(),
        date: v.string(),
        spend: v.number(),
        impressions: v.number(),
        clicks: v.number(),
        leads: v.number(),
      }),
    ),
  },
  handler: async (ctx, { campaignId, rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query('adDaily')
        .withIndex('by_ad_date', (q) =>
          q.eq('adId', row.adId).eq('date', row.date),
        )
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, {
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          leads: row.leads,
        })
      } else {
        await ctx.db.insert('adDaily', { campaignId, ...row })
      }
    }
  },
})

// Upsert des fiches créatives (nom, statut, miniature).
export const upsertAds = internalMutation({
  args: {
    campaignId: v.string(),
    ads: v.array(
      v.object({
        adId: v.string(),
        name: v.optional(v.string()),
        status: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { campaignId, ads }) => {
    const now = new Date().toISOString()
    for (const ad of ads) {
      const existing = await ctx.db
        .query('ads')
        .withIndex('by_ad', (q) => q.eq('adId', ad.adId))
        .unique()
      if (existing) {
        await ctx.db.patch(existing._id, { ...ad, campaignId, updatedAt: now })
      } else {
        await ctx.db.insert('ads', { ...ad, campaignId, updatedAt: now })
      }
    }
  },
})

export const patchCampaign = internalMutation({
  args: {
    id: v.id('campaigns'),
    name: v.optional(v.string()),
    status: v.optional(v.string()),
    lastSyncedAt: v.optional(v.string()),
    syncError: v.optional(v.string()),
    clearError: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, clearError, ...fields }) => {
    const patch: Record<string, unknown> = { ...fields }
    if (clearError) patch.syncError = undefined
    await ctx.db.patch(id, patch)
  },
})

export const listAllCampaigns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('campaigns').collect()
    return all.map((c) => ({
      id: c._id,
      clientSlug: c.clientSlug,
      metaId: c.metaId,
      origin: c.origin,
    }))
  },
})

// Sync d'une campagne : nom + statut + stats quotidiennes sur 30 jours.
const ORIGIN = v.optional(v.union(v.literal('meta'), v.literal('ghl')))

export const syncCampaign = internalAction({
  args: {
    id: v.id('campaigns'),
    clientSlug: v.string(),
    metaId: v.string(),
    origin: ORIGIN,
  },
  handler: async (ctx, { id, clientSlug, metaId, origin }) => {
    const now = new Date()
    const to = now.toISOString().slice(0, 10)
    const from = new Date(now.getTime() - SYNC_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10)
    try {
      const meta = await fetchCampaignMeta(metaId)
      const rows = await fetchCampaignDaily(metaId, from, to)
      for (let i = 0; i < rows.length; i += 100) {
        await ctx.runMutation(internal.meta.saveDaily, {
          clientSlug,
          campaignId: metaId,
          rows: rows.slice(i, i + 100),
        })
      }

      // Niveau créative : lignes quotidiennes + fiches (statut, miniature)
      const adRows = await fetchCampaignAdsDaily(metaId, from, to)
      for (let i = 0; i < adRows.length; i += 100) {
        await ctx.runMutation(internal.meta.saveAdDaily, {
          campaignId: metaId,
          rows: adRows.slice(i, i + 100).map(({ adName: _adName, ...r }) => r),
        })
      }
      // Fiches créatives : la liste complète des publicités de la campagne
      // (même sans dépense), complétée par celles vues dans les stats.
      const adsById = new Map<
        string,
        { adId: string; name?: string; status?: string; thumbnailUrl?: string }
      >()
      for (const a of await fetchCampaignAds(metaId)) adsById.set(a.adId, a)
      const missing: Array<string> = []
      for (const r of adRows) {
        if (adsById.has(r.adId)) continue
        adsById.set(r.adId, { adId: r.adId, name: r.adName })
        missing.push(r.adId)
      }
      if (missing.length > 0) {
        const details = await fetchAdDetails(missing)
        for (const adId of missing) {
          const d = details.get(adId)
          if (d) Object.assign(adsById.get(adId)!, d)
        }
      }
      const adList = [...adsById.values()]
      for (let i = 0; i < adList.length; i += 100) {
        await ctx.runMutation(internal.meta.upsertAds, {
          campaignId: metaId,
          ads: adList.slice(i, i + 100),
        })
      }

      await ctx.runMutation(internal.meta.patchCampaign, {
        id,
        name: meta.name,
        status: meta.effective_status,
        lastSyncedAt: now.toISOString(),
        clearError: true,
      })
      console.log(`Sync ${metaId} (${clientSlug}) : ${rows.length} jours`)
    } catch (e) {
      const raw = String(e)
      const inaccessible = /does not exist|missing permissions/i.test(raw)
      const friendly =
        inaccessible && origin === 'ghl'
          ? 'Statistiques Meta indisponibles : campagne détectée via GoHighLevel, hors des comptes accessibles avec le token Meta (les prospects sont bien reçus).'
          : inaccessible
            ? "Campagne introuvable ou inaccessible avec le token Meta — vérifie l'ID dans le Gestionnaire de publicités."
            : raw.slice(0, 300)
      await ctx.runMutation(internal.meta.patchCampaign, {
        id,
        lastSyncedAt: now.toISOString(),
        syncError: friendly,
      })
      console.error(`Sync ${metaId} en échec :`, e)
    }
  },
})

// Ping d'un chemin non mis en cache : réveille la fonction SSR Vercel pour
// éviter le démarrage à froid au premier visiteur.
export const keepWarm = internalAction({
  args: {},
  handler: async () => {
    // Une URL par fonction ISR (chaque section a la sienne) + le fallback.
    const urls = [
      'https://tracify-eta.vercel.app/keep-warm',
      'https://tracify-eta.vercel.app/dashboard',
      'https://tracify-eta.vercel.app/clients/keep-warm',
      'https://tracify-eta.vercel.app/campagnes/keep-warm',
    ]
    await Promise.all(
      urls.map((u) =>
        fetch(u, { headers: { 'user-agent': 'tracify-keepwarm' } }).catch((e) =>
          console.warn('keepWarm', u, ':', e),
        ),
      ),
    )
  },
})

// Vérifie qu'un compte publicitaire est accessible avec le token.
export const assertAdAccount = internalAction({
  args: { account: v.string() },
  handler: async (_ctx, { account }) => {
    const params = new URLSearchParams({
      fields: 'name,account_id',
      access_token: metaAccessToken(),
    })
    const res = await fetch(`${GRAPH_BASE}/${account}?${params}`)
    if (!res.ok) {
      throw new Error(
        "Meta ne reconnaît pas ce compte publicitaire, ou le token d'Erwan n'y a pas accès. Vérifie l'ID du compte dans le Gestionnaire de publicités (Paramètres du compte).",
      )
    }
    const json = (await res.json()) as { name?: string }
    return { name: json.name ?? account }
  },
})

// Rattachement automatique du compte publicitaire depuis un lead GHL : la
// campagne Meta de l'attribution permet de retrouver son compte (act_…) ;
// s'il est accessible avec le token et que le client n'en a pas encore, on
// le pose et on lance la détection de toutes ses campagnes (actives et inactives).
export const linkAccountFromCampaign = internalAction({
  args: { clientSlug: v.string(), metaId: v.string() },
  handler: async (
    ctx,
    { clientSlug, metaId },
  ): Promise<{ linked: boolean; account: string | null }> => {
    const current: { exists: boolean; account: string | null } =
      await ctx.runQuery(internal.meta.clientAdAccount, { clientSlug })
    if (!current.exists || current.account)
      return { linked: false, account: current.account }
    const params = new URLSearchParams({
      fields: 'account_id',
      access_token: metaAccessToken(),
    })
    const res = await fetch(`${GRAPH_BASE}/${metaId}?${params}`)
    if (!res.ok) {
      console.warn(
        `Compte publicitaire de ${metaId} introuvable (${res.status}) : campagne hors du token Meta ?`,
      )
      return { linked: false, account: null }
    }
    const json = (await res.json()) as { account_id?: string }
    if (!json.account_id) return { linked: false, account: null }
    const account = `act_${json.account_id}`
    await ctx.runMutation(internal.clients.patchAdAccount, {
      slug: clientSlug,
      adAccountId: account,
    })
    await ctx.runAction(internal.meta.discoverCampaigns, {
      clientSlug,
      account,
    })
    console.log(
      `Compte ${account} rattaché à ${clientSlug} via la campagne ${metaId}`,
    )
    return { linked: true, account }
  },
})

export const clientAdAccount = internalQuery({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    return {
      exists: Boolean(client),
      account: client?.adAccountId || null,
    }
  },
})

export const listClientsWithAccounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect()
    return clients
      .filter((c) => c.adAccountId)
      .map((c) => ({ clientSlug: c.slug, account: c.adAccountId! }))
  },
})

// Statuts Meta qu'on ne rattache pas : supprimée ou archivée côté Meta.
const HIDDEN_CAMPAIGN_STATUSES = new Set(['DELETED', 'ARCHIVED'])

// Détecte les campagnes d'un compte publicitaire (actives ET inactives, hors
// supprimées/archivées) et rattache automatiquement celles qui ne le sont
// pas encore (sync incluse).
export const discoverCampaigns = internalAction({
  args: { clientSlug: v.string(), account: v.string() },
  handler: async (ctx, { clientSlug, account }) => {
    const params = new URLSearchParams({
      fields: 'name,effective_status',
      limit: '200',
      access_token: metaAccessToken(),
    })
    const found: Array<{
      id: string
      name?: string
      effective_status?: string
    }> = []
    let url: string | undefined = `${GRAPH_BASE}/${account}/campaigns?${params}`
    while (url) {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`)
      const json = (await res.json()) as {
        data?: Array<{ id: string; name?: string; effective_status?: string }>
        paging?: { next?: string }
      }
      found.push(...(json.data ?? []))
      url = json.paging?.next
    }

    let added = 0
    for (const c of found) {
      if (
        c.effective_status &&
        HIDDEN_CAMPAIGN_STATUSES.has(c.effective_status)
      )
        continue
      const exists = await ctx.runQuery(internal.meta.campaignExists, {
        metaId: c.id,
      })
      if (exists) continue
      await ctx.runMutation(internal.meta.insertCampaign, {
        clientSlug,
        metaId: c.id,
        name: c.name,
        status: c.effective_status,
      })
      added++
    }
    console.log(
      `Découverte ${account} (${clientSlug}) : ${found.length} campagnes, ${added} rattachées`,
    )
    return { total: found.length, added }
  },
})

// Cron : resync de toutes les campagnes + détection des nouvelles campagnes
// actives sur les comptes publicitaires rattachés.
export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const withAccounts = await ctx.runQuery(
      internal.meta.listClientsWithAccounts,
      {},
    )
    for (const c of withAccounts) {
      try {
        await ctx.runAction(internal.meta.discoverCampaigns, c)
      } catch (e) {
        console.error(`Découverte ${c.account} en échec :`, e)
      }
    }
    const campaigns = await ctx.runMutation(internal.meta.listAllCampaigns, {})
    for (const c of campaigns) {
      await ctx.runAction(internal.meta.syncCampaign, c)
    }
  },
})

// --- API publique -----------------------------------------------------------

export const campaignsByClient = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    const rows = await ctx.db
      .query('campaigns')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    const withAds = await Promise.all(
      rows.map(async (c) => {
        const ads = await ctx.db
          .query('ads')
          .withIndex('by_campaign', (q) => q.eq('campaignId', c.metaId))
          .collect()
        return {
          id: c._id,
          metaId: c.metaId,
          name: c.name ?? null,
          status: c.status ?? null,
          lastSyncedAt: c.lastSyncedAt ?? null,
          syncError: c.syncError ?? null,
          origin: c.origin ?? null,
          ads: ads
            .map((a) => ({
              adId: a.adId,
              name: a.name ?? `Créative ${a.adId}`,
              status: a.status ?? null,
              thumbnailUrl: a.thumbnailUrl ?? null,
            }))
            .sort((a, b) => {
              const aa = a.status === 'ACTIVE' ? 0 : 1
              const bb = b.status === 'ACTIVE' ? 0 : 1
              return aa - bb || a.name.localeCompare(b.name)
            }),
        }
      }),
    )
    return withAds.sort((a, b) =>
      (a.name ?? a.metaId).localeCompare(b.name ?? b.metaId),
    )
  },
})

export const campaignExists = internalQuery({
  args: { metaId: v.string() },
  handler: async (ctx, { metaId }) => {
    const dup = await ctx.db
      .query('campaigns')
      .withIndex('by_meta', (q) => q.eq('metaId', metaId))
      .unique()
    return dup !== null
  },
})

export const insertCampaign = internalMutation({
  args: {
    clientSlug: v.string(),
    metaId: v.string(),
    name: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { clientSlug, metaId, name, status }) => {
    const id = await ctx.db.insert('campaigns', {
      clientSlug,
      metaId,
      name,
      status,
      createdAt: new Date().toISOString(),
    })
    await ctx.scheduler.runAfter(0, internal.meta.syncCampaign, {
      id,
      clientSlug,
      metaId,
    })
    return id
  },
})

// Ajout avec validation immédiate : on interroge Meta AVANT d'enregistrer,
// pour refuser tout de suite un ID inconnu / inaccessible / qui n'est pas
// une campagne, avec un message clair.
export const addCampaignChecked = action({
  args: { clientSlug: v.string(), metaId: v.string() },
  handler: async (ctx, { clientSlug, metaId }) => {
    await requireUser(ctx)
    const cleaned = metaId.trim().replace(/\s/g, '')
    if (!/^\d{5,25}$/.test(cleaned))
      throw new Error(
        "ID invalide : colle uniquement les chiffres de l'« Identifiant de la campagne ».",
      )

    const dup = await ctx.runQuery(internal.meta.campaignExists, {
      metaId: cleaned,
    })
    if (dup) throw new Error('Cette campagne est déjà rattachée.')

    const params = new URLSearchParams({
      fields: 'name,effective_status',
      metadata: '1',
      access_token: metaAccessToken(),
    })
    const res = await fetch(`${GRAPH_BASE}/${cleaned}?${params}`)
    if (!res.ok) {
      throw new Error(
        'Meta ne reconnaît pas cet ID : campagne introuvable ou hors des comptes accessibles avec le token. Dans le Gestionnaire de publicités, copie la colonne « Identifiant de la campagne » (18 chiffres, commence souvent par 120…).',
      )
    }
    const json = (await res.json()) as {
      name?: string
      effective_status?: string
      metadata?: { type?: string }
    }
    const type = json.metadata?.type
    if (type && type.toLowerCase() !== 'campaign') {
      throw new Error(
        `Cet ID correspond à un objet « ${type} », pas à une campagne. Copie l'« Identifiant de la campagne » dans le Gestionnaire de publicités.`,
      )
    }

    await ctx.runMutation(internal.meta.insertCampaign, {
      clientSlug,
      metaId: cleaned,
      name: json.name,
      status: json.effective_status,
    })
    return { metaId: cleaned, name: json.name ?? null }
  },
})

// Rattacher une campagne Meta à un client — un ID suffit, la sync fait le reste.
export const addCampaign = mutation({
  args: { clientSlug: v.string(), metaId: v.string() },
  handler: async (ctx, { clientSlug, metaId }) => {
    await requireUser(ctx)
    const cleaned = metaId.trim().replace(/\s/g, '')
    if (!/^\d{5,25}$/.test(cleaned))
      throw new Error('ID de campagne Meta invalide (chiffres uniquement).')

    const dup = await ctx.db
      .query('campaigns')
      .withIndex('by_meta', (q) => q.eq('metaId', cleaned))
      .unique()
    if (dup) throw new Error('Cette campagne est déjà rattachée.')

    const id = await ctx.db.insert('campaigns', {
      clientSlug,
      metaId: cleaned,
      createdAt: new Date().toISOString(),
    })
    await ctx.scheduler.runAfter(0, internal.meta.syncCampaign, {
      id,
      clientSlug,
      metaId: cleaned,
    })
    return { id }
  },
})

export const removeCampaign = mutation({
  args: { id: v.id('campaigns') },
  handler: async (ctx, { id }) => {
    await requireUser(ctx)
    const campaign = await ctx.db.get(id)
    if (!campaign) return
    const [stats, ads, adDaily] = await Promise.all([
      ctx.db
        .query('dailyStats')
        .withIndex('by_campaign_date', (q) =>
          q.eq('campaignId', campaign.metaId),
        )
        .collect(),
      ctx.db
        .query('ads')
        .withIndex('by_campaign', (q) => q.eq('campaignId', campaign.metaId))
        .collect(),
      ctx.db
        .query('adDaily')
        .withIndex('by_campaign', (q) => q.eq('campaignId', campaign.metaId))
        .collect(),
    ])
    await Promise.all(
      [...stats, ...ads, ...adDaily].map((r) => ctx.db.delete(r._id)),
    )
    await ctx.db.delete(id)
  },
})

// Détail d'une campagne : infos, séries quotidiennes et créatives agrégées 30 j.
export const campaignDetail = query({
  args: { metaId: v.string() },
  handler: async (ctx, { metaId }) => {
    await requireUser(ctx)
    return buildCampaignDetail(ctx, metaId)
  },
})

// Corps du détail, partagé avec l'accès public par code (convex/access.ts).
export async function buildCampaignDetail(ctx: QueryCtx, metaId: string) {
  {
    const campaign = await ctx.db
      .query('campaigns')
      .withIndex('by_meta', (q) => q.eq('metaId', metaId))
      .unique()
    if (!campaign) return null

    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', campaign.clientSlug))
      .unique()

    const [ads, adDaily, daily] = await Promise.all([
      ctx.db
        .query('ads')
        .withIndex('by_campaign', (q) => q.eq('campaignId', metaId))
        .collect(),
      ctx.db
        .query('adDaily')
        .withIndex('by_campaign', (q) => q.eq('campaignId', metaId))
        .collect(),
      ctx.db
        .query('dailyStats')
        .withIndex('by_campaign_date', (q) => q.eq('campaignId', metaId))
        .collect(),
    ])

    const cut30 = new Date(Date.now() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10)

    const byAd = new Map<
      string,
      { spend: number; impressions: number; clicks: number; leads: number }
    >()
    let impressions = 0
    let clicks = 0
    for (const r of adDaily) {
      if (r.date <= cut30) continue
      const agg = byAd.get(r.adId) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        leads: 0,
      }
      agg.spend += r.spend
      agg.impressions += r.impressions
      agg.clicks += r.clicks
      agg.leads += r.leads
      byAd.set(r.adId, agg)
      impressions += r.impressions
      clicks += r.clicks
    }

    const recent = daily.filter((r) => r.date > cut30)
    const spend = recent.reduce((s, r) => s + r.spend, 0)
    const leads = recent.reduce((s, r) => s + r.leads, 0)

    const adInfo = new Map(ads.map((a) => [a.adId, a]))
    // Toutes les créatives connues figurent dans le tableau, même sans
    // dépense sur 30 jours (campagne en pause, publicité jamais diffusée…).
    for (const a of ads)
      if (!byAd.has(a.adId))
        byAd.set(a.adId, { spend: 0, impressions: 0, clicks: 0, leads: 0 })

    return {
      metaId,
      name: campaign.name ?? `Campagne ${metaId}`,
      status: campaign.status ?? null,
      lastSyncedAt: campaign.lastSyncedAt ?? null,
      syncError: campaign.syncError ?? null,
      client: client
        ? {
            slug: client.slug,
            name: client.name,
            kind: client.kind ?? 'client',
          }
        : null,
      totals: {
        spend,
        leads,
        cpl: leads > 0 ? spend / leads : null,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
        cpc: clicks > 0 ? spend / clicks : null,
      },
      daily: recent
        .map((r) => ({ date: r.date, spend: r.spend, leads: r.leads }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      creatives: [...byAd.entries()]
        .map(([adId, agg]) => {
          const info = adInfo.get(adId)
          return {
            adId,
            name: info?.name ?? `Créative ${adId}`,
            status: info?.status ?? null,
            thumbnailUrl: info?.thumbnailUrl ?? null,
            spend: agg.spend,
            impressions: agg.impressions,
            clicks: agg.clicks,
            ctr:
              agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : null,
            cpc: agg.clicks > 0 ? agg.spend / agg.clicks : null,
            leads: agg.leads,
            cpl: agg.leads > 0 ? agg.spend / agg.leads : null,
          }
        })
        .sort(
          (a, b) =>
            b.spend - a.spend ||
            (a.status === 'ACTIVE' ? 0 : 1) - (b.status === 'ACTIVE' ? 0 : 1) ||
            a.name.localeCompare(b.name),
        ),
    }
  }
}
