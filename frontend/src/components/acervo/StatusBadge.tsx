import type { ReactNode } from 'react'

import Icon from './Icon'

export type BadgeStatus = 'queued' | 'processing' | 'ready' | 'failed'

const ICON_BY_STATUS: Record<BadgeStatus, 'clock' | 'check' | 'alert'> = {
  queued: 'clock',
  processing: 'clock',
  ready: 'check',
  failed: 'alert',
}

const CLASSES: Record<BadgeStatus, string> = {
  ready: 'bg-[var(--accent-soft)] text-[var(--accent-ink)]',
  processing: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  queued: 'bg-[var(--paper-sunken)] text-[var(--ink-muted)]',
  failed: 'bg-[var(--danger-soft)] text-[var(--danger)]',
}

function StatusBadge({
  status,
  children,
}: {
  status: BadgeStatus
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] py-[2px] pr-2 pl-[6px] font-[family-name:var(--font-sans)] text-xs leading-4 font-medium whitespace-nowrap ${CLASSES[status]}`}
    >
      <Icon name={ICON_BY_STATUS[status]} size={12} />
      {children}
    </span>
  )
}

export default StatusBadge
