import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Piège connu : ne pas se servir de _creationTime pour les dates métier,
// toujours stocker createdAt / date explicitement.
export default defineSchema({
  clients: defineTable({
    slug: v.string(),
    name: v.string(),
    sector: v.string(),
    status: v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('ended'),
    ),
    activeCampaigns: v.number(),
    createdAt: v.string(),
  }).index('by_slug', ['slug']),

  // Agrégats quotidiens par client (dépense € / prospects), date en YYYY-MM-DD
  dailyStats: defineTable({
    clientSlug: v.string(),
    date: v.string(),
    spend: v.number(),
    leads: v.number(),
  })
    .index('by_client_date', ['clientSlug', 'date'])
    .index('by_date', ['date']),

  // Répartition des prospects par source sur 30 j (agrégat seedé pour la maquette)
  sourceStats: defineTable({
    clientSlug: v.string(),
    source: v.string(),
    count: v.number(),
  }).index('by_client', ['clientSlug']),

  prospects: defineTable({
    clientSlug: v.string(),
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
  }).index('by_client', ['clientSlug']),
})
