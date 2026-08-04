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
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        status: c.status,
        kind: c.kind ?? 'client',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  },
})

// Création manuelle d'un client ou d'un projet (depuis la sidebar)
export const create = mutation({
  args: {
    name: v.string(),
    sector: v.optional(v.string()),
    kind: v.optional(v.union(v.literal('client'), v.literal('project'))),
  },
  handler: async (ctx, { name, sector, kind }) => {
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
      kind: kind ?? 'client',
      sector: sector?.trim() || 'Non renseigné',
      status: 'active',
      createdAt: new Date().toISOString(),
    })
    return { slug }
  },
})

// Basculer un enregistrement entre projet et client
export const setKind = mutation({
  args: {
    slug: v.string(),
    kind: v.union(v.literal('client'), v.literal('project')),
  },
  handler: async (ctx, { slug, kind }) => {
    const row = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
    if (!row) throw new Error('Introuvable')
    await ctx.db.patch(row._id, { kind })
  },
})
