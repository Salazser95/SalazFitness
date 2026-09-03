import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react'

import { Card, ConfirmModal, EmptyState, ErrorState, PageTitle, SkeletonList, UndoBar } from '../../components/ui'
import { kg, num, sessionDuration, shortDate } from '../../lib/format'
import { useUndoStack, type AccionDeshacer } from '../../lib/undo'
import {
  useActualizarSerie,
  useCrearSesion,
  useEliminarSerie,
  useEliminarSesion,
  useExerciseNames,
  useRegistrarSerie,
  useRoutines,
  useWorkoutLogsBySession,
  useWorkoutSessions,
  type WorkoutLog,
  type WorkoutSession,
} from './api'

const IMPRESION_TEXTO: Record<string, string> = {
  '1': 'Mal',
  '2': 'Normal',
  '3': 'Bien',
}

const IMPRESION_COLOR: Record<string, string> = {
  '1': 'text-danger',
  '2': 'text-fg-muted',
  '3': 'text-success',
}

/** Recrea un workoutlog borrado, tal cual estaba, en la sesion que se indique. */
function recrearLog(
  registrarSerie: ReturnType<typeof useRegistrarSerie>,
  sessionId: string,
  log: WorkoutLog,
): Promise<WorkoutLog> {
  return registrarSerie.mutateAsync({
    session: sessionId,
    routine: log.routine,
    exercise: log.exercise,
    slot_entry: log.slot_entry ?? 0,
    weight: log.weight ?? undefined,
    repetitions: log.repetitions ?? undefined,
    rir: log.rir ?? undefined,
    rest: log.rest ?? undefined,
    date: log.date,
  })
}

/** Fila de una serie ya registrada: tocar el texto la pone en modo edicion. */
function FilaLog({
  log,
  nombre,
  onGuardar,
  onEliminar,
  guardando,
}: {
  log: WorkoutLog
  nombre: string
  onGuardar: (peso: string, repeticiones: string) => void
  onEliminar: () => void
  guardando: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [peso, setPeso] = useState(log.weight ?? '')
  const [repeticiones, setRepeticiones] = useState(log.repetitions ?? '')

  function empezar() {
    setPeso(log.weight ?? '')
    setRepeticiones(log.repetitions ?? '')
    setEditando(true)
  }

  if (editando) {
    return (
      <li className="flex items-center gap-2 rounded-[14px] bg-surface-2 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{nombre}</span>
        <input
          type="text"
          inputMode="decimal"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          aria-label={`Peso de ${nombre}`}
          className="tnum h-9 w-16 rounded-[10px] border border-border bg-surface px-2 text-center text-sm text-fg focus:border-primary"
        />
        <span className="text-xs text-fg-subtle">×</span>
        <input
          type="text"
          inputMode="decimal"
          value={repeticiones}
          onChange={(e) => setRepeticiones(e.target.value)}
          aria-label={`Repeticiones de ${nombre}`}
          className="tnum h-9 w-14 rounded-[10px] border border-border bg-surface px-2 text-center text-sm text-fg focus:border-primary"
        />
        <button
          type="button"
          onClick={() => {
            onGuardar(peso, repeticiones)
            setEditando(false)
          }}
          disabled={guardando}
          aria-label="Guardar cambios"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-primary transition-colors duration-150 hover:bg-surface-3 disabled:opacity-40"
        >
          <Check size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          aria-label="Cancelar edición"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-fg-subtle transition-colors duration-150 hover:bg-surface-3"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <button
        type="button"
        onClick={empezar}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[10px] py-1 text-left transition-colors duration-150 hover:bg-surface-2"
        aria-label={`Editar ${nombre}`}
      >
        <span className="truncate text-fg-muted">{nombre}</span>
        <span className="shrink-0 tnum text-fg">
          {kg(log.weight)} × {num(log.repetitions)}
        </span>
      </button>
      <button
        type="button"
        onClick={onEliminar}
        aria-label={`Eliminar serie de ${nombre}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-fg-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </li>
  )
}

function SesionLogs({
  sessionId,
  registrarDeshacer,
}: {
  sessionId: string
  registrarDeshacer: (accion: AccionDeshacer) => void
}) {
  const logs = useWorkoutLogsBySession(sessionId)
  const nombres = useExerciseNames(useMemo(() => logs.data?.map((l) => l.exercise) ?? [], [logs.data]))
  const actualizar = useActualizarSerie()
  const eliminar = useEliminarSerie()
  const registrarSerie = useRegistrarSerie()

  if (logs.isLoading) return <SkeletonList rows={2} height="h-8" />
  if (logs.isError) return <ErrorState message="No se han podido cargar las series." />
  if (!logs.data || logs.data.length === 0) {
    return <p className="text-sm text-fg-subtle">No se registró ninguna serie en esta sesión.</p>
  }

  // Sin confirmar: borra directamente y deja un "Deshacer" para arrepentirse.
  function borrarSerie(log: WorkoutLog, nombre: string) {
    eliminar.mutate(log.id)
    registrarDeshacer({
      etiqueta: `Serie de ${nombre} eliminada`,
      restaurar: () => recrearLog(registrarSerie, sessionId, log).then(() => undefined),
    })
  }

  return (
    <ul className="space-y-1.5 border-t border-border pt-3">
      {logs.data.map((log) => (
        <FilaLog
          key={log.id}
          log={log}
          nombre={nombres.get(log.exercise) ?? `Ejercicio ${log.exercise}`}
          guardando={actualizar.isPending && actualizar.variables?.id === log.id}
          onGuardar={(peso, repeticiones) =>
            actualizar.mutate({
              id: log.id,
              body: { weight: peso || undefined, repetitions: repeticiones || undefined },
            })
          }
          onEliminar={() => borrarSerie(log, nombres.get(log.exercise) ?? `Ejercicio ${log.exercise}`)}
        />
      ))}
    </ul>
  )
}

export default function HistorialPage() {
  const navigate = useNavigate()
  const sessions = useWorkoutSessions()
  const routines = useRoutines()
  const [expandido, setExpandido] = useState<string | null>(null)
  const [diaABorrar, setDiaABorrar] = useState<WorkoutSession | null>(null)

  const eliminarSesion = useEliminarSesion()
  const crearSesion = useCrearSesion()
  const registrarSerie = useRegistrarSerie()
  const deshacer = useUndoStack()

  const nombreRutina = useMemo(() => {
    const map = new Map<number, string>()
    routines.data?.forEach((r) => map.set(r.id, r.name))
    return map
  }, [routines.data])

  async function borrarDiaConfirmado() {
    const sesion = diaABorrar
    setDiaABorrar(null)
    if (!sesion) return
    const logsBorrados = await eliminarSesion.mutateAsync(sesion.id)
    deshacer.registrar({
      etiqueta: `Día ${shortDate(sesion.date)} eliminado`,
      restaurar: async () => {
        if (sesion.routine == null || sesion.day == null) {
          throw new Error('Esta sesión no se puede recrear: le faltan la rutina o el día.')
        }
        const nueva = await crearSesion.mutateAsync({
          routine: sesion.routine,
          day: sesion.day,
          date: sesion.date,
          time_start: sesion.time_start ?? undefined,
          time_end: sesion.time_end ?? undefined,
        })
        for (const log of logsBorrados) {
          await recrearLog(registrarSerie, nueva.id, log)
        }
      },
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/entreno')}
        className="mb-3 flex h-11 items-center gap-2 text-sm text-fg-muted transition-colors duration-150 hover:text-fg"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Rutinas
      </button>

      <PageTitle>Historial</PageTitle>

      {sessions.isLoading ? <SkeletonList rows={4} height="h-20" /> : null}

      {sessions.isError ? (
        <ErrorState
          message="No se ha podido cargar el historial."
          onRetry={() => void sessions.refetch()}
        />
      ) : null}

      {sessions.data && sessions.data.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Todavía no hay entrenos registrados"
          description="Cuando termines una sesión en el modo gimnasio, aparecerá aquí."
        />
      ) : null}

      {sessions.data && sessions.data.length > 0 ? (
        <ul className="space-y-3">
          {sessions.data.map((s) => {
            const abierto = expandido === s.id
            const duracion = sessionDuration(s.time_start, s.time_end)
            return (
              <li key={s.id}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandido(abierto ? null : s.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      aria-expanded={abierto}
                    >
                      <span className="min-w-0">
                        {duracion ? (
                          <span className="block font-display text-3xl leading-tight tnum text-primary">
                            {duracion}
                          </span>
                        ) : null}
                        <span className="block font-display text-xl capitalize leading-tight">
                          {shortDate(s.date)}
                        </span>
                        <span className="block text-sm text-fg-muted">
                          {s.routine ? (nombreRutina.get(s.routine) ?? 'Rutina') : 'Sin rutina'}
                          {s.impression ? (
                            <>
                              {' · '}
                              <span className={IMPRESION_COLOR[s.impression]}>
                                {IMPRESION_TEXTO[s.impression]}
                              </span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      {abierto ? (
                        <ChevronUp size={20} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                      ) : (
                        <ChevronDown size={20} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiaABorrar(s)}
                      aria-label={`Eliminar el día ${shortDate(s.date)} entero`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-fg-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>

                  {abierto ? (
                    <div className="mt-3">
                      <SesionLogs sessionId={s.id} registrarDeshacer={deshacer.registrar} />
                    </div>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      ) : null}

      <ConfirmModal
        open={diaABorrar !== null}
        onClose={() => setDiaABorrar(null)}
        onConfirm={() => void borrarDiaConfirmado()}
        title="Eliminar día de entrenamiento"
        description="Se borra el día entero: la sesión y todas sus series registradas. Se puede deshacer justo después."
        confirmLabel="Eliminar día"
      />

      <UndoBar
        visible={deshacer.pendientes > 0}
        etiqueta={deshacer.error ?? deshacer.etiquetaUltima}
        onDeshacer={() => void deshacer.deshacer()}
        deshaciendo={deshacer.deshaciendo}
      />
    </>
  )
}
