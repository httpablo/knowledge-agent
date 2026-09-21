import { useTranslation } from 'react-i18next'

import { LANGUAGE_NAMES, LANGUAGES } from '../i18n'

function LanguageSelector() {
  const { t, i18n } = useTranslation()

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="language-selector"
        className="text-meta font-medium text-muted-foreground"
      >
        {t('languageLabel')}
      </label>
      <select
        id="language-selector"
        value={i18n.language}
        onChange={(event) => {
          void i18n.changeLanguage(event.target.value)
        }}
        className="cursor-pointer rounded-md border border-border bg-surface py-2 pr-2 pl-2.5 text-sm hover:border-muted-foreground sm:py-1.5"
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
