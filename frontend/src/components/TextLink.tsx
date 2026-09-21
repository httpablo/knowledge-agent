import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-block rounded-sm py-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  )
}

export default TextLink
