export type ApiRequestOptions = RequestInit & {
  token?: string
  json?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(`Request to the API failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()

  if (!text) {
    return undefined
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractDetail(payload: unknown): unknown {
  if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
    return payload.detail
  }

  return payload
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { token, json, headers, ...init } = options

  if (json !== undefined && init.body !== undefined && init.body !== null) {
    throw new TypeError('apiRequest accepts either json or body, not both')
  }

  const requestHeaders = new Headers(headers)

  if (token) {
    requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  if (json !== undefined) {
    requestHeaders.set('Content-Type', 'application/json')
    init.body = JSON.stringify(json)
  }

  const response = await fetch(path, { ...init, headers: requestHeaders })
  const payload = await readPayload(response)

  if (!response.ok) {
    throw new ApiError(response.status, extractDetail(payload))
  }

  return payload as T
}
