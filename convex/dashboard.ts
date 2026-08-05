import { query } from './_generated/server'
import { v } from 'convex/values'
import { requireUser } from './guard'

// Vue d'ensemble : agrégats par client + série quotidienne globale
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    const [clients, daily, campaigns] = await Promise.all([
      ctx.db.query('clients').collect(),
      ctx.db.query('dailyStats').collect(),
      ctx.db.query('campaigns').collect(),
    ])

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
      clients: clients
        .map((c) => {
          const agg = byClient.get(c.slug) ?? { spend: 0, leads: 0 }
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

    const [daily, sources, prospects, campaigns] = await Promise.all([
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
    ])

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
