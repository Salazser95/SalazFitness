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
import { Camera, Download, LogOut, Plus, Ruler, Scale, Trash2 } from 'lucide-react'

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
  useAddWeightEntry,
  useCreateMeasurement,
  useCreateMeasurementCategory,
  useDeleteGalleryPhoto,
  useExerciseNames,
  useGalleryPhotos,
  useMeasurementCategories,
  useMeasurements,
  useUpdateUserProfile,
  useUploadGalleryPhoto,
  useUserProfile,
  useWeightEntries,
  useWorkoutLogs,
  useWorkoutSessions,
  type UserProfilePatch,
} from './api'
import { BarraProgreso, SelectField, TabBar, ToggleField, type TabId } from './components'
import {
  guardarObjetivo,
  leerObjetivo,
  TIPOS_OBJETIVO,
  type Objetivo,
  type TipoObjetivo,
} from './objetivo'
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

function PerfilTab() {
  const profileQ = useUserProfile()
  const updateProfile = useUpdateUserProfile()
  const pesoQ = useWeightEntries()

  const [form, setForm] = useState<UserProfilePatch | null>(null)
  const [objetivo, setObjetivo] = useState<Objetivo>(() => leerObjetivo())

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

  function actualizarObjetivo(patch: Partial<Objetivo>) {
    const nuevo = { ...objetivo, ...patch }
    setObjetivo(nuevo)
    guardarObjetivo(nuevo)
  }

  if (profileQ.isLoading || !form) return <SkeletonList rows={3} height="h-16" />
  if (profileQ.isError) {
    return <ErrorState message="No se ha podido cargar el perfil." onRetry={() => void profileQ.refetch()} />
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Edad" value={edad !== null ? int(edad) : '-'} unit="anos" accent="accent" />
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
            <option value="kg">Metrico (kg)</option>
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
            label="Calorias objetivo"
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

function ProgresoTab() {
  const pesoQ = useWeightEntries()
  const addPeso = useAddWeightEntry()
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
            title="Sin pesajes todavia"
            description="Anade tu primer peso para empezar a ver la evolucion."
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
                  name="Media 7 dias"
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
            {addPeso.isPending ? 'Anadiendo...' : 'Anadir peso'}
          </Button>
        </form>
      </Card>

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
          <p className="py-8 text-center text-sm text-fg-muted">Sin sesiones registradas todavia.</p>
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
          <p className="py-8 text-center text-sm text-fg-muted">Sin series con peso registradas todavia.</p>
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Records personales</SectionLabel>
        {records.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">Todavia no hay series con peso registradas.</p>
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
        <p className="mt-3 text-sm text-danger">No se ha podido subir la foto. Intentalo de nuevo.</p>
      ) : null}

      {fotosQ.data && fotosOrdenadas.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Sin fotos todavia"
          description="Sube tu primera foto de progreso para poder comparar mas adelante."
          action={{ label: 'Subir foto', onClick: () => inputRef.current?.click() }}
        />
      ) : null}

      {fotosOrdenadas.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {fotosOrdenadas.map((foto) => (
            <div key={foto.id} className="relative">
              <Thumbnail
                src={foto.image}
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
        description="Esta foto se borrara permanentemente."
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
        title="Sin categorias de medidas"
        description="Crea las categorias habituales (cintura, cadera, pecho, brazo, muslo) para empezar a registrar."
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
        <SectionLabel>Categorias</SectionLabel>
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
            label="Nueva categoria"
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
            <p className="py-8 text-center text-sm text-fg-muted">Sin valores registrados todavia.</p>
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

function AjustesTab() {
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

  function exportarDatos() {
    const datos = {
      exportadoEl: new Date().toISOString(),
      perfil: profileQ.data ?? null,
      objetivo: leerObjetivo(),
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
        <SectionLabel>Ejercicios</SectionLabel>
        <ToggleField
          label="Mostrar videos e imagenes de ejercicios"
          hint="Desactivalo si prefieres una pantalla de entreno mas simple."
          checked={mostrarMediaEjercicios}
          onChange={setMostrarMediaEjercicios}
        />
      </Card>

      <Card>
        <SectionLabel>Compra</SectionLabel>
        <SelectField
          label="Supermercado por defecto"
          value={seleccionSuper}
          onChange={(e) => onCambiarSeleccion(e.target.value)}
        >
          {SUPERMERCADOS_HABITUALES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={OTRO_SUPERMERCADO}>{OTRO_SUPERMERCADO}</option>
        </SelectField>
        {seleccionSuper === OTRO_SUPERMERCADO ? (
          <Field
            label="Nombre del supermercado"
            placeholder="p.ej. Eroski"
            value={textoOtro}
            onChange={(e) => onCambiarTextoOtro(e.target.value)}
            className="mt-4"
          />
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Datos</SectionLabel>
        <p className="text-sm text-fg-muted">
          Descarga una copia de tu perfil y tu objetivo de peso en un fichero JSON.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={exportarDatos}
          disabled={!profileQ.data}
        >
          <Download size={18} aria-hidden="true" />
          Exportar datos
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
