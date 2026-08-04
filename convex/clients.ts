import { action, internalMutation, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'client'

// Normalise « 928367685155102 » ou « act_928367685155102 » → act_…
export function normalizeAdAccountId(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s/g, '').toLowerCase()
  const m = cleaned.match(/^(?:act_)?(\d{5,25})$/)
  return m ? `act_${m[1]}` : null
}

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

export const insert = internalMutation({
  args: {
    name: v.string(),
    adAccountId: v.optional(v.string()),
    kind: v.optional(v.union(v.literal('client'), v.literal('project'))),
  },
  handler: async (ctx, { name, adAccountId, kind }) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Le nom est requis.')

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
      adAccountId,
      status: 'active',
      createdAt: new Date().toISOString(),
    })
    return { slug }
  },
})

export const patchAdAccount = internalMutation({
  args: { slug: v.string(), adAccountId: v.string() },
  handler: async (ctx, { slug, adAccountId }) => {
    const row = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
    if (!row) throw new Error('Introuvable')
    await ctx.db.patch(row._id, { adAccountId })
  },
})

// Création avec compte publicitaire : le compte est validé auprès de Meta,
// puis toutes ses campagnes actives sont rattachées automatiquement.
export const createChecked = action({
  args: {
    name: v.string(),
    adAccountId: v.string(),
    kind: v.optional(v.union(v.literal('client'), v.literal('project'))),
  },
  handler: async (
    ctx,
    { name, adAccountId, kind },
  ): Promise<{ slug: string }> => {
    const account = normalizeAdAccountId(adAccountId)
    if (!account)
      throw new Error(
        "ID de compte publicitaire invalide : colle les chiffres de l'ID du compte (ou act_ suivi des chiffres).",
      )

    await ctx.runAction(internal.meta.assertAdAccount, { account })
    const { slug }: { slug: string } = await ctx.runMutation(
      internal.clients.insert,
      {
        name,
        adAccountId: account,
        kind,
      },
    )
    await ctx.scheduler.runAfter(0, internal.meta.discoverCampaigns, {
      clientSlug: slug,
      account,
    })
    return { slug }
  },
})

// Poser/mettre à jour le compte publicitaire d'un client existant.
export const setAdAccountChecked = action({
  args: { slug: v.string(), adAccountId: v.string() },
  handler: async (ctx, { slug, adAccountId }): Promise<{ account: string }> => {
    const account = normalizeAdAccountId(adAccountId)
    if (!account)
      throw new Error(
        "ID de compte publicitaire invalide : colle les chiffres de l'ID du compte (ou act_ suivi des chiffres).",
      )
    await ctx.runAction(internal.meta.assertAdAccount, { account })
    await ctx.runMutation(internal.clients.patchAdAccount, {
      slug,
      adAccountId: account,
    })
    await ctx.scheduler.runAfter(0, internal.meta.discoverCampaigns, {
      clientSlug: slug,
      account,
    })
    return { account }
  },
})

// Création simple (CLI / secours), sans compte publicitaire.
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
      sector: sector?.trim() || undefined,
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
