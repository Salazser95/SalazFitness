import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowLeft, ChartLine } from 'lucide-react'

import { Card, EmptyState, ErrorState, PageTitle, SkeletonList, Thumbnail } from '../../components/ui'
import { useAjustes } from '../../lib/settings'
import { kg, shortDate } from '../../lib/format'
import { useExerciseCategory, useExerciseMedia, useExerciseNames, useWorkoutLogsByExercise } from './api'
import { ExerciseIllustration } from './components/ExerciseIllustration'

// Colores de graficas del sistema de diseno, en este orden fijo. Ver
// "Colores de graficas" en docs/DESIGN-SYSTEM.md: es la unica excepcion
// documentada al "nunca hex sueltos", porque Recharts necesita strings.
const COLOR_PESO = '#C6F135'
const COLOR_VOLUMEN = '#22D3EE'

type PuntoGrafica = { clave: string; fecha: string; pesoMax: number; volumen: number }

export default function EjercicioEvolucionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const exerciseId = id ? Number(id) : null

  const logs = useWorkoutLogsByExercise(exerciseId)
  const nombres = useExerciseNames(useMemo(() => (exerciseId !== null ? [exerciseId] : []), [exerciseId]))
  const nombre = exerciseId !== null ? nombres.get(exerciseId) : undefined

  const { mostrarMediaEjercicios } = useAjustes()
  // El hook necesita un numero: si aun no hay id (ruta cargando) se pide con
  // 0, que el servidor no reconoce como ejercicio valido y devuelve null.
  const media = useExerciseMedia(exerciseId ?? 0)
  const categoria = useExerciseCategory(exerciseId ?? 0)

  const datos = useMemo<PuntoGrafica[]>(() => {
    if (!logs.data) return []
    const porGrupo = new Map<string, { fecha: string; pesoMax: number; volumen: number }>()
    for (const log of logs.data) {
      // Se agrupa por sesion; si un log no tiene sesion (registro suelto), por dia.
      const clave = log.session ?? log.date.slice(0, 10)
      const peso = log.weight ? Number(log.weight) : 0
      const reps = log.repetitions ? Number(log.repetitions) : 0
      const actual = porGrupo.get(clave) ?? { fecha: log.date, pesoMax: 0, volumen: 0 }
      actual.pesoMax = Math.max(actual.pesoMax, peso)
      actual.volumen += peso * reps
      if (log.date < actual.fecha) actual.fecha = log.date
      porGrupo.set(clave, actual)
    }
    return Array.from(porGrupo.entries())
      .map(([clave, v]) => ({ clave, ...v }))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  }, [logs.data])

  return (
    <>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 flex h-11 items-center gap-2 text-sm text-fg-muted transition-colors duration-150 hover:text-fg"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Volver
      </button>

      <PageTitle>{nombre ?? 'Evolucion del ejercicio'}</PageTitle>

      {mostrarMediaEjercicios && exerciseId !== null && !media.isLoading && media.video ? (
        <video
          controls
          muted
          loop
          playsInline
          src={media.video}
          className="mb-5 w-full rounded-[20px]"
        />
      ) : mostrarMediaEjercicios && exerciseId !== null && !media.isLoading && media.image ? (
        <Thumbnail
          src={media.image}
          alt={`Como hacer: ${nombre ?? 'ejercicio'}`}
          className="mb-5 aspect-video"
        />
      ) : mostrarMediaEjercicios && exerciseId !== null && !media.isLoading ? (
        <div className="mb-5">
          <ExerciseIllustration category={categoria.data ?? null} className="aspect-video w-full" />
          <p className="mt-2 text-center text-xs text-fg-subtle">
            Sin foto de demostracion disponible para este ejercicio todavia.
          </p>
        </div>
      ) : null}

      {logs.isLoading ? <SkeletonList rows={1} height="h-72" /> : null}

      {logs.isError ? (
        <ErrorState
          message="No se ha podido cargar la evolucion."
          onRetry={() => void logs.refetch()}
        />
      ) : null}

      {logs.data && datos.length === 0 ? (
        <EmptyState
          icon={ChartLine}
          title="Sin registros todavia"
          description="Cuando registres series de este ejercicio en el modo gimnasio, veras aqui su evolucion."
        />
      ) : null}

      {datos.length > 0 ? (
        <Card className="h-80 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="fecha"
                tickFormatter={(v: string) => shortDate(v)}
                stroke="var(--color-fg-subtle)"
                tick={{ fontSize: 12 }}
              />
              <YAxis yAxisId="peso" stroke={COLOR_PESO} tick={{ fontSize: 12 }} width={44} />
              <YAxis
                yAxisId="volumen"
                orientation="right"
                stroke={COLOR_VOLUMEN}
                tick={{ fontSize: 12 }}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  color: 'var(--color-fg)',
                }}
                labelFormatter={(v) => shortDate(String(v))}
                formatter={(value, name) => [
                  name === 'Peso maximo' ? kg(Number(value)) : `${Math.round(Number(value))} kg`,
                  name,
                ]}
              />
              <Legend />
              <Line
                yAxisId="peso"
                type="monotone"
                dataKey="pesoMax"
                name="Peso maximo"
                stroke={COLOR_PESO}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                yAxisId="volumen"
                type="monotone"
                dataKey="volumen"
                name="Volumen"
                stroke={COLOR_VOLUMEN}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      ) : null}
    </>
  )
}
