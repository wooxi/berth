import { cn } from '@/lib/utils'

/** Berth 标识：开口的泊位 + 泊中的一点，颜色跟随主题主色 */
export function BerthMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg className={cn('shrink-0', className)} width={size} height={size} viewBox="0 0 32 32" fill="none" role="img" aria-label="Berth">
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="9" className="fill-primary" />
      <path
        d="M9.5 21.6V14.2c0-1.05.85-1.9 1.9-1.9h9.2c1.05 0 1.9.85 1.9 1.9v7.4"
        className="stroke-primary-foreground"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="19.4" r="2.2" className="fill-primary-foreground" />
    </svg>
  )
}
