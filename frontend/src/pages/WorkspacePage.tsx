import { useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import Button from '../components/acervo/Button'
import Icon from '../components/acervo/Icon'
import LanguageSwitcher from '../components/acervo/LanguageSwitcher'
import Toast from '../components/acervo/Toast'
import ChatColumn from '../components/workspace/ChatColumn'
import DocumentsColumn from '../components/workspace/DocumentsColumn'
import SourcesColumn from '../components/workspace/SourcesColumn'
import UploadModal from '../components/workspace/UploadModal'
import { useChat } from '../components/workspace/useChat'
import { useDocuments } from '../components/workspace/useDocuments'
import type { RejectedFile } from '../components/workspace/useDocuments'
import { useAuth } from '../context/useAuth'
import type { Language } from '../i18n'
import { toggleTheme } from '../theme'

type MobileTab = 'documents' | 'chat'

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function WorkspacePage() {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const [tab, setTab] = useState<MobileTab>('documents')
  const [modalOpen, setModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const [pageDragCount, setPageDragCount] = useState(0)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const docs = useDocuments(auth.status === 'authenticated' ? auth.token : '')
  const chat = useChat(auth.status === 'authenticated' ? auth.token : '')

  if (auth.status !== 'authenticated') {
    return null
  }

  async function handleFiles(files: File[]) {
    setUploading(true)
    const rejectedFiles = await docs.uploadFiles(files)
    setUploading(false)

    const addedCount = files.length - rejectedFiles.length

    if (addedCount > 0) {
      setToastMessage(t('documentsAdded', { count: addedCount }))
    }

    if (rejectedFiles.length > 0) {
      setRejected(rejectedFiles)
      setModalOpen(true)
    } else {
      setRejected([])
      setModalOpen(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setRejected([])
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--paper)] font-[family-name:var(--font-sans)] text-[var(--ink)] lg:h-dvh">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--line)] bg-[var(--paper)] px-4 sm:px-6">
        <p className="min-w-0 truncate font-[family-name:var(--font-sans)] text-sm leading-5 font-semibold text-[var(--ink)]">
          {auth.organization.name}
        </p>
        <div className="flex-1" />
        <LanguageSwitcher
          language={i18n.language as Language}
          onChange={(language) => void i18n.changeLanguage(language)}
          label={t('languageLabel')}
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon="moon"
          aria-label={t('toggleTheme')}
          onClick={toggleTheme}
        />
        <p className="hidden shrink-0 font-[family-name:var(--font-sans)] text-[13px] leading-4 font-medium text-[var(--ink-muted)] sm:block">
          {t('signedInAs', { name: auth.user.name })}
        </p>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon="logout"
          aria-label={t('logout')}
          onClick={auth.logout}
        />
      </header>

      <div role="tablist" className="flex gap-6 border-b border-[var(--line)] px-4 sm:px-6 lg:hidden">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'documents'}
          onClick={() => setTab('documents')}
          className={`flex min-h-11 items-center gap-2 border-b-2 font-[family-name:var(--font-sans)] text-sm leading-5 ${
            tab === 'documents'
              ? 'border-[var(--accent)] font-semibold text-[var(--ink)]'
              : 'border-transparent font-medium text-[var(--ink-muted)]'
          }`}
        >
          {t('documents')}
          <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--ink-muted)]">
            {docs.documents.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'chat'}
          onClick={() => setTab('chat')}
          className={`flex min-h-11 items-center gap-2 border-b-2 font-[family-name:var(--font-sans)] text-sm leading-5 ${
            tab === 'chat'
              ? 'border-[var(--accent)] font-semibold text-[var(--ink)]'
              : 'border-transparent font-medium text-[var(--ink-muted)]'
          }`}
        >
          {t('chat')}
        </button>
      </div>

      <div
        onDragEnter={(event) => {
          if (!modalOpen && !uploading && hasFiles(event)) {
            event.preventDefault()
            setPageDragCount((current) => current + 1)
          }
        }}
        onDragOver={(event) => {
          if (!modalOpen && !uploading) {
            event.preventDefault()
          }
        }}
        onDragLeave={() => setPageDragCount((current) => Math.max(0, current - 1))}
        onDrop={(event) => {
          if (modalOpen || uploading) {
            return
          }

          event.preventDefault()
          setPageDragCount(0)
          const files = Array.from(event.dataTransfer.files)

          if (files.length > 0) {
            void handleFiles(files)
          }
        }}
        className="relative flex min-h-0 flex-1 flex-col lg:flex-row"
      >
        <div className={tab === 'documents' ? 'flex min-h-0 flex-1 flex-col lg:flex-none' : 'hidden lg:flex lg:flex-none'}>
          <DocumentsColumn
            documents={docs.documents}
            formatDate={docs.formatDate}
            state={docs.state}
            retry={docs.retry}
            retryRefresh={docs.retryRefresh}
            onAdd={() => {
              setRejected([])
              setModalOpen(true)
            }}
            deleting={docs.deleting}
            deleteErrors={docs.deleteErrors}
            onDelete={docs.removeDocument}
          />
        </div>

        <div className={tab === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden lg:flex lg:min-h-0 lg:flex-1'}>
          <ChatColumn
            documentCount={docs.documents.length}
            readyCount={docs.readyCount}
            uploading={uploading}
            onFiles={handleFiles}
            chat={chat}
          />
        </div>

        <SourcesColumn sources={chat.latestSources} variant="panel" />

        {pageDragCount > 0 && !modalOpen && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]/90 text-center"
          >
            <span className="flex h-10 w-10 items-center justify-center text-[var(--ink)]">
              <Icon name="upload" size={20} />
            </span>
            <p className="font-[family-name:var(--font-serif)] text-xl leading-[26px] font-medium text-[var(--ink)]">
              {t('dropzoneDropping')}
            </p>
          </div>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {docs.announcement}
      </p>

      {toastMessage && (
        <Toast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}

      <UploadModal
        open={modalOpen}
        uploading={uploading}
        rejected={rejected}
        onFiles={handleFiles}
        onClose={closeModal}
      />
    </div>
  )
}

export default WorkspacePage
