import type { ReactNode } from 'react'

import Icon from './Icon'

function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-4 py-3"
    >
      <span className="flex pt-px text-[var(--danger)]">
        <Icon name="alert" size={18} />
      </span>
      <p className="min-w-0 flex-1 font-[family-name:var(--font-sans)] text-sm leading-5 text-[var(--ink)]">
        {children}
      </p>
    </div>
  )
}

export default Notice
