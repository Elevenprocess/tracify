import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string
  icon?: ReactNode
  delta?: number
  deltaLabel?: string
  deltaGoodWhenDown?: boolean
  // Version resserrée pour la vue de suivi client
  compact?: boolean
}

export default function KpiCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  deltaGoodWhenDown = false,
  compact = false,
}: KpiCardProps) {
  const isGood =
    delta !== undefined && (deltaGoodWhenDown ? delta <= 0 : delta >= 0)

  return (
    <article className={`island-shell rounded-2xl ${compact ? 'p-4' : 'p-5'}`}>
      <p
        className={`island-kicker m-0 flex items-center gap-2 ${compact ? 'mb-1.5' : 'mb-3'}`}
      >
        {icon}
        {label}
      </p>
      <p
        className={`m-0 font-bold tracking-tight text-[var(--sea-ink)] ${compact ? 'text-xl' : 'text-3xl'}`}
      >
        {value}
      </p>
      {delta !== undefined && (
        <p className="m-0 mt-2 flex items-center gap-1.5 text-sm font-semibold">
          <span
            className={
              isGood ? 'text-[var(--status-good)]' : 'text-[var(--status-warn)]'
            }
          >
            <svg
              viewBox="0 0 16 16"
              width="12"
              height="12"
              aria-hidden="true"
              className={`inline-block align-baseline ${delta < 0 ? 'rotate-180' : ''}`}
            >
              <path fill="currentColor" d="M8 2l6 8H2z" />
            </svg>{' '}
            {delta > 0 ? '+' : ''}
            {new Intl.NumberFormat('fr-FR', {
              maximumFractionDigits: 1,
            }).format(delta)}{' '}
            %
          </span>
          {deltaLabel && (
            <span className="font-normal text-[var(--sea-ink-soft)]">
              {deltaLabel}
            </span>
          )}
        </p>
      )}
    </article>
  )
}
