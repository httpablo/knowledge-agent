import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DocumentResponse } from '../../api/documents'
import DocumentsColumn from './DocumentsColumn'

function makeDocument(
  overrides: Partial<DocumentResponse> = {},
): DocumentResponse {
  return {
    id: 'doc-1',
    filename: 'policy.pdf',
    status: 'READY',
    processing_error: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderColumn(documents: DocumentResponse[]) {
  return render(
    <DocumentsColumn
      documents={documents}
      formatDate={() => 'Jan 1, 2026'}
      state={{ status: 'loaded', documents, refresh: 'ok' }}
      retry={vi.fn()}
      retryRefresh={vi.fn()}
      onAdd={vi.fn()}
      deleting={{}}
      deleteErrors={{}}
      onDelete={vi.fn()}
    />,
  )
}

describe('DocumentsColumn', () => {
  it('offers Delete for READY and FAILED documents', () => {
    renderColumn([
      makeDocument({ id: 'ready-doc', filename: 'ready.pdf', status: 'READY' }),
      makeDocument({
        id: 'failed-doc',
        filename: 'failed.pdf',
        status: 'FAILED',
        processing_error: 'Could not parse file.',
      }),
    ])

    expect(
      screen.getByRole('button', { name: 'Delete ready.pdf' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Delete failed.pdf' }),
    ).toBeInTheDocument()
  })

  it('does not offer Delete for PENDING or PROCESSING documents', () => {
    renderColumn([
      makeDocument({
        id: 'pending-doc',
        filename: 'pending.pdf',
        status: 'PENDING',
      }),
      makeDocument({
        id: 'processing-doc',
        filename: 'processing.pdf',
        status: 'PROCESSING',
      }),
    ])

    expect(
      screen.queryByRole('button', { name: 'Delete pending.pdf' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete processing.pdf' }),
    ).not.toBeInTheDocument()
  })
})
