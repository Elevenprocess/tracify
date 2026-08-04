import { useRef, useState } from 'react'

interface LineChartProps {
  data: Array<{ label: string; value: number }>
  color?: string
  formatValue: (n: number) => string
  height?: number
}

const W = 640
const PAD = { top: 16, right: 12, bottom: 26, left: 46 }

export default function LineChart({
  data,
  color = 'var(--chart-1)',
  formatValue,
  height = 220,
}: LineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const max = Math.max(...data.map((d) => d.value))
  // Arrondi au « joli » palier supérieur adapté à l'ordre de grandeur
  const rawMax = max * 1.1
  const step = Math.pow(10, Math.floor(Math.log10(rawMax)))
  const niceMax = Math.ceil(rawMax / (step / 2)) * (step / 2)
  // Pair pour que le tick médian (yMax/2) reste entier
  const yMax = niceMax % 2 === 0 ? niceMax : niceMax + 1
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const x = (i: number) => PAD.left + (i / (data.length - 1)) * plotW
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH

  const path = data
    .map(
      (d, i) =>
        `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`,
    )
    .join(' ')
  const area = `${path} L${x(data.length - 1).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${PAD.left},${(PAD.top + plotH).toFixed(1)} Z`

  const ticks = [0, yMax / 2, yMax]
  const xTickIdx = [0, Math.floor(data.length / 2), data.length - 1]

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.left) / plotW) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className="block w-full cursor-crosshair"
        role="img"
        aria-label={`Courbe : ${data[0].label} à ${data[data.length - 1].label}`}
        onPointerMove={onMove}
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

        {xTickIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 8}
            textAnchor={
              i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'
            }
            fontSize="11"
            fill="var(--sea-ink-soft)"
          >
            {data[i].label}
          </text>
        ))}

        <path d={area} fill={color} fillOpacity="0.07" />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--sea-ink-soft)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle
              cx={x(hover)}
              cy={y(data[hover].value)}
              r="4.5"
              fill={color}
              stroke="var(--surface-solid)"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-1.5 text-xs"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${hover > data.length / 2 ? 'calc(-100% - 10px)' : '10px'})`,
          }}
        >
          <span className="font-semibold text-[var(--sea-ink)]">
            {formatValue(data[hover].value)}
          </span>{' '}
          <span className="text-[var(--sea-ink-soft)]">
            {data[hover].label}
          </span>
        </div>
      )}
    </div>
  )
}
