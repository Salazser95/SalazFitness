/**
 * "Estado de dispositivo": preferencias de un solo valor que tienen que
 * cruzar PC, Android e iPhone -la rutina activa (features/entreno) y el plan
 * de nutricion activo (features/nutricion)-, en vez de vivir cada una en su
 * propio localStorage como antes.
 *
 * Backend: /api/v2/salaz/device-state/ (ver backend/salaz/models/device_state.py).
 * Ultima escritura gana: el servidor no fusiona nada, cada POST pisa al
 * anterior. `updated_at` viaja de vuelta por si algun dia hace falta un
 * cliente mas listo que compare marcas de tiempo; hoy nadie lo usa.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Paginated } from './api'
import { queryClient } from './query'

type EstadoDispositivo = { id: number; key: string; value: string; updated_at: string }

function clave(nombreClave: string) {
  return ['sync', 'device-state', nombreClave] as const
}

async function cargar(nombreClave: string): Promise<string | null> {
  const pagina = await api.get<Paginated<EstadoDispositivo>>(
    `/api/v2/salaz/device-state/?key=${nombreClave}`,
  )
  return pagina.results[0]?.value || null
}

/**
 * Lectura puntual fuera de un componente (por ejemplo, dentro del `onSuccess`
 * de otra mutacion, donde no se pueden llamar hooks). Sirve de la cache de
 * TanStack Query si ya hay algo, y si no pide al servidor.
 */
export async function leerEstadoDispositivo(nombreClave: string): Promise<string | null> {
  const cacheado = queryClient.getQueryData<string | null>(clave(nombreClave))
  if (cacheado !== undefined) return cacheado
  const valor = await cargar(nombreClave)
  queryClient.setQueryData(clave(nombreClave), valor)
  return valor
}

/**
 * Escribe la preferencia y actualiza la cache al momento (para que
 * `useEstadoDispositivo` refleje el cambio ya, sin esperar un refetch).
 * Funcion plana, no un hook: hace falta poder llamarla tanto desde
 * manejadores de eventos como desde el `onSuccess` de otras mutaciones.
 */
export async function escribirEstadoDispositivo(
  nombreClave: string,
  valor: string | null,
): Promise<void> {
  const guardado = await api.post<EstadoDispositivo>('/api/v2/salaz/device-state/', {
    key: nombreClave,
    // El campo no admite null (CharField sin null=True en el modelo): la
    // cadena vacia es "sin preferencia guardada".
    value: valor ?? '',
  })
  queryClient.setQueryData(clave(nombreClave), guardado.value || null)
}

/**
 * La preferencia, reactiva. `null` mientras carga la primera vez o si no hay
 * ninguna guardada: en los dos casos, quien la usa (`useActiveRoutine`,
 * `usePlan`...) ya sabe caer a su propio calculo por defecto (por fechas, o
 * el mas reciente), asi que no hace falta distinguir "cargando" de "vacio"
 * aqui.
 */
export function useEstadoDispositivo(nombreClave: string): string | null {
  const { data } = useQuery({
    queryKey: clave(nombreClave),
    queryFn: () => cargar(nombreClave),
    staleTime: 60_000,
  })
  return data ?? null
}
