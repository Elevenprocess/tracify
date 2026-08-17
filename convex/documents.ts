/**
 * Dossier client : dépôt de fichiers (tout type) dans le stockage Convex,
 * chacun avec une remarque qui sert de titre à l'affichage.
 */
import { v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import { requireUser } from './guard'

const MAX_SIZE = 50 * 1024 * 1024 // 50 Mo

// Liste du dossier avec URL de téléchargement — partagée avec l'espace
// client (access.ts).
export async function listDocuments(ctx: QueryCtx, clientSlug: string) {
  const rows = await ctx.db
    .query('documents')
    .withIndex('by_client', (q) => q.eq('clientSlug', clientSlug))
    .collect()
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return Promise.all(
    rows.map(async (d) => ({
      id: d._id,
      fileName: d.fileName,
      name: d.name?.trim() || d.fileName,
      mimeType: d.mimeType,
      size: d.size,
      remark: d.remark,
      createdAt: d.createdAt,
      url: await ctx.storage.getUrl(d.storageId),
    })),
  )
}

export const list = query({
  args: { clientSlug: v.string() },
  handler: async (ctx, { clientSlug }) => {
    await requireUser(ctx)
    return listDocuments(ctx, clientSlug)
  },
})

// 1) URL d'upload signée (le navigateur POSTe le fichier dessus)
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

// 2) Enregistrement du fichier déposé avec sa remarque
export const create = mutation({
  args: {
    clientSlug: v.string(),
    storageId: v.id('_storage'),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    remark: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await requireUser(ctx)
    const client = await ctx.db
      .query('clients')
      .withIndex('by_slug', (q) => q.eq('slug', a.clientSlug))
      .unique()
    if (!client) throw new Error('Client introuvable.')
    if (a.size > MAX_SIZE) throw new Error('Fichier trop lourd (50 Mo max).')
    return await ctx.db.insert('documents', {
      clientSlug: a.clientSlug,
      storageId: a.storageId,
      fileName: a.fileName,
      name: a.name?.trim() || undefined,
      mimeType: a.mimeType || 'application/octet-stream',
      size: a.size,
      remark: a.remark.trim(),
      createdAt: new Date().toISOString(),
    })
  },
})

// Renommer / changer la remarque
export const update = mutation({
  args: {
    id: v.id('documents'),
    name: v.optional(v.string()),
    remark: v.optional(v.string()),
  },
  handler: async (ctx, { id, name, remark }) => {
    await requireUser(ctx)
    await ctx.db.patch(id, {
      ...(name !== undefined ? { name: name.trim() || undefined } : {}),
      ...(remark !== undefined ? { remark: remark.trim() } : {}),
    })
  },
})

export const remove = mutation({
  args: { id: v.id('documents') },
  handler: async (ctx, { id }) => {
    await requireUser(ctx)
    const doc = await ctx.db.get(id)
    if (!doc) return
    await ctx.storage.delete(doc.storageId)
    await ctx.db.delete(id)
  },
})

// Outil CLI : `npx convex run documents:removeCli '{"id":"…"}'`
export const removeCli = internalMutation({
  args: { id: v.id('documents') },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id)
    if (!doc) return
    await ctx.storage.delete(doc.storageId)
    await ctx.db.delete(id)
  },
})
