/**
 * Datos que NO existen en wger. Dos familias distintas:
 *
 * - Agua y plan activo: se guardaban en `localStorage` porque no habia
 *   backend propio. Ahora SI lo hay (ver salaz/models/water_log.py y
 *   device_state.py): viven en el servidor, para que abrir la app desde el
 *   PC, el movil y el iPhone vea siempre el mismo dato. `localStorage` ya
 *   NO es la fuente de verdad aqui, solo la cache de TanStack Query en
 *   memoria mientras la pestana esta abierta.
 * - Favoritos y recientes: siguen siendo solo del dispositivo, de verdad
 *   (ver la nota de esa seccion mas abajo). Pendiente de subir al backend
 *   propio en un cambio futuro (ya existen `favorite-ingredient` y
 *   `recent-ingredient` en /api/v2/salaz/, pero conectarlos bien implica
 *   resolver el id de ingrediente contra wger en cada lectura, que es un
 *   cambio mayor de esta pantalla y queda para otro momento).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Paginated } from '../../lib/api'
import { leerEstadoDispositivo, escribirEstadoDispositivo, useEstadoDispositivo } from '../../lib/syncDispositivo'
import type { Ingredient } from './api'

// ------------------------------------------------------------------ agua

export const AGUA_VASO_ML = 250
export const AGUA_OBJETIVO_ML_DEFECTO = 2000

type RegistroAgua = { id: number; date: string; milliliters: number; updated_at: string }

const clavesAgua = {
  dia: (fecha: string) => ['sync', 'agua', fecha] as const,
}

async function cargarAgua(fecha: string): Promise<number> {
  const pagina = await api.get<Paginated<RegistroAgua>>(`/api/v2/salaz/water-log/?date=${fecha}`)
  return pagina.results[0]?.milliliters ?? 0
}

/** Mililitros de agua registrados en una fecha (YYYY-MM-DD), del servidor. */
export function useAgua(fecha: string) {
  return useQuery({
    queryKey: clavesAgua.dia(fecha),
    queryFn: () => cargarAgua(fecha),
    enabled: fecha.length === 10,
  })
}

/**
 * Guarda los mililitros de agua de una fecha, con actualizacion optimista:
 * el boton "+1 vaso" tiene que sentirse instantaneo, no esperar a la
 * respuesta del servidor. Si la peticion falla, se deshace (rollback) al
 * valor de antes.
 */
export function useEscribirAgua(fecha: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mililitros: number) =>
      api.post<RegistroAgua>('/api/v2/salaz/water-log/', { date: fecha, milliliters: mililitros }),
    onMutate: async (mililitros) => {
      await qc.cancelQueries({ queryKey: clavesAgua.dia(fecha) })
      const anterior = qc.getQueryData<number>(clavesAgua.dia(fecha))
      qc.setQueryData(clavesAgua.dia(fecha), mililitros)
      return { anterior }
    },
    onError: (_err, _mililitros, contexto) => {
      if (contexto?.anterior !== undefined) qc.setQueryData(clavesAgua.dia(fecha), contexto.anterior)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: clavesAgua.dia(fecha) }),
  })
}

// -------------------------------------------------------------- plan activo

// wger no tiene concepto de "plan activo": si hay varios hay que elegir uno.
// Reimplementado sobre lib/syncDispositivo.ts (clave 'plan_activo'), que es
// el mismo mecanismo que usa features/entreno/api.ts para la rutina activa:
// misma idea (una preferencia que tiene que cruzar dispositivos), un solo
// sitio que sabe hablar con /api/v2/salaz/device-state/.
const CLAVE_PLAN_ACTIVO = 'plan_activo'

export function leerPlanActivoId(): Promise<string | null> {
  return leerEstadoDispositivo(CLAVE_PLAN_ACTIVO)
}

export function escribirPlanActivoId(id: string | null): Promise<void> {
  return escribirEstadoDispositivo(CLAVE_PLAN_ACTIVO, id)
}

/** El plan activo elegido a mano, o `null` mientras carga o si no hay ninguno guardado. */
export function usePlanActivoId(): string | null {
  return useEstadoDispositivo(CLAVE_PLAN_ACTIVO)
}

// ----------------------------------------------------- favoritos / recientes

// Solo se guarda lo necesario para pintar una fila y recalcular macros:
// no hace falta el registro completo del alimento (licencias, uuid, etc).
export type AlimentoGuardado = Pick<
  Ingredient,
  | 'id'
  | 'code'
  | 'name'
  | 'brand'
  | 'energy'
  | 'protein'
  | 'carbohydrates'
  | 'carbohydrates_sugar'
  | 'fat'
  | 'fat_saturated'
  | 'fiber'
  | 'sodium'
>

export function aGuardado(ing: AlimentoGuardado): AlimentoGuardado {
  const {
    id,
    code,
    name,
    brand,
    energy,
    protein,
    carbohydrates,
    carbohydrates_sugar,
    fat,
    fat_saturated,
    fiber,
    sodium,
  } = ing
  return {
    id,
    code,
    name,
    brand,
    energy,
    protein,
    carbohydrates,
    carbohydrates_sugar,
    fat,
    fat_saturated,
    fiber,
    sodium,
  }
}

const FAVORITOS_KEY = 'salaz.alimentos.favoritos'
const RECIENTES_KEY = 'salaz.alimentos.recientes'
const RECIENTES_MAX = 30

function leerLista(clave: string): AlimentoGuardado[] {
  try {
    const raw = localStorage.getItem(clave)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AlimentoGuardado[]) : []
  } catch {
    return []
  }
}

export function leerFavoritos(): AlimentoGuardado[] {
  return leerLista(FAVORITOS_KEY)
}

export function leerRecientes(): AlimentoGuardado[] {
  return leerLista(RECIENTES_KEY)
}

export function esFavorito(id: number): boolean {
  return leerFavoritos().some((a) => a.id === id)
}

/** Anade o quita de favoritos. Devuelve la lista resultante para actualizar el estado local. */
export function alternarFavorito(ing: AlimentoGuardado): AlimentoGuardado[] {
  const actuales = leerFavoritos()
  const siguiente = actuales.some((a) => a.id === ing.id)
    ? actuales.filter((a) => a.id !== ing.id)
    : [aGuardado(ing), ...actuales]
  localStorage.setItem(FAVORITOS_KEY, JSON.stringify(siguiente))
  return siguiente
}

/** Registra un alimento como reciente (el 80% de lo que come alguien se repite). */
export function registrarReciente(ing: AlimentoGuardado): AlimentoGuardado[] {
  const sinDuplicado = leerRecientes().filter((a) => a.id !== ing.id)
  const siguiente = [aGuardado(ing), ...sinDuplicado].slice(0, RECIENTES_MAX)
  localStorage.setItem(RECIENTES_KEY, JSON.stringify(siguiente))
  return siguiente
}
