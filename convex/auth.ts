import Google from '@auth/core/providers/google'
import { convexAuth } from '@convex-dev/auth/server'

// Seuls ces comptes Google peuvent accéder à la plateforme.
const ALLOWED_EMAILS = ['contact@elevenprocess.com', 'mario@elevenprocess.com']

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const email = args.profile.email?.toLowerCase()
      if (!email || !ALLOWED_EMAILS.includes(email)) {
        throw new Error(`Compte non autorisé : ${email ?? 'email inconnu'}`)
      }
      if (args.existingUserId) return args.existingUserId
      return ctx.db.insert('users', {
        email,
        name: args.profile.name,
        image: args.profile.image,
      })
    },
  },
})
