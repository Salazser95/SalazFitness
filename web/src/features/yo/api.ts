import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, fetchAll } from '../../lib/api'
import type { Paginated } from '../../lib/api'
import { today } from '../../lib/format'
import { queryClient } from '../../lib/query'

/**
 * Acceso a la API de wger para la pantalla "Yo". Formas verificadas contra el
 * servidor real en http://127.0.0.1:8000 (login admin/adminadmin), no solo
 * contra docs/API-CONTRACT.md:
 *
 * - GET /api/v2/userprofile/ NO esta paginado: devuelve un objeto, no una
 *   lista (es el perfil del usuario logueado, uno por usuario).
 * - El campo `age` del perfil lo recalcula el servidor solo a partir de
 *   `birthdate` en cuanto se hace PATCH; no hace falta enviarlo nunca.
 * - measurement-category y measurement usan id UUID (string), no entero.
 *   Esto no esta en API-CONTRACT.md y hay que tenerlo en cuenta al tipar.
 */

// -------------------------------------------------------------- Perfil

export type UserProfile = {
  username: string
  birthdate: string | null // YYYY-MM-DD
  gender: '1' | '2'
  height: number | null // cm
  weight_unit: 'kg' | 'lb'
  work_intensity: '1' | '2' | '3'
  sport_intensity: '1' | '2' | '3'
  freetime_intensity: '1' | '2' | '3'
  calories: number
  age: number | null
}

export type UserProfilePatch = Partial<
  Pick<
    UserProfile,
    | 'birthdate'
    | 'gender'
    | 'height'
    | 'weight_unit'
    | 'work_intensity'
    | 'sport_intensity'
    | 'freetime_intensity'
    | 'calories'
  >
>

// ---------------------------------------------------------------- Peso

export type WeightEntry = {
  id: number
  date: string // ISO datetime
  weight: string
}

// ---------------------------------------------------------- Entrenamiento

export type WorkoutSession = {
  id: number
  date: string
}

export type WorkoutLog = {
  id: number
  date: string
  exercise: number
  weight: string | null
  repetitions: string | null
}

// -------------------------------------------------------------- Medidas

export type MeasurementCategory = {
  id: string
  name: string
  unit: string
}

export type Measurement = {
  id: string
  category: string
  date: string
  value: string
  notes: string
}

// --------------------------------------------------------- Fotos de progreso

/**
 * GET /api/v2/gallery/ (privado por usuario). El id es entero, a diferencia
 * de measurement-category/measurement que usan UUID: verificado en
 * .recon/openapi.json ("Image" -> id: integer). `image` llega como URL
 * completa lista para pintar en un <img>.
 */
export type GalleryPhoto = {
  id: number
  date: string // YYYY-MM-DD
  image: string
  description: string
  height: number
  width: number
}

// ------------------------------------------------------------- Claves

export const yoKeys = {
  profile: ['yo', 'profile'] as const,
  weight: ['yo', 'weight'] as const,
  sessions: ['yo', 'sessions'] as const,
  logs: ['yo', 'logs'] as const,
  categories: ['yo', 'categories'] as const,
  measurements: ['yo', 'measurements'] as const,
  version: ['yo', 'version'] as const,
  gallery: ['yo', 'gallery'] as const,
}

// -------------------------------------------------------------- Perfil

export function useUserProfile() {
  return useQuery({
    queryKey: yoKeys.profile,
    queryFn: () => api.get<UserProfile>('/api/v2/userprofile/'),
  })
}

export function useUpdateUserProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: UserProfilePatch) => api.patch<UserProfile>('/api/v2/userprofile/', patch),
    onSuccess: (data) => qc.setQueryData(yoKeys.profile, data),
  })
}

// ---------------------------------------------------------------- Peso

export function useWeightEntries() {
  return useQuery({
    queryKey: yoKeys.weight,
    queryFn: () => fetchAll<WeightEntry>('/api/v2/weightentry/'),
  })
}

export function useAddWeightEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entry: { date: string; weight: number }) =>
      api.post<WeightEntry>('/api/v2/weightentry/', entry),
    onSuccess: () => qc.invalidateQueries({ queryKey: yoKeys.weight }),
  })
}

/** Corrige un pesaje ya guardado (fecha y/o peso mal anotados). */
export function useUpdateWeightEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, date, weight }: { id: number; date: string; weight: number }) =>
      api.patch<WeightEntry>(`/api/v2/weightentry/${id}/`, { date, weight }),
    onSuccess: () => qc.invalidateQueries({ queryKey: yoKeys.weight }),
  })
}

/** Quita un pesaje que no debia estar (duplicado, prueba, dato equivocado). */
export function useDeleteWeightEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/v2/weightentry/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: yoKeys.weight }),
  })
}

// ---------------------------------------------------------- Entrenamiento

export function useWorkoutSessions() {
  return useQuery({
    queryKey: yoKeys.sessions,
    queryFn: () => fetchAll<WorkoutSession>('/api/v2/workoutsession/'),
  })
}

export function useWorkoutLogs() {
  return useQuery({
    queryKey: yoKeys.logs,
    queryFn: () => fetchAll<WorkoutLog>('/api/v2/workoutlog/'),
  })
}

// -------------------------------------------------------------- Medidas

export function useMeasurementCategories() {
  return useQuery({
    queryKey: yoKeys.categories,
    queryFn: () => fetchAll<MeasurementCategory>('/api/v2/measurement-category/'),
  })
}

export function useCreateMeasurementCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cat: { name: string; unit: string }) =>
      api.post<MeasurementCategory>('/api/v2/measurement-category/', cat),
    onSuccess: () => qc.invalidateQueries({ queryKey: yoKeys.categories }),
  })
}

export function useMeasurements() {
  return useQuery({
    queryKey: yoKeys.measurements,
    queryFn: () => fetchAll<Measurement>('/api/v2/measurement/'),
  })
}

export function useCreateMeasurement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (m: { category: string; date: string; value: number; notes?: string }) =>
      api.post<Measurement>('/api/v2/measurement/', m),
    onSuccess: () => qc.invalidateQueries({ queryKey: yoKeys.measurements }),
  })
}

// --------------------------------------------------------- Fotos de progreso

export function useGalleryPhotos() {
  return useQuery({
    queryKey: yoKeys.gallery,
    queryFn: () => fetchAll<GalleryPhoto>('/api/v2/gallery/'),
  })
}

/**
 * `api.postForm` de lib/api.ts: un FormData en vez de JSON, porque hace
 * falta `multipart/form-data`, que el navegador construye solo a partir de
 * un `FormData` (no forzar el Content-Type a mano, o pierde el boundary).
 */
export function useUploadGalleryPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('date', today())
      body.append('image', file)
      return api.postForm<GalleryPhoto>('/api/v2/gallery/', body)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: yoKeys.gallery }),
  })
}

export function useDeleteGalleryPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/v2/gallery/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: yoKeys.gallery }),
  })
}

// -------------------------------------------------------------- Ajustes

/** GET /api/v2/version/ devuelve un string suelto, p.ej. "2.7.0a2". */
export function useServerVersion() {
  return useQuery({
    queryKey: yoKeys.version,
    queryFn: () => api.get<string>('/api/v2/version/'),
    retry: false,
  })
}

// ----------------------------------------------------- Nombres de ejercicio

const cacheNombresEjercicio = new Map<number, string>()

async function nombreDeEjercicio(exerciseId: number): Promise<string> {
  const cacheado = cacheNombresEjercicio.get(exerciseId)
  if (cacheado) return cacheado

  try {
    type Resultado = { results: { name: string }[] }
    const enEspanol = await api.get<Resultado>(
      `/api/v2/exercise-translation/?exercise=${exerciseId}&language=4`,
    )
    let nombre = enEspanol.results[0]?.name
    if (!nombre) {
      const enIngles = await api.get<Resultado>(
        `/api/v2/exercise-translation/?exercise=${exerciseId}&language=2`,
      )
      nombre = enIngles.results[0]?.name
    }
    const definitivo = nombre ?? `Ejercicio #${exerciseId}`
    cacheNombresEjercicio.set(exerciseId, definitivo)
    return definitivo
  } catch {
    return `Ejercicio #${exerciseId}`
  }
}

export function useExerciseNames(ids: number[]) {
  const unicos = Array.from(new Set(ids)).sort((a, b) => a - b)
  return useQuery({
    queryKey: ['yo', 'exercise-names', unicos],
    queryFn: async () => {
      const entradas = await Promise.all(
        unicos.map(async (id) => [id, await nombreDeEjercicio(id)] as const),
      )
      return new Map(entradas)
    },
    enabled: unicos.length > 0,
    staleTime: 5 * 60_000,
  })
}

// -------------------------------------------------------- objetivo de peso

// wger no tiene campos para esto: se ha comprobado que "goal_weight" da 0
// resultados en el repositorio (ver docs/API-CONTRACT.md). Vive en el
// servidor propio (salaz/models/weight_goal.py): antes estaba en
// localStorage, y por eso cambiarlo en un dispositivo no se notaba en otro.
export type TipoObjetivo =
  | 'perder_peso'
  | 'mantener_peso'
  | 'ganar_peso'
  | 'ganar_masa_muscular'
  | 'mejorar_fuerza'
  | 'recomposicion_corporal'

export const TIPOS_OBJETIVO: { value: TipoObjetivo; label: string }[] = [
  { value: 'perder_peso', label: 'Perder peso' },
  { value: 'mantener_peso', label: 'Mantener peso' },
  { value: 'ganar_peso', label: 'Ganar peso' },
  { value: 'ganar_masa_muscular', label: 'Ganar masa muscular' },
  { value: 'mejorar_fuerza', label: 'Mejorar fuerza' },
  { value: 'recomposicion_corporal', label: 'Recomposición corporal' },
]

export type Objetivo = {
  peso: number | null
  fecha: string | null // YYYY-MM-DD
  tipo: TipoObjetivo | null
}

type ObjetivoPesoApi = {
  id: number
  goal_type: TipoObjetivo | ''
  target_weight: string | null
  target_date: string | null
  updated_at: string
}

const OBJETIVO_VACIO: Objetivo = { peso: null, fecha: null, tipo: null }

function objetivoDesdeApi(o: ObjetivoPesoApi | undefined): Objetivo {
  if (!o) return OBJETIVO_VACIO
  return {
    peso: o.target_weight !== null ? Number(o.target_weight) : null,
    fecha: o.target_date,
    tipo: o.goal_type || null,
  }
}

async function cargarObjetivo(): Promise<Objetivo> {
  const pagina = await api.get<Paginated<ObjetivoPesoApi>>('/api/v2/salaz/weight-goal/')
  return objetivoDesdeApi(pagina.results[0])
}

const claveObjetivo = ['yo', 'objetivo-peso'] as const

export function useObjetivo() {
  return useQuery({ queryKey: claveObjetivo, queryFn: cargarObjetivo })
}

/**
 * Guarda el objetivo con actualizacion optimista (los campos del formulario
 * tienen que sentirse instantaneos al escribir), y con retardo: sin el
 * retardo, cada digito escrito en "peso objetivo" mandaria una peticion
 * suelta. `useDebouncedCallback` en YoPage.tsx es quien decide cuando llamar
 * a `mutate`; este hook solo sabe guardar y hacer rollback si falla.
 */
export function useGuardarObjetivo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (o: Objetivo) =>
      api.post<ObjetivoPesoApi>('/api/v2/salaz/weight-goal/', {
        goal_type: o.tipo ?? '',
        target_weight: o.peso !== null ? String(o.peso) : null,
        target_date: o.fecha,
      }),
    onMutate: async (o) => {
      await qc.cancelQueries({ queryKey: claveObjetivo })
      const anterior = qc.getQueryData<Objetivo>(claveObjetivo)
      qc.setQueryData(claveObjetivo, o)
      return { anterior }
    },
    onError: (_err, _o, contexto) => {
      if (contexto?.anterior) qc.setQueryData(claveObjetivo, contexto.anterior)
    },
    onSuccess: (guardado) => qc.setQueryData(claveObjetivo, objetivoDesdeApi(guardado)),
  })
}

/** Lectura puntual fuera de un componente (usada por la exportacion de datos de Ajustes). */
export function leerObjetivo(): Promise<Objetivo> {
  const cacheado = queryClient.getQueryData<Objetivo>(claveObjetivo)
  if (cacheado) return Promise.resolve(cacheado)
  return cargarObjetivo()
}
