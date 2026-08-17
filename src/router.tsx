import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { routeTree } from './routeTree.gen'

// Après un déploiement, une page encore ouverte (ou servie depuis le cache
// ISR) référence des chunks JS de l'ancien build, supprimés par le nouveau →
// « Failed to fetch dynamically imported module ». On recharge une fois pour
// récupérer le nouveau HTML ; sessionStorage évite une boucle si ça persiste.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    const key = 'tracify:chunk-reload'
    const last = Number(sessionStorage.getItem(key) ?? 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem(key, String(Date.now()))
    event.preventDefault()
    window.location.reload()
  })
}

export function getRouter() {
  const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL)

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    Wrap: ({ children }) => (
      <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>
    ),
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
