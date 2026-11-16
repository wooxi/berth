import type { ReactNode } from 'react'

/** Context toolbar: sits between the tab row and the panel, swaps per tab. */
export function Toolbar({ children, info }: { children?: ReactNode; info?: ReactNode }) {
  return (
    <div className="toolbar" role="toolbar" aria-label="上下文操作">
      {children}
      {info && <span className="toolbar-info">{info}</span>}
    </div>
  )
}
