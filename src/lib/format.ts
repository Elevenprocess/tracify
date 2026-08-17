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

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

// « il y a 3 h », « il y a 2 j »… pour les dates récentes
export const formatAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `il y a ${d} j`
  return formatDay(iso.slice(0, 10))
}

export const isRecent = (iso: string, hours = 24) =>
  Date.now() - new Date(iso).getTime() < hours * 3_600_000
