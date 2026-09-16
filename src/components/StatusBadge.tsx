import type { CampaignStatus, ProspectStatus } from '../lib/format'
import { BASE_STAGES, columnOf } from '../lib/pipeline'
import type { Stage } from '../lib/pipeline'

const CAMPAIGN_LABELS: Record<
  CampaignStatus,
  { label: string; color: string }
> = {
  active: { label: 'Active', color: 'var(--status-good)' },
  paused: { label: 'En pause', color: 'var(--status-warn)' },
  ended: { label: 'Terminée', color: 'var(--status-muted)' },
}

// Colonnes de base ; une colonne ajoutée à la main est affichée avec son
// libellé si on le connaît (prop `columns`), sinon en neutre.
const PROSPECT_LABELS: Record<string, { label: string; color: string }> =
  Object.fromEntries(
    BASE_STAGES.map((s) => [s.status, { label: s.label, color: s.color }]),
  )

export function CampaignBadge({ status }: { status: CampaignStatus }) {
  const { label, color } = CAMPAIGN_LABELS[status]
  return <Badge label={label} color={color} />
}

export function ProspectBadge({
  status,
  columns,
}: {
  status: ProspectStatus
  columns?: Array<Stage>
}) {
  const { label, color } = columns
    ? columnOf(columns, status)
    : (PROSPECT_LABELS[status] ?? columnOf(BASE_STAGES, status))
  return <Badge label={label} color={color} />
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="demo-pill whitespace-nowrap">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}
