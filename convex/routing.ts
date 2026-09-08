/**
 * Aiguillage des leads vers la bonne campagne, partagé par le webhook
 * (convex/leads.ts) et la synchro GoHighLevel (convex/ghl.ts).
 *
 * Règle : un lead ne va JAMAIS dans une campagne « par défaut ». Il est
 * rangé dans la campagne Meta désignée par son attribution (campaignId de
 * GHL = ID de campagne Meta), créée à la volée si Tracify ne la connaît pas
 * encore ; sans attribution, il est ignoré (aucun risque de le déposer par
 * erreur dans une autre campagne).
 */
import type { MutationCtx } from './_generated/server'
import { internal } from './_generated/api'

export type Routed =
  | { kind: 'campaign'; metaId: string; created: boolean }
  // Pas d'ID de campagne dans le lead.
  | { kind: 'none' }
  // L'ID désigne une campagne déjà rattachée à un AUTRE client.
  | { kind: 'other-client'; metaId: string }

export async function routeToCampaign(
  ctx: MutationCtx,
  clientSlug: string,
  campaignId: string | undefined,
  campaignName: string | undefined,
): Promise<Routed> {
  const metaId = campaignId?.trim().replace(/\s/g, '') ?? ''
  if (!metaId) return { kind: 'none' }

  const existing = await ctx.db
    .query('campaigns')
    .withIndex('by_meta', (q) => q.eq('metaId', metaId))
    .unique()
  if (existing) {
    if (existing.clientSlug !== clientSlug)
      return { kind: 'other-client', metaId }
    // Nom connu côté GHL mais pas encore côté Tracify (Meta injoignable).
    if (!existing.name && campaignName)
      await ctx.db.patch(existing._id, { name: campaignName })
    return { kind: 'campaign', metaId, created: false }
  }

  // Nouvelle campagne détectée : créée pour ce client, la synchro Meta
  // complète nom officiel, statut et statistiques si le token y a accès.
  const id = await ctx.db.insert('campaigns', {
    clientSlug,
    metaId,
    name: campaignName?.trim() || undefined,
    origin: 'ghl',
    createdAt: new Date().toISOString(),
  })
  await ctx.scheduler.runAfter(0, internal.meta.syncCampaign, {
    id,
    clientSlug,
    metaId,
    origin: 'ghl',
  })
  return { kind: 'campaign', metaId, created: true }
}
