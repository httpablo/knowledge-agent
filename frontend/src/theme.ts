export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'knowledge-agent-theme'

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

function preferredTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function currentTheme(): Theme {
  return readStoredTheme() ?? preferredTheme()
}

export function applyInitialTheme(): void {
  document.documentElement.dataset.theme = currentTheme()
}

export function toggleTheme(): void {
  const next: Theme =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'

  document.documentElement.dataset.theme = next

  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {}
}
