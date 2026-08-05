import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { routeTree } from './routeTree.gen'

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
