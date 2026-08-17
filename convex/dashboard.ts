import { query } from './_generated/server'
import { v } from 'convex/values'
import { requireUser } from './guard'
import type { Doc } from './_generated/dataModel'

type Pipeline = {
  new: number
  contacted: number
  qualified: number
  lost: number
}
const emptyPipeline = (): Pipeline => ({
  new: 0,
  contacted: 0,
  qualified: 0,
  lost: 0,
})
function countPipeline(rows: Array<Doc<'prospects'>>): Pipeline {
  const p = emptyPipeline()
  for (const r of rows) p[r.status] += 1
  return p
}
const cutoffIso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

// Vue d'ensemble : agrégats par client + série quotidienne globale
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const [clients, daily, campaigns, prospects] = await Promise.all([
      ctx.db.query('clients').collect(),
      ctx.db.query('dailyStats').collect(),
      ctx.db.query('campaigns').collect(),
      ctx.db.query('prospects').collect(),
    ])

    // Pipeline global + par client (leads reçus, quel que soit le canal)
    const pipelineByClient = new Map<string, Pipeline>()
    for (const p of prospects) {
      const agg = pipelineByClient.get(p.clientSlug) ?? emptyPipeline()
      agg[p.status] += 1
      pipelineByClient.set(p.clientSlug, agg)
    }
    const since24h = cutoffIso(24 * 3_600_000)
    const clientName = new Map(clients.map((c) => [c.slug, c.name]))
    const campaignName = new Map(
      campaigns.map((c) => [c.metaId, c.name ?? `Campagne ${c.metaId}`]),
    )

    const activeByClient = new Map<string, number>()
    for (const c of campaigns) {
      if (c.status && c.status !== 'ACTIVE') continue
      activeByClient.set(
        c.clientSlug,
        (activeByClient.get(c.clientSlug) ?? 0) + 1,
      )
    }

    // Fenêtres : 30 derniers jours (affichés) vs 30 jours précédents (deltas)
    const dayKey = (msAgo: number) =>
      new Date(Date.now() - msAgo).toISOString().slice(0, 10)
    const cut30 = dayKey(30 * 86_400_000)
    const cut60 = dayKey(60 * 86_400_000)

    const byClient = new Map<string, { spend: number; leads: number }>()
    const byDate = new Map<string, { spend: number; leads: number }>()
    let prevSpend = 0
    let prevLeads = 0
    for (const row of daily) {
      if (row.date <= cut30) {
        if (row.date > cut60) {
          prevSpend += row.spend
          prevLeads += row.leads
        }
        continue
      }
      const c = byClient.get(row.clientSlug) ?? { spend: 0, leads: 0 }
      c.spend += row.spend
      c.leads += row.leads
      byClient.set(row.clientSlug, c)

      const d = byDate.get(row.date) ?? { spend: 0, leads: 0 }
      d.spend += row.spend
      d.leads += row.leads
      byDate.set(row.date, d)
    }

    const curSpend = [...byClient.values()].reduce((s, c) => s + c.spend, 0)
    const curLeads = [...byClient.values()].reduce((s, c) => s + c.leads, 0)
    const pct = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : null
    const curCpl = curLeads > 0 ? curSpend / curLeads : null
    const prevCpl = prevLeads > 0 ? prevSpend / prevLeads : null

    return {
      totals: {
        spend: curSpend,
        leads: curLeads,
        cpl: curCpl,
        spendDelta: pct(curSpend, prevSpend),
        leadsDelta: pct(curLeads, prevLeads),
        cplDelta:
          curCpl !== null && prevCpl !== null
            ? ((curCpl - prevCpl) / prevCpl) * 100
            : null,
      },
      pipeline: countPipeline(prospects),
      newLeads24h: prospects.filter((p) => p.createdAt > since24h).length,
      // Derniers prospects à traiter, tous clients confondus
      toHandle: prospects
        .filter((p) => p.status === 'new')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8)
        .map((p) => ({
          id: p._id,
          name: p.name,
          phone: p.phone,
          source: p.source,
          date: p.date,
          createdAt: p.createdAt,
          viaWebhook: p.viaWebhook ?? false,
          clientSlug: p.clientSlug,
          clientName: clientName.get(p.clientSlug) ?? p.clientSlug,
          campaignId: p.campaignId ?? null,
          campaignName: p.campaignId
            ? (campaignName.get(p.campaignId) ?? null)
            : null,
        })),
      clients: clients
        .map((c) => {
          const agg = byClient.get(c.slug) ?? { spend: 0, leads: 0 }
          const pipeline = pipelineByClient.get(c.slug) ?? emptyPipeline()
          return {
            slug: c.slug,
            name: c.name,
            sector: c.sector ?? null,
            status: c.status,
            activeCampaigns:
              activeByClient.get(c.slug) ?? c.activeCampaigns ?? 0,
            spend30d: agg.spend,
            leads30d: agg.leads,
            cpl: agg.leads > 0 ? agg.spend / agg.leads : null,
            pipeline,
            newLeads: pipeline.new,
          }
        })
        .sort((a, b) => b.spend30d - a.spend30d),
      daily: [...byDate.entries()]
        .map(([date, agg]) => ({ date, ...agg }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }
  },
})

// Détail d'un client : infos + prospects hebdo + répartition sources + derniers prospects
export const client = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireUser(ctx)
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
    if (!client) return null

    const [daily, sources, prospects, campaigns, accessCodes] =
      await Promise.all([
        ctx.db
          .query('dailyStats')
          .withIndex('by_client_date', (q) => q.eq('clientSlug', slug))
          .collect(),
        ctx.db
          .query('sourceStats')
          .withIndex('by_client', (q) => q.eq('clientSlug', slug))
          .collect(),
        ctx.db
          .query('prospects')
          .withIndex('by_client', (q) => q.eq('clientSlug', slug))
          .collect(),
        ctx.db
          .query('campaigns')
          .withIndex('by_client', (q) => q.eq('clientSlug', slug))
          .collect(),
        ctx.db
          .query('accessCodes')
          .withIndex('by_client', (q) => q.eq('clientSlug', slug))
          .collect(),
      ])

    const pipeline = countPipeline(prospects)
    const totalLeads = prospects.length
    const closed = pipeline.qualified + pipeline.lost
    const lastLead = prospects.reduce<string | null>(
      (m, p) => (m === null || p.createdAt > m ? p.createdAt : m),
      null,
    )
    const lastSync = campaigns.reduce<string | null>(
      (m, c) =>
        c.lastSyncedAt && (m === null || c.lastSyncedAt > m)
          ? c.lastSyncedAt
          : m,
      null,
    )
    const leadsByCampaign = new Map<string, number>()
    for (const p of prospects) {
      if (!p.campaignId) continue
      leadsByCampaign.set(
        p.campaignId,
        (leadsByCampaign.get(p.campaignId) ?? 0) + 1,
      )
    }

    const cut30 = new Date(Date.now() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const recent = daily.filter((r) => r.date > cut30)
    const spend30d = recent.reduce((s, r) => s + r.spend, 0)
    const leads30d = recent.reduce((s, r) => s + r.leads, 0)

    // Regroupement par semaine ISO (lundi comme premier jour)
    const weeks = new Map<
      string,
      { start: string; end: string; leads: number }
    >()
    for (const row of daily.sort((a, b) => a.date.localeCompare(b.date))) {
      const d = new Date(`${row.date}T12:00:00Z`)
      const monday = new Date(d)
      monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
      const key = monday.toISOString().slice(0, 10)
      const sunday = new Date(monday)
      sunday.setUTCDate(monday.getUTCDate() + 6)
      const w = weeks.get(key) ?? {
        start: key,
        end: sunday.toISOString().slice(0, 10),
        leads: 0,
      }
      w.leads += row.leads
      weeks.set(key, w)
    }

    return {
      slug: client.slug,
      name: client.name,
      sector: client.sector ?? null,
      adAccountId: client.adAccountId ?? null,
      status: client.status,
      activeCampaigns:
        campaigns.filter((c) => !c.status || c.status === 'ACTIVE').length ||
        (client.activeCampaigns ?? 0),
      spend30d,
      leads30d,
      cpl: leads30d > 0 ? spend30d / leads30d : null,
      // Tableau de bord du compte : pipeline, accès, réception des leads
      account: {
        pipeline,
        totalLeads,
        newLeads24h: prospects.filter(
          (p) => p.createdAt > cutoffIso(24 * 3_600_000),
        ).length,
        // Taux de qualification parmi les prospects traités jusqu'au bout
        qualificationRate:
          closed > 0 ? (pipeline.qualified / closed) * 100 : null,
        viaWebhook: prospects.filter((p) => p.viaWebhook).length,
        lastLeadAt: lastLead,
        lastSyncAt: lastSync,
        hasAccessCode: accessCodes.some((c) => !c.revokedAt),
        hasWebhook: Boolean(client.webhookKey),
        campaigns: campaigns
          .map((c) => ({
            metaId: c.metaId,
            name: c.name ?? `Campagne ${c.metaId}`,
            status: c.status ?? null,
            leads: leadsByCampaign.get(c.metaId) ?? 0,
          }))
          .sort((a, b) => b.leads - a.leads),
        unassignedLeads: prospects.filter((p) => !p.campaignId).length,
      },
      // On écarte la semaine en cours (incomplète) et on garde les 4 dernières
      weeklyLeads: [...weeks.values()]
        .filter((w) => {
          const lastDate = daily.reduce((m, r) => (r.date > m ? r.date : m), '')
          return w.end <= lastDate
        })
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(-4),
      sources: sources
        .map((s) => ({ label: s.source, value: s.count }))
        .sort((a, b) => b.value - a.value),
      prospects: prospects
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20)
        .map((p) => ({
          id: p._id,
          name: p.name,
          phone: p.phone,
          date: p.date,
          source: p.source,
          medium: p.medium,
          status: p.status,
        })),
    }
  },
})
