import { useTranslation } from 'react-i18next'

import { LANGUAGE_NAMES, LANGUAGES } from '../i18n'

function LanguageSelector() {
  const { t, i18n } = useTranslation()

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="language-selector"
        className="text-sm font-medium text-muted-foreground"
      >
        {t('languageLabel')}
      </label>
      <select
        id="language-selector"
        value={i18n.language}
        onChange={(event) => {
          void i18n.changeLanguage(event.target.value)
        }}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {LANGUAGE_NAMES[language]}
          </option>
        ))}
      </select>
    </div>
  )
}

export default LanguageSelector
