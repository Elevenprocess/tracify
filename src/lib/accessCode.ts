// Code de suivi client mémorisé dans le navigateur : saisi une fois sur la
// page de connexion, relu par /suivi à chaque visite.
export const ACCESS_CODE_KEY = 'tracify:code'

// Même normalisation que côté Convex (tolère espaces, tirets, minuscules).
export function normalizeAccessCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '')
}
