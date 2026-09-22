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

export type MessageRole = 'USER' | 'ASSISTANT'

export type MessageResponse = {
  id: string
  role: MessageRole
  content: string
  sources: ChatSource[]
  created_at: string
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

export function getConversationMessages(
  token: string,
  conversationId: string,
  signal?: AbortSignal,
): Promise<MessageResponse[]> {
  return apiRequest<MessageResponse[]>(
    `/api/v1/conversations/${conversationId}/messages`,
    { token, signal },
  )
}
