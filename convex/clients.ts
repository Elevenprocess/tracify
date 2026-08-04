import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'client'

// Liste légère pour la sidebar
export const list = query({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query('clients').collect()
    return clients
      .map((c) => ({ slug: c.slug, name: c.name, status: c.status }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  },
})

// Création manuelle d'un client (depuis la sidebar)
export const create = mutation({
  args: { name: v.string(), sector: v.optional(v.string()) },
  handler: async (ctx, { name, sector }) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Le nom du client est requis.')

    let slug = slugify(trimmed)
    const existing = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
    if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`

    await ctx.db.insert('clients', {
      slug,
      name: trimmed,
      sector: sector?.trim() || 'Non renseigné',
      status: 'active',
      createdAt: new Date().toISOString(),
    })
    return { slug }
  },
})
