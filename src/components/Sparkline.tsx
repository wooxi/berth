/**
 * Tiny dependency-free sparkline. Keeps the last N samples per host in memory
 * (fed by the dashboard poll) and renders them as a smooth polyline.
 */

export type SparkTone = 'accent' | 'ok' | 'warn' | 'danger'

const TONE_COLOR: Record<SparkTone, string> = {
  accent: 'var(--accent)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
}

export function Sparkline({
  values,
  tone = 'accent',
  width = 76,
  height = 22,
  label,
}: {
  values: readonly number[]
  tone?: SparkTone
  width?: number
  height?: number
  label: string
}) {
  const samples = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0]
  const max = Math.max(100, ...samples)
  const step = width / (samples.length - 1)
  const points = samples
    .map((value, index) => {
      const x = index * step
      const y = height - Math.min(1, value / max) * (height - 2) - 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const area = `0,${height} ${points} ${width},${height}`
  const color = TONE_COLOR[tone]
  const gradientId = `sg-${tone}`

  return (
    <svg
      className="spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon className="spark-area" points={area} fill={`url(#${gradientId})`} />
      <polyline points={points} stroke={color} />
    </svg>
  )
}
