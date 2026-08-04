import { formatNumber } from '../../lib/format'

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)']

interface SourceSplitProps {
  data: Array<{ label: string; value: number }>
}

export default function SourceSplit({ data }: SourceSplitProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {data.map((d, i) => {
        const pct = total === 0 ? 0 : (d.value / total) * 100
        return (
          <li key={d.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-semibold text-[var(--sea-ink)]">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: COLORS[i % COLORS.length] }}
                  aria-hidden="true"
                />
                {d.label}
              </span>
              <span className="text-[var(--sea-ink-soft)]">
                {formatNumber(d.value)} · {pct.toFixed(0)} %
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--chart-grid)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: COLORS[i % COLORS.length],
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
