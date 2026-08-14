import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { authTables } from '@convex-dev/auth/server'

// Piège connu : ne pas se servir de _creationTime pour les dates métier,
// toujours stocker createdAt / date explicitement.
export default defineSchema({
  // Tables de Convex Auth (users, sessions, comptes OAuth…)
  ...authTables,

  clients: defineTable({
    slug: v.string(),
    name: v.string(),
    // 'project' = projet propre d'Erwan ; 'client' = client externe qui
    // commande des publicités. Absent = client.
    kind: v.optional(v.union(v.literal('client'), v.literal('project'))),
    // Compte publicitaire Meta (act_…) : ses campagnes actives sont
    // détectées et rattachées automatiquement.
    adAccountId: v.optional(v.string()),
    sector: v.optional(v.string()),
    status: v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('ended'),
    ),
    activeCampaigns: v.optional(v.number()),
    createdAt: v.string(),
  }).index('by_slug', ['slug']),

  // Campagnes Meta rattachées à un client — un simple ID de campagne suffit,
  // la sync récupère le nom, le statut et les stats depuis la Graph API.
  campaigns: defineTable({
    clientSlug: v.string(),
    metaId: v.string(),
    name: v.optional(v.string()),
    status: v.optional(v.string()),
    lastSyncedAt: v.optional(v.string()),
    syncError: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index('by_client', ['clientSlug'])
    .index('by_meta', ['metaId']),

  // Créatives (ads) d'une campagne Meta, avec miniature.
  ads: defineTable({
    campaignId: v.string(),
    adId: v.string(),
    name: v.optional(v.string()),
    status: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    updatedAt: v.string(),
  })
    .index('by_campaign', ['campaignId'])
    .index('by_ad', ['adId']),

  // Lignes quotidiennes par créative (niveau ad de la Graph API).
  adDaily: defineTable({
    campaignId: v.string(),
    adId: v.string(),
    date: v.string(),
    spend: v.number(),
    impressions: v.number(),
    clicks: v.number(),
    leads: v.number(),
  })
    .index('by_ad_date', ['adId', 'date'])
    .index('by_campaign', ['campaignId']),

  // Agrégats quotidiens (dépense € / prospects), date en YYYY-MM-DD.
  // campaignId présent pour les lignes synchronisées depuis Meta.
  dailyStats: defineTable({
    clientSlug: v.string(),
    campaignId: v.optional(v.string()),
    date: v.string(),
    spend: v.number(),
    leads: v.number(),
  })
    .index('by_client_date', ['clientSlug', 'date'])
    .index('by_campaign_date', ['campaignId', 'date'])
    .index('by_date', ['date']),

  // Répartition des prospects par source sur 30 j (agrégat seedé pour la maquette)
  sourceStats: defineTable({
    clientSlug: v.string(),
    source: v.string(),
    count: v.number(),
  }).index('by_client', ['clientSlug']),

  // Codes d'accès client : un code actif par campagne, saisi sur la page de
  // connexion pour ouvrir le suivi public de la campagne (lecture seule).
  accessCodes: defineTable({
    code: v.string(),
    // metaId de la campagne suivie
    campaignId: v.string(),
    createdAt: v.string(),
    revokedAt: v.optional(v.string()),
  })
    .index('by_code', ['code'])
    .index('by_campaign', ['campaignId']),

  prospects: defineTable({
    clientSlug: v.string(),
    // Campagne Meta à laquelle le prospect est rattaché (CRM par campagne)
    campaignId: v.optional(v.string()),
    name: v.string(),
    phone: v.string(),
    date: v.string(),
    source: v.string(),
    medium: v.string(),
    status: v.union(
      v.literal('new'),
      v.literal('contacted'),
      v.literal('qualified'),
      v.literal('lost'),
    ),
    createdAt: v.string(),
  })
    .index('by_client', ['clientSlug'])
    .index('by_campaign', ['campaignId']),
})
