import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Camera, Check, Download, LogOut, Pencil, Plus, Ruler, Scale, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CLAVE_IDIOMA, IDIOMAS_DISPONIBLES } from '../../i18n'
import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  PageTitle,
  SectionLabel,
  SkeletonList,
  StatCard,
  Thumbnail,
} from '../../components/ui'
import { int, kg, num, shortDate, today } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import { useAjustes } from '../../lib/settings'
import {
  SERVIDOR_POR_DEFECTO,
  escribirServidor,
  normalizarServidor,
  servidorActual,
  urlApi,
} from '../../lib/config'
import {
  useAddWeightEntry,
  useCreateMeasurement,
  useCreateMeasurementCategory,
  useDeleteGalleryPhoto,
  useDeleteWeightEntry,
  useExerciseNames,
  useGalleryPhotos,
  useMeasurementCategories,
  useMeasurements,
  useUpdateUserProfile,
  useUpdateWeightEntry,
  useUploadGalleryPhoto,
  useUserProfile,
  useWeightEntries,
  useWorkoutLogs,
  useWorkoutSessions,
  leerObjetivo,
  TIPOS_OBJETIVO,
  useGuardarObjetivo,
  useObjetivo,
  type Objetivo,
  type TipoObjetivo,
  type UserProfilePatch,
  type WeightEntry,
} from './api'
import { BarraProgreso, SelectField, TabBar, ToggleField, type TabId } from './components'
import {
  calcularEdad,
  calcularIMC,
  calcularRecords,
  calcularSesionesSemanales,
  calcularVolumenSemanal,
  clasificarIMC,
  cortarPorRango,
  etiquetaSemana,
  mediaMovil7,
  pesoActualConDelta,
  ritmoSemanalNecesario,
  type ColorClasificacion,
  type PuntoPeso,
  type Rango,
} from './utils'

// Colores de graficas del sistema de diseno, en este orden fijo (ver
// "Colores de graficas" en docs/DESIGN-SYSTEM.md). Recharts pinta en SVG y
// necesita el valor resuelto, no la variable CSS: es la unica excepcion
// documentada al "nunca hex suelto".
const COLORES_GRAFICA = ['#C6F135', '#22D3EE', '#A78BFA', '#FBBF24', '#F87171', '#34D399']

const tooltipStyle = {
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  color: 'var(--color-fg)',
}

// Clases estaticas: Tailwind no detecta clases construidas con template
// literals, asi que el color de la clasificacion del IMC sale de un mapa
// fijo con las cuatro variantes escritas literalmente.
const imcColorClass: Record<ColorClasificacion, string> = {
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

const CATEGORIAS_HABITUALES = [
  { name: 'Cintura', unit: 'cm' },
  { name: 'Cadera', unit: 'cm' },
  { name: 'Pecho', unit: 'cm' },
  { name: 'Brazo', unit: 'cm' },
  { name: 'Muslo', unit: 'cm' },
]

const RANGOS: Rango[] = ['1m', '3m', '6m', 'todo']

const SUPERMERCADOS_HABITUALES = ['Mercadona', 'Carrefour', 'Lidl', 'Dia', 'Alcampo']
const OTRO_SUPERMERCADO = 'Otro'

// ------------------------------------------------------------------ Perfil

const OBJETIVO_VACIO: Objetivo = { peso: null, fecha: null, tipo: null }

function PerfilTab() {
  const profileQ = useUserProfile()
  const updateProfile = useUpdateUserProfile()
  const pesoQ = useWeightEntries()
  const objetivoQ = useObjetivo()
  const guardarObjetivo = useGuardarObjetivo()

  const [form, setForm] = useState<UserProfilePatch | null>(null)
  // Borrador local del objetivo: el usuario escribe aqui y se guarda con
  // retardo (ver actualizarObjetivo), igual que `form` de arriba espera a
  // que llegue el perfil del servidor antes de sembrarse. `objetivo` (sin
  // sufijo) es la version no nula que usa el resto del componente: mientras
  // el servidor no ha respondido todavia, se ve como un objetivo vacio, no
  // como una pantalla de carga aparte.
  const [objetivoDraft, setObjetivoDraft] = useState<Objetivo | null>(null)
  const objetivo = objetivoDraft ?? OBJETIVO_VACIO
  const temporizadorObjetivo = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (objetivoQ.data && objetivoDraft === null) setObjetivoDraft(objetivoQ.data)
  }, [objetivoQ.data, objetivoDraft])

  useEffect(() => {
    if (profileQ.data && form === null) {
      setForm({
        birthdate: profileQ.data.birthdate,
        gender: profileQ.data.gender,
        height: profileQ.data.height,
        weight_unit: profileQ.data.weight_unit,
        work_intensity: profileQ.data.work_intensity,
        sport_intensity: profileQ.data.sport_intensity,
        freetime_intensity: profileQ.data.freetime_intensity,
        calories: profileQ.data.calories,
      })
    }
  }, [profileQ.data, form])

  const pesoActual = useMemo(
    () => (pesoQ.data ? pesoActualConDelta(pesoQ.data) : null),
    [pesoQ.data],
  )
  const primerPeso = useMemo(() => {
    if (!pesoQ.data || pesoQ.data.length === 0) return null
    return Number([...pesoQ.data].sort((a, b) => a.date.localeCompare(b.date))[0].weight)
  }, [pesoQ.data])

  const edad = form ? calcularEdad(form.birthdate) : null
  const imc = form && pesoActual && form.height ? calcularIMC(pesoActual.actual, form.height) : null
  const clasificacion = imc !== null ? clasificarIMC(imc) : null

  const progresoObjetivo = useMemo(() => {
    if (objetivo.peso === null || primerPeso === null || !pesoActual) return null
    const total = Math.abs(objetivo.peso - primerPeso)
    if (total === 0) return 100
    const avanzado = Math.abs(pesoActual.actual - primerPeso)
    return Math.min(100, Math.round((avanzado / total) * 100))
  }, [objetivo.peso, primerPeso, pesoActual])

  const ritmo = useMemo(() => {
    if (objetivo.peso === null || objetivo.fecha === null || !pesoActual) return null
    return ritmoSemanalNecesario(pesoActual.actual, objetivo.peso, objetivo.fecha)
  }, [objetivo.peso, objetivo.fecha, pesoActual])

  // Guardan siempre el ultimo valor, para que la limpieza del efecto de
  // desmontaje de abajo no cierre sobre datos viejos (un array de
  // dependencias vacio en ese efecto significaria que solo ve el `objetivo`
  // y el `guardarObjetivo` del primer render). Se actualizan en un efecto,
  // no durante el render: mutar un ref mientras se renderiza es lo que
  // avisa oxlint que no hay que hacer.
  const objetivoRef = useRef(objetivo)
  const guardarObjetivoRef = useRef(guardarObjetivo)
  useEffect(() => {
    objetivoRef.current = objetivo
    guardarObjetivoRef.current = guardarObjetivo
  }, [objetivo, guardarObjetivo])

  /**
   * Actualiza el borrador al instante (para que escribir se sienta
   * inmediato) y guarda en el servidor con 500ms de retardo: sin esto, cada
   * digito escrito en "peso objetivo" mandaria una peticion suelta. Si el
   * usuario sigue escribiendo, el temporizador anterior se cancela y
   * empieza de nuevo.
   */
  function actualizarObjetivo(patch: Partial<Objetivo>) {
    const nuevo = { ...objetivo, ...patch }
    setObjetivoDraft(nuevo)
    if (temporizadorObjetivo.current) clearTimeout(temporizadorObjetivo.current)
    temporizadorObjetivo.current = setTimeout(() => {
      guardarObjetivo.mutate(nuevo)
    }, 500)
  }

  // Si se desmonta con un guardado pendiente (cambia de pestana antes de que
  // pasen los 500ms), lo manda ya en vez de perderlo.
  useEffect(() => {
    return () => {
      if (temporizadorObjetivo.current) {
        clearTimeout(temporizadorObjetivo.current)
        guardarObjetivoRef.current.mutate(objetivoRef.current)
      }
    }
  }, [])

  if (profileQ.isLoading || !form) return <SkeletonList rows={3} height="h-16" />
  if (profileQ.isError) {
    return <ErrorState message="No se ha podido cargar el perfil." onRetry={() => void profileQ.refetch()} />
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Edad" value={edad !== null ? int(edad) : '-'} unit="años" accent="accent" />
        <StatCard
          label="Peso actual"
          value={pesoActual ? num(pesoActual.actual) : '-'}
          unit="kg"
          delta={pesoActual?.delta7d ?? null}
          invertDelta
          accent="primary"
        />
      </div>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">IMC</p>
        <div className="mt-1 flex items-baseline gap-3">
          <p className="font-display text-5xl leading-none tnum">{imc !== null ? num(imc) : '-'}</p>
          {clasificacion ? (
            <span className={`text-sm font-semibold ${imcColorClass[clasificacion.color]}`}>
              {clasificacion.etiqueta}
            </span>
          ) : (
            <span className="text-sm text-fg-subtle">Falta peso o altura</span>
          )}
        </div>
      </Card>

      <Card>
        <SectionLabel>Datos personales</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Fecha de nacimiento"
            type="date"
            value={form.birthdate ?? ''}
            onChange={(e) => setForm({ ...form, birthdate: e.target.value || null })}
          />
          <SelectField
            label="Sexo"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value as '1' | '2' })}
          >
            <option value="1">Hombre</option>
            <option value="2">Mujer</option>
          </SelectField>
          <Field
            label="Altura"
            type="number"
            inputMode="decimal"
            hint="cm"
            value={form.height ?? ''}
            onChange={(e) => setForm({ ...form, height: e.target.value ? Number(e.target.value) : null })}
          />
          <SelectField
            label="Unidad de peso"
            value={form.weight_unit}
            onChange={(e) => setForm({ ...form, weight_unit: e.target.value as 'kg' | 'lb' })}
          >
            <option value="kg">Métrico (kg)</option>
            <option value="lb">Imperial (lb)</option>
          </SelectField>
          <SelectField
            label="Intensidad trabajo"
            value={form.work_intensity}
            onChange={(e) => setForm({ ...form, work_intensity: e.target.value as '1' | '2' | '3' })}
          >
            <option value="1">Baja</option>
            <option value="2">Media</option>
            <option value="3">Alta</option>
          </SelectField>
          <SelectField
            label="Intensidad deporte"
            value={form.sport_intensity}
            onChange={(e) => setForm({ ...form, sport_intensity: e.target.value as '1' | '2' | '3' })}
          >
            <option value="1">Baja</option>
            <option value="2">Media</option>
            <option value="3">Alta</option>
          </SelectField>
          <SelectField
            label="Intensidad tiempo libre"
            value={form.freetime_intensity}
            onChange={(e) => setForm({ ...form, freetime_intensity: e.target.value as '1' | '2' | '3' })}
          >
            <option value="1">Baja</option>
            <option value="2">Media</option>
            <option value="3">Alta</option>
          </SelectField>
          <Field
            label="Calorías objetivo"
            type="number"
            inputMode="numeric"
            value={form.calories ?? ''}
            onChange={(e) => setForm({ ...form, calories: e.target.value ? Number(e.target.value) : 0 })}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            onClick={() => updateProfile.mutate(form)}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
          {updateProfile.isSuccess ? <span className="text-sm text-success">Guardado</span> : null}
          {updateProfile.isError ? <span className="text-sm text-danger">Error al guardar</span> : null}
        </div>
      </Card>

      <Card>
        <SectionLabel>Objetivo de peso</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Peso objetivo"
            type="number"
            inputMode="decimal"
            hint="kg"
            value={objetivo.peso ?? ''}
            onChange={(e) => actualizarObjetivo({ peso: e.target.value ? Number(e.target.value) : null })}
          />
          <Field
            label="Fecha objetivo"
            type="date"
            value={objetivo.fecha ?? ''}
            onChange={(e) => actualizarObjetivo({ fecha: e.target.value || null })}
          />
          <SelectField
            label="Tipo de objetivo"
            value={objetivo.tipo ?? ''}
            onChange={(e) =>
              actualizarObjetivo({ tipo: (e.target.value || null) as TipoObjetivo | null })
            }
          >
            <option value="">Sin definir</option>
            {TIPOS_OBJETIVO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </SelectField>
        </div>

        {progresoObjetivo !== null && objetivo.peso !== null && pesoActual ? (
          <div className="mt-4">
            <BarraProgreso
              porcentaje={progresoObjetivo}
              etiqueta={`${num(pesoActual.actual)} kg de ${num(objetivo.peso)} kg objetivo (${progresoObjetivo}%)`}
            />
            {ritmo !== null ? (
              <p className="mt-2 text-sm text-fg-muted tnum">
                Ritmo necesario: {ritmo > 0 ? '+' : ''}
                {num(ritmo)} kg/semana
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  )
}

// ----------------------------------------------------------------- Progreso

/** Una fila del historial de peso: fecha y valor, editables in situ, o borrado con confirmación aparte. */
function FilaPeso({
  entrada,
  onGuardar,
  onEliminar,
}: {
  entrada: WeightEntry
  onGuardar: (cambios: { date: string; weight: number }) => void
  onEliminar: () => void
}) {
  const [editando, setEditando] = useState(false)
  // Solo se rellenan al entrar en edicion (ver empezarEdicion): en modo
  // vista se lee siempre `entrada` directamente, asi que no hace falta un
  // efecto que las mantenga sincronizadas con datos que aqui no se pintan.
  const [peso, setPeso] = useState('')
  const [fecha, setFecha] = useState('')

  function empezarEdicion() {
    setPeso(entrada.weight)
    setFecha(entrada.date)
    setEditando(true)
  }

  if (editando) {
    const valorValido = Number(peso) > 0 && fecha !== ''
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-[14px] bg-surface-2 px-3 py-2">
        <input
          type="date"
          className="h-10 min-w-0 rounded-[10px] border border-border bg-surface px-2 text-sm text-fg transition-colors focus:border-primary"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          className="h-10 w-20 min-w-0 rounded-[10px] border border-border bg-surface px-2 text-sm text-fg transition-colors focus:border-primary"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
        />
        <span className="text-xs text-fg-subtle">kg</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded-[10px] p-2 text-primary transition-colors duration-150 hover:bg-surface-3 disabled:opacity-40"
            aria-label="Guardar pesaje"
            disabled={!valorValido}
            onClick={() => {
              onGuardar({ date: fecha, weight: Number(peso) })
              setEditando(false)
            }}
          >
            <Check size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3"
            aria-label="Cancelar edición"
            onClick={() => setEditando(false)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="tnum text-sm text-fg">{num(Number(entrada.weight))} kg</p>
        <p className="text-xs capitalize text-fg-subtle">{shortDate(entrada.date)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-fg"
          aria-label="Editar pesaje"
          onClick={empezarEdicion}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-danger"
          aria-label="Eliminar pesaje"
          onClick={onEliminar}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

function ProgresoTab() {
  const pesoQ = useWeightEntries()
  const addPeso = useAddWeightEntry()
  const actualizarPeso = useUpdateWeightEntry()
  const eliminarPeso = useDeleteWeightEntry()
  const [entradaAEliminar, setEntradaAEliminar] = useState<WeightEntry | null>(null)
  const sesionesQ = useWorkoutSessions()
  const logsQ = useWorkoutLogs()

  const [rango, setRango] = useState<Rango>('3m')
  const [nuevoPeso, setNuevoPeso] = useState('')
  const [nuevaFecha, setNuevaFecha] = useState(today())

  const datosPeso = useMemo(() => {
    if (!pesoQ.data) return []
    const puntos: PuntoPeso[] = pesoQ.data.map((e) => ({ fecha: e.date, peso: Number(e.weight) }))
    return cortarPorRango(mediaMovil7(puntos), rango)
  }, [pesoQ.data, rango])

  const entradasOrdenadas = useMemo(
    () => [...(pesoQ.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [pesoQ.data],
  )

  const sesionesPorSemana = useMemo(
    () => calcularSesionesSemanales(sesionesQ.data ?? []),
    [sesionesQ.data],
  )
  const volumenPorSemana = useMemo(() => calcularVolumenSemanal(logsQ.data ?? []), [logsQ.data])
  const records = useMemo(() => calcularRecords(logsQ.data ?? []), [logsQ.data])
  const idsRecords = useMemo(() => records.map((r) => r.exerciseId), [records])
  const nombresEjercicio = useExerciseNames(idsRecords)

  function onAddPeso(e: FormEvent) {
    e.preventDefault()
    const valor = Number(nuevoPeso)
    if (!valor || !nuevaFecha) return
    addPeso.mutate({ date: nuevaFecha, weight: valor }, { onSuccess: () => setNuevoPeso('') })
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Peso corporal</SectionLabel>
          <div className="flex gap-1.5" role="group" aria-label="Rango de fechas">
            {RANGOS.map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={rango === r ? 'primary' : 'secondary'}
                onClick={() => setRango(r)}
              >
                {r === 'todo' ? 'Todo' : r.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>

        {pesoQ.isLoading ? <SkeletonList rows={1} height="h-64" /> : null}
        {pesoQ.isError ? (
          <ErrorState message="No se ha podido cargar el peso." onRetry={() => void pesoQ.refetch()} />
        ) : null}

        {pesoQ.data && datosPeso.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="Sin pesajes todavía"
            description="Añade tu primer peso para empezar a ver la evolución."
          />
        ) : null}

        {datosPeso.length > 0 ? (
          <div className="mt-3 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datosPeso} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="fecha"
                  tickFormatter={(v: string) => shortDate(v)}
                  stroke="var(--color-fg-subtle)"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  stroke="var(--color-fg-subtle)"
                  tick={{ fontSize: 12 }}
                  width={44}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v) => shortDate(String(v))}
                  formatter={(value, name) => [`${num(Number(value))} kg`, name]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="peso"
                  name="Peso"
                  stroke={COLORES_GRAFICA[1]}
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="media"
                  name="Media 7 días"
                  stroke={COLORES_GRAFICA[0]}
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        <form onSubmit={onAddPeso} className="mt-4 flex flex-wrap items-end gap-3">
          <Field
            label="Peso"
            type="number"
            inputMode="decimal"
            step="0.1"
            hint="kg"
            value={nuevoPeso}
            onChange={(e) => setNuevoPeso(e.target.value)}
            className="w-28"
          />
          <Field
            label="Fecha"
            type="date"
            value={nuevaFecha}
            onChange={(e) => setNuevaFecha(e.target.value)}
            className="w-40"
          />
          <Button type="submit" disabled={addPeso.isPending}>
            <Plus size={18} aria-hidden="true" />
            {addPeso.isPending ? 'Añadiendo...' : 'Añadir peso'}
          </Button>
        </form>
      </Card>

      {entradasOrdenadas.length > 0 ? (
        <Card>
          <SectionLabel>Historial de peso</SectionLabel>
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {entradasOrdenadas.map((entrada) => (
              <FilaPeso
                key={entrada.id}
                entrada={entrada}
                onGuardar={(cambios) => actualizarPeso.mutate({ id: entrada.id, ...cambios })}
                onEliminar={() => setEntradaAEliminar(entrada)}
              />
            ))}
          </ul>
          {actualizarPeso.isError ? (
            <p className="mt-2 text-sm text-danger">No se pudo guardar el cambio. Inténtalo de nuevo.</p>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <SectionLabel>Entrenamientos por semana</SectionLabel>
        {sesionesQ.isLoading ? <SkeletonList rows={1} height="h-48" /> : null}
        {sesionesPorSemana.length > 0 ? (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sesionesPorSemana} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="semana"
                  tickFormatter={(v: string) => etiquetaSemana(v)}
                  stroke="var(--color-fg-subtle)"
                  tick={{ fontSize: 12 }}
                />
                <YAxis allowDecimals={false} stroke="var(--color-fg-subtle)" tick={{ fontSize: 12 }} width={32} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v) => etiquetaSemana(String(v))}
                  formatter={(value) => [int(Number(value)), 'Entrenos']}
                />
                <Legend />
                <Bar dataKey="sesiones" name="Entrenos" fill={COLORES_GRAFICA[0]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : sesionesQ.data ? (
          <p className="py-8 text-center text-sm text-fg-muted">Sin sesiones registradas todavía.</p>
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Volumen semanal</SectionLabel>
        {logsQ.isLoading ? <SkeletonList rows={1} height="h-48" /> : null}
        {volumenPorSemana.length > 0 ? (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumenPorSemana} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="semana"
                  tickFormatter={(v: string) => etiquetaSemana(v)}
                  stroke="var(--color-fg-subtle)"
                  tick={{ fontSize: 12 }}
                />
                <YAxis allowDecimals={false} stroke="var(--color-fg-subtle)" tick={{ fontSize: 12 }} width={48} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v) => etiquetaSemana(String(v))}
                  formatter={(value) => [`${int(Number(value))} kg`, 'Volumen']}
                />
                <Legend />
                <Bar dataKey="volumen" name="Volumen" fill={COLORES_GRAFICA[2]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : logsQ.data ? (
          <p className="py-8 text-center text-sm text-fg-muted">Sin series con peso registradas todavía.</p>
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Records personales</SectionLabel>
        {records.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">Todavía no hay series con peso registradas.</p>
        ) : (
          <ul className="space-y-2">
            {records.map((r) => (
              <li
                key={r.exerciseId}
                className="flex items-center justify-between rounded-[14px] bg-surface-2 px-4 py-3"
              >
                <span className="text-sm font-medium text-fg">
                  {nombresEjercicio.data?.get(r.exerciseId) ?? `Ejercicio ${r.exerciseId}`}
                </span>
                <span className="text-sm tnum text-fg-muted">
                  {kg(r.pesoMax)} · {shortDate(r.fecha)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FotosProgreso />

      <ConfirmModal
        open={entradaAEliminar !== null}
        onClose={() => setEntradaAEliminar(null)}
        onConfirm={() => {
          if (entradaAEliminar) eliminarPeso.mutate(entradaAEliminar.id)
        }}
        title="Eliminar pesaje"
        description={
          entradaAEliminar
            ? `Se borra el pesaje de ${num(Number(entradaAEliminar.weight))} kg del ${shortDate(entradaAEliminar.date)}. No se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
      />
    </div>
  )
}

// ---------------------------------------------------------- Fotos progreso

function FotosProgreso() {
  const fotosQ = useGalleryPhotos()
  const subirFoto = useUploadGalleryPhoto()
  const borrarFoto = useDeleteGalleryPhoto()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fotoABorrar, setFotoABorrar] = useState<number | null>(null)

  const fotosOrdenadas = useMemo(
    () => [...(fotosQ.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [fotosQ.data],
  )

  function onArchivoElegido(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) subirFoto.mutate(file)
    // Reset para poder volver a elegir el mismo fichero si hace falta.
    e.target.value = ''
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Fotos de progreso</SectionLabel>
        {fotosOrdenadas.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={subirFoto.isPending}
          >
            <Plus size={16} aria-hidden="true" />
            {subirFoto.isPending ? 'Subiendo...' : 'Subir foto'}
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onArchivoElegido}
          className="hidden"
          aria-label="Elegir foto de progreso"
        />
      </div>

      {fotosQ.isLoading ? <SkeletonList rows={1} height="h-24" /> : null}
      {fotosQ.isError ? (
        <ErrorState message="No se han podido cargar las fotos." onRetry={() => void fotosQ.refetch()} />
      ) : null}
      {subirFoto.isError ? (
        <p className="mt-3 text-sm text-danger">No se ha podido subir la foto. Inténtalo de nuevo.</p>
      ) : null}

      {fotosQ.data && fotosOrdenadas.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Sin fotos todavía"
          description="Sube tu primera foto de progreso para poder comparar más adelante."
          action={{ label: 'Subir foto', onClick: () => inputRef.current?.click() }}
        />
      ) : null}

      {fotosOrdenadas.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {fotosOrdenadas.map((foto) => (
            <div key={foto.id} className="relative">
              <Thumbnail
                src={urlApi(foto.image)}
                alt={foto.description || `Foto de progreso del ${shortDate(foto.date)}`}
                className="aspect-square"
              />
              <button
                type="button"
                onClick={() => setFotoABorrar(foto.id)}
                aria-label="Eliminar foto"
                className="glass absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-danger/20 hover:text-danger"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <ConfirmModal
        open={fotoABorrar !== null}
        onClose={() => setFotoABorrar(null)}
        onConfirm={() => {
          if (fotoABorrar !== null) borrarFoto.mutate(fotoABorrar)
        }}
        title="Eliminar foto"
        description="Esta foto se borrará permanentemente."
      />
    </Card>
  )
}

// ------------------------------------------------------------------ Medidas

function MedidasTab() {
  const categoriasQ = useMeasurementCategories()
  const crearCategoria = useCreateMeasurementCategory()
  const medicionesQ = useMeasurements()
  const crearMedicion = useCreateMeasurement()

  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [nombreNueva, setNombreNueva] = useState('')
  const [unidadNueva, setUnidadNueva] = useState('cm')
  const [valorNuevo, setValorNuevo] = useState('')
  const [fechaNueva, setFechaNueva] = useState(today())
  const [creandoHabituales, setCreandoHabituales] = useState(false)

  const categoriaActiva = useMemo(
    () => categoriasQ.data?.find((c) => c.id === seleccionada) ?? categoriasQ.data?.[0] ?? null,
    [categoriasQ.data, seleccionada],
  )

  const medicionesCategoria = useMemo(() => {
    if (!medicionesQ.data || !categoriaActiva) return []
    return medicionesQ.data
      .filter((m) => m.category === categoriaActiva.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => ({ fecha: m.date, valor: Number(m.value) }))
  }, [medicionesQ.data, categoriaActiva])

  async function crearHabituales() {
    setCreandoHabituales(true)
    try {
      for (const c of CATEGORIAS_HABITUALES) {
        await crearCategoria.mutateAsync(c)
      }
    } finally {
      setCreandoHabituales(false)
    }
  }

  function onCrearCategoria(e: FormEvent) {
    e.preventDefault()
    if (!nombreNueva.trim()) return
    crearCategoria.mutate(
      { name: nombreNueva.trim(), unit: unidadNueva.trim() || 'cm' },
      { onSuccess: () => setNombreNueva('') },
    )
  }

  function onRegistrarValor(e: FormEvent) {
    e.preventDefault()
    if (!categoriaActiva || !valorNuevo) return
    crearMedicion.mutate(
      { category: categoriaActiva.id, date: fechaNueva, value: Number(valorNuevo) },
      { onSuccess: () => setValorNuevo('') },
    )
  }

  if (categoriasQ.isLoading) return <SkeletonList rows={2} height="h-24" />
  if (categoriasQ.isError) {
    return (
      <ErrorState message="No se han podido cargar las medidas." onRetry={() => void categoriasQ.refetch()} />
    )
  }

  if (categoriasQ.data && categoriasQ.data.length === 0) {
    return (
      <EmptyState
        icon={Ruler}
        title="Sin categorías de medidas"
        description="Crea las categorías habituales (cintura, cadera, pecho, brazo, muslo) para empezar a registrar."
        action={{
          label: creandoHabituales ? 'Creando...' : 'Crear habituales',
          onClick: () => void crearHabituales(),
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <SectionLabel>Categorías</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {(categoriasQ.data ?? []).map((c) => (
            <Button
              key={c.id}
              type="button"
              size="sm"
              variant={categoriaActiva?.id === c.id ? 'primary' : 'secondary'}
              onClick={() => setSeleccionada(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>

        <form onSubmit={onCrearCategoria} className="mt-4 flex flex-wrap items-end gap-3">
          <Field
            label="Nueva categoría"
            placeholder="p.ej. Cuello"
            value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)}
            className="w-40"
          />
          <Field
            label="Unidad"
            placeholder="cm"
            value={unidadNueva}
            onChange={(e) => setUnidadNueva(e.target.value)}
            className="w-24"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={crearCategoria.isPending}>
            <Plus size={16} aria-hidden="true" />
            Crear
          </Button>
        </form>
      </Card>

      {categoriaActiva ? (
        <Card>
          <SectionLabel>{categoriaActiva.name}</SectionLabel>

          {medicionesQ.isLoading ? <SkeletonList rows={1} height="h-56" /> : null}

          {medicionesCategoria.length === 0 && medicionesQ.data ? (
            <p className="py-8 text-center text-sm text-fg-muted">Sin valores registrados todavía.</p>
          ) : null}

          {medicionesCategoria.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={medicionesCategoria} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={(v: string) => shortDate(v)}
                    stroke="var(--color-fg-subtle)"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    stroke="var(--color-fg-subtle)"
                    tick={{ fontSize: 12 }}
                    width={44}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) => shortDate(String(v))}
                    formatter={(value) => [`${num(Number(value))} ${categoriaActiva.unit}`, categoriaActiva.name]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name={categoriaActiva.name}
                    stroke={COLORES_GRAFICA[2]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <form onSubmit={onRegistrarValor} className="mt-4 flex flex-wrap items-end gap-3">
            <Field
              label={`Valor (${categoriaActiva.unit})`}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={valorNuevo}
              onChange={(e) => setValorNuevo(e.target.value)}
              className="w-32"
            />
            <Field
              label="Fecha"
              type="date"
              value={fechaNueva}
              onChange={(e) => setFechaNueva(e.target.value)}
              className="w-40"
            />
            <Button type="submit" size="sm" disabled={crearMedicion.isPending}>
              <Plus size={16} aria-hidden="true" />
              Registrar
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ Ajustes

/**
 * A que servidor habla la app.
 *
 * Solo hace falta en la app instalada (APK de Android, app de iPhone): alli no
 * hay un servidor "detras" de la propia pagina y hay que decirle donde esta. En
 * el navegador la app se sirve desde el mismo sitio que la API y este ajuste se
 * puede dejar en blanco. Ver web/src/lib/config.ts.
 */
function TarjetaServidor() {
  const [valor, setValor] = useState(servidorActual())
  const [guardado, setGuardado] = useState(false)

  const normalizado = normalizarServidor(valor)
  const invalido = valor.trim() !== '' && normalizado === ''

  function guardar() {
    setValor(escribirServidor(valor))
    setGuardado(true)
  }

  return (
    <Card>
      <SectionLabel>Servidor</SectionLabel>
      <p className="text-sm text-fg-muted">
        La dirección de tu servidor de SalazFitness. Déjalo en blanco si abres la app desde el
        navegador: entonces usa el mismo sitio desde el que se ha cargado.
      </p>
      <Field
        label="Dirección"
        placeholder={SERVIDOR_POR_DEFECTO || 'https://salazfitness.tudominio.com'}
        value={valor}
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => {
          setValor(e.target.value)
          setGuardado(false)
        }}
        error={invalido ? 'Tiene que empezar por http:// o https://' : undefined}
        className="mt-4"
      />
      <Button type="button" variant="secondary" className="mt-4" onClick={guardar} disabled={invalido}>
        Guardar servidor
      </Button>
      {guardado ? (
        <p className="mt-3 text-sm text-success">
          Guardado{normalizado ? `: ${normalizado}` : ' (se usará el servidor por defecto)'}.
        </p>
      ) : null}
    </Card>
  )
}

function AjustesTab() {
  const { t, i18n } = useTranslation()
  const { mostrarMediaEjercicios, setMostrarMediaEjercicios, supermercadoDefecto, setSupermercadoDefecto } =
    useAjustes()
  const profileQ = useUserProfile()

  const esConocido = SUPERMERCADOS_HABITUALES.includes(supermercadoDefecto)
  const [seleccionSuper, setSeleccionSuper] = useState(esConocido ? supermercadoDefecto : OTRO_SUPERMERCADO)
  const [textoOtro, setTextoOtro] = useState(esConocido ? '' : supermercadoDefecto)

  function onCambiarSeleccion(valor: string) {
    setSeleccionSuper(valor)
    setSupermercadoDefecto(valor === OTRO_SUPERMERCADO ? textoOtro.trim() : valor)
  }

  function onCambiarTextoOtro(valor: string) {
    setTextoOtro(valor)
    setSupermercadoDefecto(valor.trim())
  }

  function onCambiarIdioma(codigo: string) {
    void i18n.changeLanguage(codigo)
    localStorage.setItem(CLAVE_IDIOMA, codigo)
  }

  async function exportarDatos() {
    const datos = {
      exportadoEl: new Date().toISOString(),
      perfil: profileQ.data ?? null,
      // El objetivo ya no es una lectura sincrona de localStorage: viene del
      // servidor (ver useObjetivo/leerObjetivo en yo/api.ts).
      objetivo: await leerObjetivo(),
    }
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `salazfitness-datos-${today()}.json`
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <Card>
        <SectionLabel>{t('ajustes.idioma.titulo')}</SectionLabel>
        <SelectField
          label={t('ajustes.idioma.etiqueta')}
          hint={t('ajustes.idioma.hint')}
          value={i18n.language}
          onChange={(e) => onCambiarIdioma(e.target.value)}
        >
          {IDIOMAS_DISPONIBLES.map((idioma) => (
            <option key={idioma.codigo} value={idioma.codigo}>
              {idioma.etiqueta}
            </option>
          ))}
        </SelectField>
      </Card>

      <Card>
        <SectionLabel>{t('ajustes.ejercicios.titulo')}</SectionLabel>
        <ToggleField
          label={t('ajustes.ejercicios.mostrarMedia')}
          hint={t('ajustes.ejercicios.mostrarMediaHint')}
          checked={mostrarMediaEjercicios}
          onChange={setMostrarMediaEjercicios}
        />
      </Card>

      <Card>
        <SectionLabel>{t('ajustes.compra.titulo')}</SectionLabel>
        <SelectField
          label={t('ajustes.compra.supermercadoDefecto')}
          value={seleccionSuper}
          onChange={(e) => onCambiarSeleccion(e.target.value)}
        >
          {SUPERMERCADOS_HABITUALES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={OTRO_SUPERMERCADO}>{t('ajustes.compra.otro')}</option>
        </SelectField>
        {seleccionSuper === OTRO_SUPERMERCADO ? (
          <Field
            label={t('ajustes.compra.nombreSupermercado')}
            placeholder={t('ajustes.compra.nombreSupermercadoPlaceholder')}
            value={textoOtro}
            onChange={(e) => onCambiarTextoOtro(e.target.value)}
            className="mt-4"
          />
        ) : null}
      </Card>

      <TarjetaServidor />

      <Card>
        <SectionLabel>{t('ajustes.datos.titulo')}</SectionLabel>
        <p className="text-sm text-fg-muted">{t('ajustes.datos.descripcion')}</p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={exportarDatos}
          disabled={!profileQ.data}
        >
          <Download size={18} aria-hidden="true" />
          {t('ajustes.datos.exportar')}
        </Button>
      </Card>
    </div>
  )
}

// --------------------------------------------------------------------- Yo

export default function YoPage() {
  const { signOut } = useAuth()
  const [tab, setTab] = useState<TabId>('perfil')

  return (
    <>
      <PageTitle
        right={
          <Button variant="secondary" size="sm" onClick={signOut}>
            <LogOut size={16} aria-hidden="true" />
            Salir
          </Button>
        }
      >
        Yo
      </PageTitle>

      <TabBar activa={tab} onChange={setTab} />

      <div id="panel-perfil" role="tabpanel" aria-labelledby="tab-perfil" hidden={tab !== 'perfil'}>
        {tab === 'perfil' ? <PerfilTab /> : null}
      </div>
      <div id="panel-progreso" role="tabpanel" aria-labelledby="tab-progreso" hidden={tab !== 'progreso'}>
        {tab === 'progreso' ? <ProgresoTab /> : null}
      </div>
      <div id="panel-medidas" role="tabpanel" aria-labelledby="tab-medidas" hidden={tab !== 'medidas'}>
        {tab === 'medidas' ? <MedidasTab /> : null}
      </div>
      <div id="panel-ajustes" role="tabpanel" aria-labelledby="tab-ajustes" hidden={tab !== 'ajustes'}>
        {tab === 'ajustes' ? <AjustesTab /> : null}
      </div>
    </>
  )
}
