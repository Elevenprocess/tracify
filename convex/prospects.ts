import { internalMutation, mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import { requireUser } from './guard'
import type { Doc, Id } from './_generated/dataModel'

// Statuts de base du pipeline, dans l'ordre des colonnes. Les colonnes
// ajoutées à la main (clients.pipelineStages) viennent s'insérer avant 'lost'.
export const BUILTIN_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'sold',
  'lost',
] as const
export const STATUS = v.string()
type Status = string

export type CustomStage = { key: string; label: string; color: string }

// Colonnes ajoutées à la main d'un client (vide si aucune).
export async function stagesForClient(
  ctx: QueryCtx | MutationCtx,
  clientSlug: string,
): Promise<Array<CustomStage>> {
  const client = await ctx.db
    .query('clients')
    .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
    .unique()
  return client?.pipelineStages ?? []
}

// Un statut est valide s'il est de base ou s'il correspond à une colonne du
// client.
export async function assertStatus(
  ctx: QueryCtx | MutationCtx,
  clientSlug: string,
  status: string,
) {
  if ((BUILTIN_STATUSES as ReadonlyArray<string>).includes(status)) return
  const stages = await stagesForClient(ctx, clientSlug)
  if (!stages.some((s) => s.key === status))
    throw new Error('Colonne inconnue pour ce client.')
}

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
  clientNotes: p.clientNotes ?? '',
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
  await assertStatus(ctx, p.clientSlug, status)
  const now = new Date().toISOString()
  const history = [
    ...(p.history ?? [{ status: p.status, at: p.createdAt }]),
    { status, at: now, by },
  ]
  await ctx.db.patch(id, { status, history })
}

// Anti-doublon : même téléphone (chiffres seuls) ou même email chez ce client.
export async function findDuplicate(
  ctx: MutationCtx,
  clientSlug: string,
  phone: string,
  email: string | undefined,
) {
  const digits = phone.replace(/\D/g, '')
  const mail = email?.trim().toLowerCase() || undefined
  if (!digits && !mail) return null
  const existing = await ctx.db
    .query('prospects')
    .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
    .collect()
  return (
    existing.find(
      (p) =>
        (digits && p.phone.replace(/\D/g, '') === digits) ||
        (mail && p.email === mail),
    ) ?? null
  )
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

// Notes du client, modifiables aussi depuis l'aperçu admin.
export const setClientNotes = mutation({
  args: { id: v.id('prospects'), notes: v.string() },
  handler: async (ctx, { id, notes }) => {
    await requireUser(ctx)
    const p = await ctx.db.get(id)
    if (!p) throw new Error('Prospect introuvable.')
    await ctx.db.patch(id, { clientNotes: notes.trim() || undefined })
  },
})

export const remove = mutation({
  args: { id: v.id('prospects') },
  handler: async (ctx, { id }) => {
    await requireUser(ctx)
    await ctx.db.delete(id)
  },
})

// Suppression depuis la CLI (nettoyage de prospects de test), sans session.
export const removeInternal = internalMutation({
  args: { id: v.id('prospects') },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id)
  },
})

// --- Colonnes du pipeline ajoutées à la main (par client) ------------------

const PALETTE_FALLBACK = '#4f8ef7'
const MAX_CUSTOM_STAGES = 8

const slugify = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'colonne'

async function clientBySlug(ctx: QueryCtx | MutationCtx, clientSlug: string) {
  const client = await ctx.db
    .query('clients')
    .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
    .unique()
  if (!client) throw new Error('Client introuvable.')
  return client
}

export const stages = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    return stagesForClient(ctx, clientSlug)
  },
})

export const addStage = mutation({
  args: {
    clientSlug: v.string(),
    label: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { clientSlug, label, color }) => {
    await requireUser(ctx)
    const client = await clientBySlug(ctx, clientSlug)
    const name = label.trim()
    if (!name) throw new Error('Le nom de la colonne est requis.')
    const current = client.pipelineStages ?? []
    if (current.length >= MAX_CUSTOM_STAGES)
      throw new Error(`${MAX_CUSTOM_STAGES} colonnes ajoutées au maximum.`)
    if (current.some((s) => s.label.toLowerCase() === name.toLowerCase()))
      throw new Error('Une colonne porte déjà ce nom.')

    // Clé stable (x_ + libellé simplifié), unique sur le client et jamais en
    // conflit avec les statuts de base.
    const base = `x_${slugify(name)}`
    let key = base
    let i = 2
    while (current.some((s) => s.key === key)) key = `${base}_${i++}`

    const hex = /^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : PALETTE_FALLBACK
    await ctx.db.patch(client._id, {
      pipelineStages: [...current, { key, label: name, color: hex }],
    })
    return { key }
  },
})

export const renameStage = mutation({
  args: {
    clientSlug: v.string(),
    key: v.string(),
    label: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { clientSlug, key, label, color }) => {
    await requireUser(ctx)
    const client = await clientBySlug(ctx, clientSlug)
    const name = label.trim()
    if (!name) throw new Error('Le nom de la colonne est requis.')
    const current = client.pipelineStages ?? []
    if (!current.some((s) => s.key === key))
      throw new Error('Colonne introuvable.')
    await ctx.db.patch(client._id, {
      pipelineStages: current.map((s) =>
        s.key === key
          ? {
              ...s,
              label: name,
              color: /^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : s.color,
            }
          : s,
      ),
    })
  },
})

// Suppression refusée tant que des prospects sont dans la colonne : on les
// déplace d'abord (glisser-déposer), rien n'est perdu.
export const removeStage = mutation({
  args: { clientSlug: v.string(), key: v.string() },
  handler: async (ctx, { clientSlug, key }) => {
    await requireUser(ctx)
    const client = await clientBySlug(ctx, clientSlug)
    const current = client.pipelineStages ?? []
    if (!current.some((s) => s.key === key))
      throw new Error('Colonne introuvable.')
    const rows = await ctx.db
      .query('prospects')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    const inside = rows.filter((r) => r.status === key).length
    if (inside > 0)
      throw new Error(
        `${inside} prospect${inside > 1 ? 's' : ''} dans cette colonne : déplace-les avant de la supprimer.`,
      )
    await ctx.db.patch(client._id, {
      pipelineStages: current.filter((s) => s.key !== key),
    })
  },
})
