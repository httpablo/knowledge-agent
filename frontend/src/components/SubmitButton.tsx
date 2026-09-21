import type { ReactNode } from 'react'

function SubmitButton({
  disabled,
  children,
}: {
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}

export default SubmitButton
