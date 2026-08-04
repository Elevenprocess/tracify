import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const STATUS = v.union(
  v.literal('new'),
  v.literal('contacted'),
  v.literal('qualified'),
  v.literal('lost'),
)

export const byClient = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    const rows = await ctx.db
      .query('prospects')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    return rows
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => ({
        id: p._id,
        name: p.name,
        phone: p.phone,
        date: p.date,
        source: p.source,
        medium: p.medium,
        status: p.status,
      }))
  },
})

export const add = mutation({
  args: {
    clientSlug: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { clientSlug, name, phone, source }) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Le nom du prospect est requis.')
    const now = new Date()
    await ctx.db.insert('prospects', {
      clientSlug,
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
    await ctx.db.patch(id, { status })
  },
})

export const remove = mutation({
  args: { id: v.id('prospects') },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id)
  },
})
