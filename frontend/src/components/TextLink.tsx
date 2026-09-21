import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {children}
    </Link>
  )
}

export default TextLink
