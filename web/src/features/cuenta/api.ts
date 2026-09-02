/**
 * Alta de cuenta y confirmacion por correo.
 *
 * Habla con /api/v2/salaz/account/ (ver backend/salaz/api/cuentas.py). Son los
 * unicos endpoints de la app que se llaman SIN sesion: quien se registra
 * todavia no tiene cuenta con la que autenticarse.
 */

import { useMutation } from '@tanstack/react-query'

import { api } from '../../lib/api'

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

// mensajeDeError vive en lib/api.ts (es generico, no tiene nada de "cuenta");
// se re-exporta aqui para no tocar los sitios que ya lo importan de aqui.
export { mensajeDeError } from '../../lib/api'

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
