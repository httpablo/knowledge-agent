import type { ReactNode } from 'react'

import LanguageSelector from './LanguageSelector'

function CenteredPanel({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-6 sm:py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <p className="mb-6 text-sm font-semibold tracking-tight text-primary">
          Knowledge Agent
        </p>
        {children}
        <div className="mt-8 border-t border-border pt-5">
          <LanguageSelector />
        </div>
      </div>
    </main>
  )
}

export default CenteredPanel
