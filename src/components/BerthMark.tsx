/**
 * Berth 标识：开口的泊位 + 泊中的一点。
 * 单一形状语言：圆角方底、2px 描边、实心点。可缩到 16px 仍可辨。
 */
export function BerthMark({
  size = 26,
  tone = 'solid',
  title,
}: {
  size?: number
  tone?: 'solid' | 'outline'
  title?: string
}) {
  const solid = tone === 'solid'
  return (
    <svg
      className="brand-logo"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="9"
        fill={solid ? '#1a1a18' : 'none'}
        stroke={solid ? 'none' : '#1a1a18'}
        strokeWidth="1.5"
      />
      <path
        d="M9.5 21.6V14.2c0-1.05.85-1.9 1.9-1.9h9.2c1.05 0 1.9.85 1.9 1.9v7.4"
        stroke={solid ? '#ffffff' : '#1a1a18'}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="19.4" r="2.2" fill={solid ? '#ffffff' : '#1a1a18'} />
    </svg>
  )
}
