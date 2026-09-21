import { apiRequest } from './client'

export type AuthenticatedUser = {
  id: string
  name: string
  email: string
}

export type Organization = {
  id: string
  name: string
}

export type MeResponse = {
  user: AuthenticatedUser
  organization: Organization
}

export type LoginCredentials = {
  email: string
  password: string
}

export type TokenResponse = {
  access_token: string
  token_type: string
}

export function login(
  credentials: LoginCredentials,
): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    json: credentials,
  })
}

export function getMe(
  token: string,
  signal?: AbortSignal,
): Promise<MeResponse> {
  return apiRequest<MeResponse>('/api/v1/auth/me', { token, signal })
}
