/**
 * Codes d'accès client — l'admin génère un code sur la fiche d'un client,
 * le client le saisit sur la page de connexion et ouvre le suivi de ses
 * campagnes en lecture seule, sans compte. Un seul code actif par client,
 * permanent tant qu'il n'est pas régénéré ou désactivé.
 */
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { requireUser } from './guard'
import { buildCampaignDetail } from './meta'
import { STATUS, toCard } from './prospects'

// Alphabet sans caractères ambigus (pas de O/0, I/L/1) : facile à dicter.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

function randomCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++)
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return code
}

// Tolère espaces, tirets et minuscules à la saisie.
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '')
}

async function activeCodeFor(ctx: QueryCtx | MutationCtx, clientSlug: string) {
  const codes = await ctx.db
    .query('accessCodes')
    .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
    .collect()
  return codes.find((c) => !c.revokedAt) ?? null
}

// --- Côté admin -------------------------------------------------------------

export const codeForClient = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    const active = await activeCodeFor(ctx, clientSlug)
    return active ? { code: active.code, createdAt: active.createdAt } : null
  },
})

// Génère (ou régénère) le code d'un client — l'ancien devient invalide.
export const generate = mutation({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (!client) throw new Error('Client introuvable.')

    const now = new Date().toISOString()
    const existing = await ctx.db
      .query('accessCodes')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    for (const c of existing) {
      if (!c.revokedAt) await ctx.db.patch(c._id, { revokedAt: now })
    }

    // Unicité globale du code, y compris face aux codes révoqués.
    let code = randomCode()
    while (
      await ctx.db
        .query('accessCodes')
        .withIndex('by_code', (q) => q.eq('code', code))
        .unique()
    ) {
      code = randomCode()
    }
    await ctx.db.insert('accessCodes', { code, clientSlug, createdAt: now })
    return { code }
  },
})

// Désactive le code actif sans en créer de nouveau.
export const revoke = mutation({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    const active = await activeCodeFor(ctx, clientSlug)
    if (active)
      await ctx.db.patch(active._id, { revokedAt: new Date().toISOString() })
  },
})

// --- Accès public par code (aucune session requise) -------------------------

async function clientSlugForCode(ctx: QueryCtx | MutationCtx, raw: string) {
  const code = normalizeCode(raw)
  if (!code) return null
  const doc = await ctx.db
    .query('accessCodes')
    .withIndex('by_code', (q) => q.eq('code', code))
    .unique()
  if (!doc || doc.revokedAt) return null
  return doc.clientSlug
}

// Validation rapide depuis la page de connexion.
export const check = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) =>
    (await clientSlugForCode(ctx, code)) !== null,
})

// Vue de suivi complète : le client et le détail de chacune de ses campagnes,
// protégée uniquement par le code.
export const trackingView = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const clientSlug = await clientSlugForCode(ctx, code)
    if (!clientSlug) return null
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', clientSlug))
      .unique()
    if (!client) return null

    const campaigns = await ctx.db
      .query('campaigns')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    const details = []
    for (const c of campaigns) {
      const detail = await buildCampaignDetail(ctx, c.metaId)
      if (detail) details.push(detail)
    }
    details.sort((a, b) => b.totals.spend - a.totals.spend)

    return {
      client: { slug: client.slug, name: client.name },
      campaigns: details,
    }
  },
})

// Pipeline du client : ses prospects (toutes campagnes confondues), en
// lecture + changement de statut, protégé uniquement par le code.
export const trackingProspects = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const clientSlug = await clientSlugForCode(ctx, code)
    if (!clientSlug) return null
    const rows = await ctx.db
      .query('prospects')
      .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
      .collect()
    return rows.sort((a, b) => b.date.localeCompare(a.date)).map(toCard)
  },
})

export const trackingSetStatus = mutation({
  args: { code: v.string(), id: v.id('prospects'), status: STATUS },
  handler: async (ctx, { code, id, status }) => {
    const clientSlug = await clientSlugForCode(ctx, code)
    if (!clientSlug) throw new Error('Code invalide.')
    const prospect = await ctx.db.get(id)
    if (!prospect || prospect.clientSlug !== clientSlug)
      throw new Error('Prospect introuvable.')
    await ctx.db.patch(id, { status })
  },
})
