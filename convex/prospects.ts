import { mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { v } from 'convex/values'
import { requireUser } from './guard'
import type { Doc, Id } from './_generated/dataModel'

export const STATUS = v.union(
  v.literal('new'),
  v.literal('contacted'),
  v.literal('qualified'),
  v.literal('lost'),
)
type Status = 'new' | 'contacted' | 'qualified' | 'lost'

// Carte affichée dans les kanbans (admin + espace client). `notes` n'est
// jamais renvoyé côté client : voir access.ts qui appelle toPublicCard.
export const toCard = (p: Doc<'prospects'>) => ({
  id: p._id,
  name: p.name,
  phone: p.phone,
  email: p.email,
  date: p.date,
  source: p.source,
  medium: p.medium,
  status: p.status,
  campaignId: p.campaignId ?? null,
  viaWebhook: p.viaWebhook ?? false,
  createdAt: p.createdAt,
  history: p.history ?? [{ status: p.status, at: p.createdAt }],
  notes: p.notes ?? '',
})

export const toPublicCard = (p: Doc<'prospects'>) => ({
  ...toCard(p),
  notes: '',
})

export type ProspectCard = ReturnType<typeof toCard>

// Change le statut en gardant une trace dans l'historique.
export async function applyStatus(
  ctx: MutationCtx,
  id: Id<'prospects'>,
  status: Status,
  by: 'admin' | 'client',
) {
  const p = await ctx.db.get(id)
  if (!p) throw new Error('Prospect introuvable.')
  if (p.status === status) return
  const now = new Date().toISOString()
  const history = [
    ...(p.history ?? [{ status: p.status, at: p.createdAt }]),
    { status, at: now, by },
  ]
  await ctx.db.patch(id, { status, history })
}

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
    const iso = now.toISOString()
    await ctx.db.insert('prospects', {
      clientSlug: campaign.clientSlug,
      campaignId,
      name: trimmed,
      phone: phone?.trim() ?? '',
      date: iso.slice(0, 10),
      source: source?.trim() || 'Manuel',
      medium: '—',
      status: 'new',
      viaWebhook: false,
      history: [{ status: 'new', at: iso, by: 'admin' }],
      createdAt: iso,
    })
  },
})

export const setStatus = mutation({
  args: { id: v.id('prospects'), status: STATUS },
  handler: async (ctx, { id, status }) => {
    await requireUser(ctx)
    await applyStatus(ctx, id, status, 'admin')
  },
})

// Notes internes : visibles uniquement côté admin.
export const setNotes = mutation({
  args: { id: v.id('prospects'), notes: v.string() },
  handler: async (ctx, { id, notes }) => {
    await requireUser(ctx)
    const p = await ctx.db.get(id)
    if (!p) throw new Error('Prospect introuvable.')
    await ctx.db.patch(id, { notes: notes.trim() || undefined })
  },
})

export const remove = mutation({
  args: { id: v.id('prospects') },
  handler: async (ctx, { id }) => {
    await requireUser(ctx)
    await ctx.db.delete(id)
  },
})
