import type { ReactNode } from 'react'

import LanguageSelector from './LanguageSelector'

function CenteredPanel({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        {children}
        <div className="mt-8 border-t border-border pt-6">
          <LanguageSelector />
        </div>
      </div>
    </main>
  )
}

export default CenteredPanel
