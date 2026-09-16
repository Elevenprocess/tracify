// Étapes du pipeline prospects : cinq colonnes de base (Nouveau → Perdu) et,
// par client, des colonnes ajoutées à la main (stockées dans
// clients.pipelineStages). Les colonnes ajoutées se placent avant « Perdu ».

export interface Stage {
  status: string
  label: string
  color: string
  tint: string
  // Colonne ajoutée à la main (renommable, supprimable si vide)
  custom: boolean
}

export interface CustomStage {
  key: string
  label: string
  color: string
}

export const BASE_STAGES: Array<Stage> = [
  {
    status: 'new',
    label: 'Nouveau',
    color: 'var(--lagoon)',
    tint: 'rgba(96,215,207,0.12)',
    custom: false,
  },
  {
    status: 'contacted',
    label: 'Contacté',
    color: 'var(--status-warn)',
    tint: 'rgba(217,160,74,0.12)',
    custom: false,
  },
  {
    status: 'qualified',
    label: 'Qualifié',
    color: 'var(--status-good)',
    tint: 'rgba(88,193,132,0.12)',
    custom: false,
  },
  {
    status: 'sold',
    label: 'Vente',
    color: 'var(--chart-2)',
    tint: 'rgba(131,125,230,0.14)',
    custom: false,
  },
  {
    status: 'lost',
    label: 'Perdu',
    color: 'var(--status-muted)',
    tint: 'rgba(138,165,161,0.12)',
    custom: false,
  },
]

// Couleurs proposées pour une colonne ajoutée à la main.
export const STAGE_PALETTE: Array<{ hex: string; name: string }> = [
  { hex: '#e0716c', name: 'Corail' },
  { hex: '#f28cb1', name: 'Rose' },
  { hex: '#b0762a', name: 'Ambre' },
  { hex: '#149e94', name: 'Turquoise' },
  { hex: '#4f8ef7', name: 'Bleu' },
  { hex: '#9b6bf2', name: 'Violet' },
]

export const hexToTint = (hex: string, alpha = 0.12) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(138,165,161,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

// Liste complète des colonnes d'un client : colonnes de base, les colonnes
// ajoutées à la main insérées juste avant « Perdu ».
export function buildColumns(custom?: Array<CustomStage> | null): Array<Stage> {
  const extras: Array<Stage> = (custom ?? []).map((c) => ({
    status: c.key,
    label: c.label,
    color: c.color,
    tint: hexToTint(c.color),
    custom: true,
  }))
  const lostAt = BASE_STAGES.findIndex((s) => s.status === 'lost')
  return [
    ...BASE_STAGES.slice(0, lostAt),
    ...extras,
    ...BASE_STAGES.slice(lostAt),
  ]
}

// Colonne d'un statut ; un statut inconnu (colonne supprimée…) retombe sur
// une colonne neutre pour ne pas casser l'affichage.
export const columnOf = (columns: Array<Stage>, status: string): Stage =>
  columns.find((c) => c.status === status) ?? {
    status,
    label: status,
    color: 'var(--status-muted)',
    tint: 'rgba(138,165,161,0.12)',
    custom: true,
  }
