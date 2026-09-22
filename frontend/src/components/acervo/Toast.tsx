import { useEffect, useRef } from 'react'

import Icon from './Icon'

const TOAST_DURATION_MS = 4000

function Toast({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  // Kept in a ref so the timer only resets when the message itself changes,
  // not whenever the caller happens to re-render with a new function.
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), TOAST_DURATION_MS)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-16 z-30 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-4 py-2.5 text-[var(--accent-ink)] shadow-[var(--shadow-pop)]">
        <Icon name="check" size={16} />
        <p className="font-[family-name:var(--font-sans)] text-sm leading-5 font-medium">
          {message}
        </p>
      </div>
    </div>
  )
}

export default Toast
