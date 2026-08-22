/**
 * Almacen de credenciales.
 *
 * El access token de wger vive 5 minutos y el refresh 120 dias, y el refresh
 * ROTA en cada uso: hay que guardar siempre el nuevo o la sesion se pierde.
 * Ver docs/API-CONTRACT.md.
 */

const ACCESS_KEY = 'salaz.access'
const REFRESH_KEY = 'salaz.refresh'

export type Tokens = {
  access: string
  refresh: string
}

export function readTokens(): Tokens | null {
  const access = localStorage.getItem(ACCESS_KEY)
  const refresh = localStorage.getItem(REFRESH_KEY)
  return access && refresh ? { access, refresh } : null
}

export function writeTokens(tokens: Tokens): void {
  localStorage.setItem(ACCESS_KEY, tokens.access)
  localStorage.setItem(REFRESH_KEY, tokens.refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}
