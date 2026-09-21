import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { ChatSource } from '../../api/chat'

function MessageSources({ sources }: { sources: ChatSource[] }) {
  const { t } = useTranslation()
  const headingId = useId()

  return (
    <div className="mt-2 border-t border-border pt-2">
      <p id={headingId} className="text-xs font-medium text-muted-foreground">
        {t('sourceCount', { count: sources.length })}
      </p>
      <ul aria-labelledby={headingId} className="mt-1.5 flex flex-col gap-1.5">
        {sources.map((source) => (
          <li key={source.chunk_id}>
            <details className="rounded-md border border-border bg-background">
              <summary className="cursor-pointer rounded-md px-2 py-1.5 text-xs wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span className="font-medium">{source.filename}</span>
                {source.page_number !== null && (
                  <span className="text-muted-foreground">
                    {' · '}
                    {t('sourcePage', { page: source.page_number })}
                  </span>
                )}
              </summary>
              <p className="border-t border-border px-2 py-2 text-xs whitespace-pre-wrap wrap-anywhere text-muted-foreground">
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
