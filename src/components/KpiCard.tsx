import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string
  icon?: ReactNode
  delta?: number
  deltaLabel?: string
  deltaGoodWhenDown?: boolean
}

export default function KpiCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  deltaGoodWhenDown = false,
}: KpiCardProps) {
  const isGood =
    delta !== undefined && (deltaGoodWhenDown ? delta <= 0 : delta >= 0)

  return (
    <article className="island-shell rounded-2xl p-5">
      <p className="island-kicker m-0 mb-3 flex items-center gap-2">
        {icon}
        {label}
      </p>
      <p className="m-0 text-3xl font-bold tracking-tight text-[var(--sea-ink)]">
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
