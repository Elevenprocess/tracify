/**
 * Codes d'accès client — l'admin génère un code sur la page d'une campagne,
 * le client le saisit sur la page de connexion et ouvre une vue de suivi en
 * lecture seule, sans compte. Un seul code actif par campagne, permanent tant
 * qu'il n'est pas régénéré ou désactivé.
 */
import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { requireUser } from './guard'
import { buildCampaignDetail } from './meta'

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

async function activeCodeFor(ctx: QueryCtx | MutationCtx, campaignId: string) {
  const codes = await ctx.db
    .query('accessCodes')
    .withIndex('by_campaign', (q) => q.eq('campaignId', campaignId))
    .collect()
  return codes.find((c) => !c.revokedAt) ?? null
}

// --- Côté admin -------------------------------------------------------------

export const codeForCampaign = query({
  args: { metaId: v.string() },
  handler: async (ctx, { metaId }) => {
    await requireUser(ctx)
    const active = await activeCodeFor(ctx, metaId)
    return active ? { code: active.code, createdAt: active.createdAt } : null
  },
})

// Génère (ou régénère) le code d'une campagne — l'ancien devient invalide.
export const generate = mutation({
  args: { metaId: v.string() },
  handler: async (ctx, { metaId }) => {
    await requireUser(ctx)
    const campaign = await ctx.db
      .query('campaigns')
      .withIndex('by_meta', (q) => q.eq('metaId', metaId))
      .unique()
    if (!campaign) throw new Error('Campagne introuvable.')

    const now = new Date().toISOString()
    const existing = await ctx.db
      .query('accessCodes')
      .withIndex('by_campaign', (q) => q.eq('campaignId', metaId))
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
    await ctx.db.insert('accessCodes', {
      code,
      campaignId: metaId,
      createdAt: now,
    })
    return { code }
  },
})

// Désactive le code actif sans en créer de nouveau.
export const revoke = mutation({
  args: { metaId: v.string() },
  handler: async (ctx, { metaId }) => {
    await requireUser(ctx)
    const active = await activeCodeFor(ctx, metaId)
    if (active)
      await ctx.db.patch(active._id, { revokedAt: new Date().toISOString() })
  },
})

// --- Accès public par code (aucune session requise) -------------------------

async function campaignForCode(ctx: QueryCtx, raw: string) {
  const code = normalizeCode(raw)
  if (!code) return null
  const doc = await ctx.db
    .query('accessCodes')
    .withIndex('by_code', (q) => q.eq('code', code))
    .unique()
  if (!doc || doc.revokedAt) return null
  return doc.campaignId
}

// Validation rapide depuis la page de connexion.
export const check = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => (await campaignForCode(ctx, code)) !== null,
})

// Vue de suivi complète, protégée uniquement par le code.
export const trackingView = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const campaignId = await campaignForCode(ctx, code)
    if (!campaignId) return null
    return buildCampaignDetail(ctx, campaignId)
  },
})
