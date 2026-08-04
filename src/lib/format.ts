export type CampaignStatus = 'active' | 'paused' | 'ended'
export type ProspectStatus = 'new' | 'contacted' | 'qualified' | 'lost'

export const formatEuro = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: n < 100 ? 2 : 0,
  }).format(n)

export const formatNumber = (n: number) =>
  new Intl.NumberFormat('fr-FR').format(n)

export const formatDay = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
    new Date(`${iso}T12:00:00`),
  )

export const formatDayRange = (startIso: string, endIso: string) =>
  `${formatDay(startIso)}–${formatDay(endIso)}`

export const formatPercent = (n: number) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} %`
