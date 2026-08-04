import { ConvexHttpClient } from 'convex/browser'

// Client HTTP Convex pour les loaders de routes : permet de servir les pages
// déjà remplies (SSR + préchargement au survol), le temps réel prenant le
// relais via le websocket une fois la page hydratée.
export const convexHttp = new ConvexHttpClient(
  import.meta.env.VITE_CONVEX_URL as string,
)
