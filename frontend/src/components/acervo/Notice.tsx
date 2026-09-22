import type { ReactNode } from 'react'

import Icon from './Icon'

function Notice({
  action,
  children,
}: {
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-4 py-3"
    >
      <span className="flex pt-px text-[var(--danger)]">
        <Icon name="alert" size={18} />
      </span>
      <p className="min-w-0 flex-1 font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink)]">
        {children}
      </p>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export default Notice
