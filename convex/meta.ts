/**
 * Sync Meta Ads par campagne — même approche que Velora (Graph API directe,
 * token utilisateur longue durée dans META_ACCESS_TOKEN, lignes quotidiennes
 * via time_increment=1), mais au niveau campagne : chaque client Tracify
 * référence simplement des IDs de campagnes Meta.
 */
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'

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
  spend?: string
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
    }))
  },
})

// Sync d'une campagne : nom + statut + stats quotidiennes sur 30 jours.
export const syncCampaign = internalAction({
  args: {
    id: v.id('campaigns'),
    clientSlug: v.string(),
    metaId: v.string(),
  },
  handler: async (ctx, { id, clientSlug, metaId }) => {
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
      await ctx.runMutation(internal.meta.patchCampaign, {
        id,
        name: meta.name,
        status: meta.effective_status,
        lastSyncedAt: now.toISOString(),
        clearError: true,
      })
      console.log(`Sync ${metaId} (${clientSlug}) : ${rows.length} jours`)
    } catch (e) {
      await ctx.runMutation(internal.meta.patchCampaign, {
        id,
        lastSyncedAt: now.toISOString(),
        syncError: String(e).slice(0, 300),
      })
      console.error(`Sync ${metaId} en échec :`, e)
    }
  },
})

// Cron : resync de toutes les campagnes.
export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
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
    const rows = await ctx.db
      .query('campaigns')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    return rows
      .map((c) => ({
        id: c._id,
        metaId: c.metaId,
        name: c.name ?? null,
        status: c.status ?? null,
        lastSyncedAt: c.lastSyncedAt ?? null,
        syncError: c.syncError ?? null,
      }))
      .sort((a, b) => (a.name ?? a.metaId).localeCompare(b.name ?? b.metaId))
  },
})

// Rattacher une campagne Meta à un client — un ID suffit, la sync fait le reste.
export const addCampaign = mutation({
  args: { clientSlug: v.string(), metaId: v.string() },
  handler: async (ctx, { clientSlug, metaId }) => {
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
    const campaign = await ctx.db.get(id)
    if (!campaign) return
    const stats = await ctx.db
      .query('dailyStats')
      .withIndex('by_campaign_date', (q) => q.eq('campaignId', campaign.metaId))
      .collect()
    await Promise.all(stats.map((s) => ctx.db.delete(s._id)))
    await ctx.db.delete(id)
  },
})
