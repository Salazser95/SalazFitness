/**
 * Alta de cuenta y confirmacion por correo.
 *
 * Habla con /api/v2/salaz/account/ (ver backend/salaz/api/cuentas.py). Son los
 * unicos endpoints de la app que se llaman SIN sesion: quien se registra
 * todavia no tiene cuenta con la que autenticarse.
 */

import { useMutation } from '@tanstack/react-query'

import { ApiError, api } from '../../lib/api'

const BASE = '/api/v2/salaz/account'

export type RespuestaRegistro = {
  detail: string
  username: string
  email: string
  verified: boolean
}

export type RespuestaVerificacion = {
  detail: string
  username?: string
  verified?: boolean
}

/**
 * Saca un mensaje legible del cuerpo de error de DRF.
 *
 * DRF responde de dos formas distintas: `{"detail": "..."}` para los errores
 * que lanza la vista, y `{"campo": ["...", "..."]}` para los del serializer.
 * Sin esto, un usuario repetido salia en pantalla como "HTTP 400".
 */
export function mensajeDeError(error: unknown, porDefecto: string): string {
  if (!(error instanceof ApiError) || error.body === null || typeof error.body !== 'object') {
    return porDefecto
  }
  const cuerpo = error.body as Record<string, unknown>
  if (typeof cuerpo.detail === 'string') return cuerpo.detail

  const mensajes = Object.values(cuerpo)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string => typeof v === 'string')
  return mensajes.length > 0 ? mensajes.join(' ') : porDefecto
}

export function useRegistro() {
  return useMutation({
    mutationFn: (datos: { username: string; email: string; password: string }) =>
      api.post<RespuestaRegistro>(`${BASE}/register/`, datos),
  })
}

export function useVerificar() {
  return useMutation({
    mutationFn: (token: string) => api.post<RespuestaVerificacion>(`${BASE}/verify/`, { token }),
  })
}

export function useReenviarCorreo() {
  return useMutation({
    mutationFn: (email: string) => api.post<{ detail: string }>(`${BASE}/resend/`, { email }),
  })
}
