import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import de from './de'
import en from './en'
import pt from './pt'

export const LANGUAGES = ['en', 'pt', 'de'] as const

export type Language = (typeof LANGUAGES)[number]

// Endonyms: a language is always offered in its own name, so it stays
// recognisable no matter which language is active.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  pt: 'Português',
  de: 'Deutsch',
}

const DEFAULT_LANGUAGE: Language = 'en'
const STORAGE_KEY = 'knowledge-agent-language'

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

function storeLanguage(language: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // A rejected write only costs the preference, not the session.
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pt: { translation: pt },
    de: { translation: de },
  },
  lng: readStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
})

document.documentElement.lang = i18n.language

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
  storeLanguage(language)
})

export default i18n
