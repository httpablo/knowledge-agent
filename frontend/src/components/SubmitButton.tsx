import type { ReactNode } from 'react'

function SubmitButton({
  disabled,
  fullWidth = true,
  children,
}: {
  disabled?: boolean
  fullWidth?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={`${fullWidth ? 'w-full' : ''} rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground enabled:hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-muted-foreground`}
    >
      {children}
    </button>
  )
}

export default SubmitButton
