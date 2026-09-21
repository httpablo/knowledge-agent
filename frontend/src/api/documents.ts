import { apiRequest } from './client'

export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'

export type DocumentResponse = {
  id: string
  filename: string
  status: DocumentStatus
  processing_error: string | null
  created_at: string
}

export function listDocuments(
  token: string,
  signal?: AbortSignal,
): Promise<DocumentResponse[]> {
  return apiRequest<DocumentResponse[]>('/api/v1/documents', { token, signal })
}

export function uploadDocument(
  token: string,
  file: File,
  signal?: AbortSignal,
): Promise<DocumentResponse> {
  const body = new FormData()
  body.append('file', file)

  return apiRequest<DocumentResponse>('/api/v1/documents', {
    method: 'POST',
    token,
    body,
    signal,
  })
}
