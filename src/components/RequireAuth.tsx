import type { ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

// Bloque le rendu (et donc les requêtes Convex) tant que la session n'est
// pas confirmée ; redirige vers /login si l'utilisateur n'est pas connecté.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        className="flex flex-1 items-center justify-center px-8 py-24"
      >
        <p className="demo-muted m-0 flex items-center gap-2 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--lagoon)]" />
          Vérification de la session…
        </p>
      </div>
    )
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }
  return <>{children}</>
}
