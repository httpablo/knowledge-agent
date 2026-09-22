import { useTranslation } from 'react-i18next'

import type { ChatSource } from '../../api/chat'
import Icon from '../acervo/Icon'

function SourceCard({ index, source }: { index: number; source: ChatSource }) {
  const { t } = useTranslation()

  return (
    <article className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper-raised)] p-4">
      <header className="flex items-center gap-2">
        <span className="inline-flex min-w-[22px] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-[5px] py-0.5 font-[family-name:var(--font-mono)] text-xs leading-5 font-medium text-[var(--accent-ink)]">
          {index}
        </span>
        <span className="flex min-w-0 items-center gap-1 font-[family-name:var(--font-sans)] text-[13px] leading-4 font-semibold wrap-anywhere text-[var(--ink)]">
          <Icon name="file" size={14} />
          {source.filename}
        </span>
      </header>
      {source.page_number !== null && (
        <p className="font-[family-name:var(--font-mono)] text-xs leading-4 text-[var(--ink-muted)]">
          {t('sourcePage', { page: source.page_number })}
        </p>
      )}
      <blockquote className="rounded-[var(--radius-sm)] bg-[var(--paper-sunken)] p-3 font-[family-name:var(--font-serif)] text-[15px] leading-6 wrap-anywhere text-[var(--ink)]">
        {source.content}
      </blockquote>
    </article>
  )
}

function SourcesColumn({
  sources,
  variant,
}: {
  sources: ChatSource[]
  variant: 'panel' | 'inline'
}) {
  const { t } = useTranslation()

  if (sources.length === 0) {
    return null
  }

  return (
    <aside
      aria-label={t('sourcesTitle')}
      className={
        variant === 'panel'
          ? 'hidden min-h-0 lg:flex lg:w-[360px] lg:shrink-0 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:border-l lg:border-[var(--line)] lg:p-5'
          : 'flex flex-col gap-4 border-t border-[var(--line)] p-5 lg:hidden'
      }
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="font-[family-name:var(--font-serif)] text-xl leading-[26px] font-medium text-[var(--ink)]">
          {t('sourcesTitle')}
        </h2>
        <p className="font-[family-name:var(--font-sans)] text-xs leading-4 text-[var(--ink-muted)]">
          {t('sourcesCount', { count: sources.length })}
        </p>
      </header>
      <div className="flex flex-col gap-3">
        {sources.map((source, index) => (
          <SourceCard key={source.chunk_id} index={index + 1} source={source} />
        ))}
      </div>
    </aside>
  )
}

export default SourcesColumn
