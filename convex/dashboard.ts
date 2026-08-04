import { query } from './_generated/server'
import { v } from 'convex/values'

// Vue d'ensemble : agrégats par client + série quotidienne globale
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const [clients, daily] = await Promise.all([
      ctx.db.query('clients').collect(),
      ctx.db.query('dailyStats').collect(),
    ])

    const byClient = new Map<string, { spend: number; leads: number }>()
    const byDate = new Map<string, { spend: number; leads: number }>()
    for (const row of daily) {
      const c = byClient.get(row.clientSlug) ?? { spend: 0, leads: 0 }
      c.spend += row.spend
      c.leads += row.leads
      byClient.set(row.clientSlug, c)

      const d = byDate.get(row.date) ?? { spend: 0, leads: 0 }
      d.spend += row.spend
      d.leads += row.leads
      byDate.set(row.date, d)
    }

    return {
      clients: clients
        .map((c) => {
          const agg = byClient.get(c.slug) ?? { spend: 0, leads: 0 }
          return {
            slug: c.slug,
            name: c.name,
            sector: c.sector,
            status: c.status,
            activeCampaigns: c.activeCampaigns,
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
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
    if (!client) return null

    const [daily, sources, prospects] = await Promise.all([
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
    ])

    const spend30d = daily.reduce((s, r) => s + r.spend, 0)
    const leads30d = daily.reduce((s, r) => s + r.leads, 0)

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
      sector: client.sector,
      status: client.status,
      activeCampaigns: client.activeCampaigns,
      spend30d,
      leads30d,
      cpl: leads30d > 0 ? spend30d / leads30d : null,
      // On écarte la semaine en cours (incomplète) pour ne pas fausser la lecture
      weeklyLeads: [...weeks.values()]
        .filter((w) => {
          const lastDate = daily.reduce((m, r) => (r.date > m ? r.date : m), '')
          return w.end <= lastDate
        })
        .sort((a, b) => a.start.localeCompare(b.start)),
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
