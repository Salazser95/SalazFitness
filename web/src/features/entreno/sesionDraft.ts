import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../../lib/api'
import type { Paginated } from '../../lib/api'
import type { SesionProgreso } from './lib/sesionStorage'

/**
 * Progreso de una sesion de gimnasio en curso, en el servidor
 * (/api/v2/salaz/workout-session-draft/, ver
 * backend/salaz/models/workout_session_draft.py). Antes vivia solo en
 * localStorage (lib/sesionStorage.ts): recargar la pagina en el mismo
 * dispositivo no lo perdia, pero cambiar de PC a movil a media sesion si.
 * Uno por (usuario, fecha): escribir el mismo dia lo actualiza, nunca
 * duplica (get_or_create en el backend).
 */

type RegistroDraft = {
  id: number
  date: string
  content: SesionProgreso | Record<string, never>
  updated_at: string
}

function claveDraft(fecha: string) {
  return ['entreno', 'sesion-draft', fecha] as const
}

function esProgresoValido(contenido: RegistroDraft['content']): contenido is SesionProgreso {
  return Object.keys(contenido).length > 0
}

async function cargarDraft(fecha: string): Promise<SesionProgreso | null> {
  const pagina = await api.get<Paginated<RegistroDraft>>(
    `/api/v2/salaz/workout-session-draft/?date=${fecha}`,
  )
  const contenido = pagina.results[0]?.content
  return contenido && esProgresoValido(contenido) ? contenido : null
}

/** El progreso guardado para esa fecha, o null si no hay ninguno (sesion nueva). */
export function useSesionDraft(fecha: string) {
  return useQuery({
    queryKey: claveDraft(fecha),
    queryFn: () => cargarDraft(fecha),
    enabled: fecha.length === 10,
  })
}

/**
 * Guarda el progreso completo. Quien la use debe llamarla con moderacion
 * (debounce): el progreso cambia en cada serie marcada o cada cifra
 * tecleada, y no hace falta una peticion por cada una (ver el mismo patron
 * en features/yo/YoPage.tsx para el objetivo de peso).
 */
export function useGuardarSesionDraft(fecha: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (progreso: SesionProgreso) =>
      api.post<RegistroDraft>('/api/v2/salaz/workout-session-draft/', {
        date: fecha,
        content: progreso,
      }),
    onSuccess: (registro) => {
      qc.setQueryData(claveDraft(fecha), esProgresoValido(registro.content) ? registro.content : null)
    },
  })
}

/**
 * "Borra" el progreso guardado (al terminar la sesion con exito): en la
 * practica escribe un contenido vacio en la misma fila en vez de un DELETE,
 * asi no hace falta que quien la llama sepa el id de la fila.
 */
export function useLimpiarSesionDraft(fecha: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<RegistroDraft>('/api/v2/salaz/workout-session-draft/', { date: fecha, content: {} }),
    onSuccess: () => {
      qc.setQueryData(claveDraft(fecha), null)
    },
  })
}
