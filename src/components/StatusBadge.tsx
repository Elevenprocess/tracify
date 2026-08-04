import type { CampaignStatus, ProspectStatus } from '../lib/format'

const CAMPAIGN_LABELS: Record<
  CampaignStatus,
  { label: string; color: string }
> = {
  active: { label: 'Active', color: 'var(--status-good)' },
  paused: { label: 'En pause', color: 'var(--status-warn)' },
  ended: { label: 'Terminée', color: 'var(--status-muted)' },
}

const PROSPECT_LABELS: Record<
  ProspectStatus,
  { label: string; color: string }
> = {
  new: { label: 'Nouveau', color: 'var(--chart-1)' },
  contacted: { label: 'Contacté', color: 'var(--status-warn)' },
  qualified: { label: 'Qualifié', color: 'var(--status-good)' },
  lost: { label: 'Perdu', color: 'var(--status-muted)' },
}

export function CampaignBadge({ status }: { status: CampaignStatus }) {
  const { label, color } = CAMPAIGN_LABELS[status]
  return <Badge label={label} color={color} />
}

export function ProspectBadge({ status }: { status: ProspectStatus }) {
  const { label, color } = PROSPECT_LABELS[status]
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
