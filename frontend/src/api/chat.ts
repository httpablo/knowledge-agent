import { apiRequest } from './client'

export type ChatRequest = {
  question: string
  conversation_id?: string
}

export type ChatSource = {
  chunk_id: string
  document_id: string
  filename: string
  page_number: number | null
  content: string
}

export type ChatResponse = {
  conversation_id: string
  message_id: string
  answerable: boolean
  answer: string
  sources: ChatSource[]
}

export function sendChatMessage(
  token: string,
  request: ChatRequest,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  return apiRequest<ChatResponse>('/api/v1/chat', {
    method: 'POST',
    token,
    json: request,
    signal,
  })
}
