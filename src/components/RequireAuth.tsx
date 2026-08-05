import type { ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

// Bloque le rendu (et donc les requêtes Convex) tant que la session n'est
// pas confirmée ; redirige vers /login si l'utilisateur n'est pas connecté.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()

  if (isLoading) {
    return (
      <p className="demo-muted m-0 px-8 py-16 text-sm">
        Vérification de la session…
      </p>
    )
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }
  return <>{children}</>
}
