import { useState } from 'react'

interface BarChartProps {
  data: Array<{ label: string; value: number }>
  color?: string
  formatValue: (n: number) => string
  height?: number
}

const W = 640
const PAD = { top: 16, right: 12, bottom: 26, left: 36 }

export default function BarChart({
  data,
  color = 'var(--chart-1)',
  formatValue,
  height = 220,
}: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null)

  const max = Math.max(...data.map((d) => d.value))
  const yMax = Math.max(1, Math.ceil((max * 1.15) / 5) * 5)
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const slot = plotW / data.length
  const barW = Math.min(64, slot * 0.55)

  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH
  const ticks = [0, yMax / 2, yMax]

  // Barre à sommet arrondi (4px), ancrée à la ligne de base
  const barPath = (cx: number, v: number) => {
    const top = y(v)
    const bottom = PAD.top + plotH
    const r = Math.min(4, (bottom - top) / 2, barW / 2)
    const x0 = cx - barW / 2
    return `M${x0},${bottom} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${bottom} Z`
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="block w-full"
        role="img"
        aria-label="Histogramme"
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--chart-grid)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--sea-ink-soft)"
            >
              {formatValue(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2
          return (
            <g key={d.label}>
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
              />
              <path
                d={barPath(cx, d.value)}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.45}
                pointerEvents="none"
                style={{ transition: 'opacity 150ms ease' }}
              />
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--sea-ink-soft)"
              >
                {d.label}
              </text>
              {hover === i && (
                <text
                  x={cx}
                  y={y(d.value) - 8}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill="var(--sea-ink)"
                >
                  {formatValue(d.value)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
