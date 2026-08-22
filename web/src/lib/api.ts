import { clearTokens, readTokens, writeTokens } from './tokens'

/**
 * Cliente HTTP contra el backend de wger.
 *
 * En desarrollo, Vite proxea /api y /allauth al servidor Django, asi que las
 * rutas son relativas y no hay problema de CORS ni de cookies.
 */

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Se dispara cuando la sesion caduca sin remedio. La UI escucha y saca al login. */
export const SESSION_EXPIRED = 'salaz:session-expired'

function notifySessionExpired(): void {
  clearTokens()
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED))
}

// ------------------------------------------------------------------ refresco

// Una sola peticion de refresco en vuelo, aunque fallen diez llamadas a la vez.
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const tokens = readTokens()
    if (!tokens) return null

    try {
      const res = await fetch('/allauth/app/v1/tokens/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: tokens.refresh }),
      })
      if (!res.ok) return null

      // Ojo: en el refresco los tokens vienen en `data`, no en `meta`.
      const json = (await res.json()) as {
        data?: { access_token?: string; refresh_token?: string }
      }
      const access = json.data?.access_token
      const refresh = json.data?.refresh_token
      if (!access || !refresh) return null

      writeTokens({ access, refresh })
      return access
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

// -------------------------------------------------------------------- fetch

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  /** Uso interno: evita bucles de reintento. */
  _retried?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, _retried, ...rest } = options
  const tokens = readTokens()

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  }
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json'
  if (tokens) finalHeaders.Authorization = `Bearer ${tokens.access}`

  const res = await fetch(path, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  // 401/403 con token presente: probablemente el access ha caducado.
  if ((res.status === 401 || res.status === 403) && tokens && !_retried) {
    const fresh = await refreshAccessToken()
    if (fresh) {
      return request<T>(path, { ...options, _retried: true })
    }
    notifySessionExpired()
    throw new ApiError(res.status, null, 'Sesion caducada')
  }

  if (!res.ok) {
    let parsed: unknown = null
    try {
      parsed = await res.json()
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(res.status, parsed)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// ---------------------------------------------------------------- paginacion

export type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/** Recorre todas las paginas de un listado de DRF. Con tope, por seguridad. */
export async function fetchAll<T>(path: string, maxPages = 20): Promise<T[]> {
  const out: T[] = []
  let url: string | null = path
  let pages = 0

  while (url && pages < maxPages) {
    const page: Paginated<T> = await api.get<Paginated<T>>(url)
    out.push(...page.results)
    // DRF devuelve `next` absoluto; lo pasamos a relativo para que siga usando el proxy.
    url = page.next ? new URL(page.next).pathname + new URL(page.next).search : null
    pages += 1
  }
  return out
}

// ------------------------------------------------------------------- sesion

export type LoginResult = {
  username: string
  userId: number
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await fetch('/allauth/app/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (!res.ok) {
    let detail = 'Usuario o contrasena incorrectos'
    try {
      const j = (await res.json()) as { errors?: { message?: string }[] }
      if (j.errors?.[0]?.message) detail = j.errors[0].message
    } catch {
      /* sin cuerpo */
    }
    throw new ApiError(res.status, null, detail)
  }

  const json = (await res.json()) as {
    data: { user: { id: number; username: string } }
    meta: { access_token: string; refresh_token: string }
  }

  writeTokens({ access: json.meta.access_token, refresh: json.meta.refresh_token })
  return { username: json.data.user.username, userId: json.data.user.id }
}

export function logout(): void {
  clearTokens()
}

export function hasSession(): boolean {
  return readTokens() !== null
}
