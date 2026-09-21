import type { ReactNode } from 'react'

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive-subtle px-3 py-2 text-sm text-destructive"
    >
      {children}
    </p>
  )
}

export default ErrorMessage
