import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireUser } from './guard'
import type { Doc } from './_generated/dataModel'

const STATUS = v.union(
  v.literal('new'),
  v.literal('contacted'),
  v.literal('qualified'),
  v.literal('lost'),
)

const toCard = (p: Doc<'prospects'>) => ({
  id: p._id,
  name: p.name,
  phone: p.phone,
  date: p.date,
  source: p.source,
  medium: p.medium,
  status: p.status,
})

// CRM par campagne : les prospects d'une campagne Meta.
export const byCampaign = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    await requireUser(ctx)
    const rows = await ctx.db
      .query('prospects')
      .withIndex('by_campaign', (q) => q.eq('campaignId', campaignId))
      .collect()
    return rows.sort((a, b) => b.date.localeCompare(a.date)).map(toCard)
  },
})

export const byClient = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    const rows = await ctx.db
      .query('prospects')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    return rows.sort((a, b) => b.date.localeCompare(a.date)).map(toCard)
  },
})

export const add = mutation({
  args: {
    campaignId: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { campaignId, name, phone, source }) => {
    await requireUser(ctx)
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Le nom du prospect est requis.')

    const campaign = await ctx.db
      .query('campaigns')
      .withIndex('by_meta', (q) => q.eq('metaId', campaignId))
      .unique()
    if (!campaign) throw new Error('Campagne introuvable.')

    const now = new Date()
    await ctx.db.insert('prospects', {
      clientSlug: campaign.clientSlug,
      campaignId,
      name: trimmed,
      phone: phone?.trim() ?? '',
      date: now.toISOString().slice(0, 10),
      source: source?.trim() || 'Manuel',
      medium: '—',
      status: 'new',
      createdAt: now.toISOString(),
    })
  },
})

export const setStatus = mutation({
  args: { id: v.id('prospects'), status: STATUS },
  handler: async (ctx, { id, status }) => {
    await requireUser(ctx)
    await ctx.db.patch(id, { status })
  },
})

export const remove = mutation({
  args: { id: v.id('prospects') },
  handler: async (ctx, { id }) => {
    await requireUser(ctx)
    await ctx.db.delete(id)
  },
})
