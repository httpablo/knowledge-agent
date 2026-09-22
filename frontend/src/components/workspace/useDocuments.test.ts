import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocumentResponse } from '../../api/documents'
import { useDocuments } from './useDocuments'

vi.mock('../../api/documents', () => ({
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}))

const { listDocuments, uploadDocument, deleteDocument } = await import(
  '../../api/documents'
)
const listDocumentsMock = vi.mocked(listDocuments)
const uploadDocumentMock = vi.mocked(uploadDocument)
const deleteDocumentMock = vi.mocked(deleteDocument)

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

beforeEach(() => {
  listDocumentsMock.mockReset()
  uploadDocumentMock.mockReset()
  deleteDocumentMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDocuments', () => {
  it('lists documents after the initial load', async () => {
    const docs = [makeDocument({ id: 'doc-1' }), makeDocument({ id: 'doc-2' })]
    listDocumentsMock.mockResolvedValue(docs)

    const { result } = renderHook(() => useDocuments('token'))

    await waitFor(() => expect(result.current.state.status).toBe('loaded'))
    expect(result.current.documents).toHaveLength(2)
  })

  it('adds an uploaded document locally as PENDING', async () => {
    listDocumentsMock.mockResolvedValue([])
    const { result } = renderHook(() => useDocuments('token'))
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))

    const pending = makeDocument({ id: 'doc-new', status: 'PENDING' })
    uploadDocumentMock.mockResolvedValue(pending)
    const file = new File(['content'], 'policy.pdf', {
      type: 'application/pdf',
    })

    await act(async () => {
      await result.current.uploadFiles([file])
    })

    expect(result.current.documents.map((d) => d.id)).toContain('doc-new')
    expect(
      result.current.documents.find((d) => d.id === 'doc-new')?.status,
    ).toBe('PENDING')
  })

  it('polls while a document is PENDING or PROCESSING', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    listDocumentsMock.mockResolvedValue([
      makeDocument({ id: 'doc-1', status: 'PROCESSING' }),
    ])

    const { result } = renderHook(() => useDocuments('token'))
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))
    expect(listDocumentsMock).toHaveBeenCalledTimes(1)

    listDocumentsMock.mockResolvedValue([
      makeDocument({ id: 'doc-1', status: 'READY' }),
    ])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(listDocumentsMock).toHaveBeenCalledTimes(2)
  })

  it('stops polling once documents are READY or FAILED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    listDocumentsMock.mockResolvedValue([
      makeDocument({ id: 'doc-1', status: 'READY' }),
      makeDocument({ id: 'doc-2', status: 'FAILED' }),
    ])

    const { result } = renderHook(() => useDocuments('token'))
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))
    expect(listDocumentsMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(listDocumentsMock).toHaveBeenCalledTimes(1)
  })

  it('preserves the existing list when a poll refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const original = [makeDocument({ id: 'doc-1', status: 'PENDING' })]
    listDocumentsMock.mockResolvedValueOnce(original)

    const { result } = renderHook(() => useDocuments('token'))
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))

    listDocumentsMock.mockRejectedValueOnce(new Error('network down'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(result.current.documents).toEqual(original)
    expect(
      result.current.state.status === 'loaded' && result.current.state.refresh,
    ).toBe('failed')
  })

  it('removes only the deleted document on a successful delete', async () => {
    const docs = [
      makeDocument({ id: 'doc-1', status: 'READY' }),
      makeDocument({ id: 'doc-2', status: 'READY' }),
    ]
    listDocumentsMock.mockResolvedValue(docs)
    deleteDocumentMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useDocuments('token'))
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))

    await act(async () => {
      await result.current.removeDocument('doc-1')
    })

    expect(result.current.documents.map((d) => d.id)).toEqual(['doc-2'])
  })

  it('keeps the document and records the error when delete fails', async () => {
    const docs = [makeDocument({ id: 'doc-1', status: 'READY' })]
    listDocumentsMock.mockResolvedValue(docs)
    deleteDocumentMock.mockRejectedValue(new Error('delete failed'))

    const { result } = renderHook(() => useDocuments('token'))
    await waitFor(() => expect(result.current.state.status).toBe('loaded'))

    await act(async () => {
      await result.current.removeDocument('doc-1')
    })

    expect(result.current.documents.map((d) => d.id)).toEqual(['doc-1'])
    expect(result.current.deleteErrors['doc-1']).toBe(true)
  })
})
