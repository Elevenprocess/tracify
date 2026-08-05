import { getAuthUserId } from '@convex-dev/auth/server'
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server'

// Toutes les fonctions publiques de la plateforme exigent un compte connecté.
export async function requireUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getAuthUserId(ctx)
  if (userId === null) throw new Error('Connexion requise.')
  return userId
}
