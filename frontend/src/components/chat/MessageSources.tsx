import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { ChatSource } from '../../api/chat'

function MessageSources({ sources }: { sources: ChatSource[] }) {
  const { t } = useTranslation()
  const headingId = useId()

  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <p id={headingId} className="text-meta font-medium text-muted-foreground">
        {t('sourceCount', { count: sources.length })}
      </p>
      <ul aria-labelledby={headingId} className="mt-2 flex flex-col gap-1.5">
        {sources.map((source) => (
          <li key={source.chunk_id}>
            <details className="rounded-lg border border-border bg-surface">
              <summary className="cursor-pointer rounded-lg px-3 py-2 text-meta wrap-anywhere marker:text-muted-foreground hover:bg-background">
                <span className="font-medium">{source.filename}</span>
                {source.page_number !== null && (
                  <span className="text-muted-foreground">
                    {' · '}
                    {t('sourcePage', { page: source.page_number })}
                  </span>
                )}
              </summary>
              <p className="mx-3 mt-1 mb-3 border-l-2 border-primary-border pl-3 text-meta whitespace-pre-wrap wrap-anywhere">
                {source.content}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MessageSources
