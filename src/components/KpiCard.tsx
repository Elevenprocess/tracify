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
  hint?: string
}

export default function KpiCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  deltaGoodWhenDown = false,
  compact = false,
  hint,
}: KpiCardProps) {
  const isGood =
    delta !== undefined && (deltaGoodWhenDown ? delta <= 0 : delta >= 0)
  const isFlat = delta !== undefined && Math.abs(delta) < 0.05

  return (
    <article
      className={`island-shell relative flex flex-col rounded-2xl ${compact ? 'gap-2 p-4' : 'gap-3 p-5'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={`m-0 font-semibold text-[var(--sea-ink-soft)] ${compact ? 'text-xs' : 'text-[0.8rem]'}`}
        >
          {label}
        </p>
        {icon && (
          <span
            className={`icon-chip ${compact ? 'h-7 w-7 rounded-lg [&>svg]:h-3.5 [&>svg]:w-3.5' : ''}`}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={`tabular m-0 font-extrabold tracking-tight text-[var(--sea-ink)] ${compact ? 'text-[1.35rem] leading-tight' : 'text-[1.9rem] leading-none'}`}
      >
        {value}
      </p>
      {delta !== undefined ? (
        <p className="m-0 flex flex-wrap items-center gap-2 text-xs">
          <span
            className="tabular inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold"
            style={{
              color: isFlat
                ? 'var(--sea-ink-soft)'
                : isGood
                  ? 'var(--status-good)'
                  : 'var(--status-warn)',
              background: isFlat
                ? 'rgba(255,255,255,0.05)'
                : isGood
                  ? 'rgba(88,193,132,0.12)'
                  : 'rgba(217,160,74,0.12)',
            }}
          >
            {!isFlat && (
              <svg
                viewBox="0 0 16 16"
                width="10"
                height="10"
                aria-hidden="true"
                className={delta < 0 ? 'rotate-180' : ''}
              >
                <path fill="currentColor" d="M8 2l6 8H2z" />
              </svg>
            )}
            {delta > 0 ? '+' : ''}
            {new Intl.NumberFormat('fr-FR', {
              maximumFractionDigits: 1,
            }).format(delta)}
            %
          </span>
          {deltaLabel && (
            <span className="text-[var(--sea-ink-faint)]">{deltaLabel}</span>
          )}
        </p>
      ) : hint ? (
        <p className="m-0 text-xs text-[var(--sea-ink-faint)]">{hint}</p>
      ) : null}
    </article>
  )
}
