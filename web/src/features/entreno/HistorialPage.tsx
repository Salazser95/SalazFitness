import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'

import { Card, EmptyState, ErrorState, PageTitle, SkeletonList } from '../../components/ui'
import { kg, num, shortDate } from '../../lib/format'
import { useExerciseNames, useRoutines, useWorkoutLogsBySession, useWorkoutSessions } from './api'

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

function SesionLogs({ sessionId }: { sessionId: string }) {
  const logs = useWorkoutLogsBySession(sessionId)
  const nombres = useExerciseNames(useMemo(() => logs.data?.map((l) => l.exercise) ?? [], [logs.data]))

  if (logs.isLoading) return <SkeletonList rows={2} height="h-8" />
  if (logs.isError) return <ErrorState message="No se han podido cargar las series." />
  if (!logs.data || logs.data.length === 0) {
    return <p className="text-sm text-fg-subtle">No se registro ninguna serie en esta sesion.</p>
  }

  return (
    <ul className="space-y-1.5 border-t border-border pt-3">
      {logs.data.map((log) => (
        <li key={log.id} className="flex items-center justify-between text-sm">
          <span className="truncate text-fg-muted">
            {nombres.get(log.exercise) ?? `Ejercicio ${log.exercise}`}
          </span>
          <span className="shrink-0 tnum text-fg">
            {kg(log.weight)} × {num(log.repetitions)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function HistorialPage() {
  const navigate = useNavigate()
  const sessions = useWorkoutSessions()
  const routines = useRoutines()
  const [expandido, setExpandido] = useState<string | null>(null)

  const nombreRutina = useMemo(() => {
    const map = new Map<number, string>()
    routines.data?.forEach((r) => map.set(r.id, r.name))
    return map
  }, [routines.data])

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
          title="Todavia no hay entrenos registrados"
          description="Cuando termines una sesion en el modo gimnasio, aparecera aqui."
        />
      ) : null}

      {sessions.data && sessions.data.length > 0 ? (
        <ul className="space-y-3">
          {sessions.data.map((s) => {
            const abierto = expandido === s.id
            return (
              <li key={s.id}>
                <Card>
                  <button
                    type="button"
                    onClick={() => setExpandido(abierto ? null : s.id)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                    aria-expanded={abierto}
                  >
                    <span className="min-w-0">
                      <span className="block font-display text-xl capitalize">
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

                  {abierto ? (
                    <div className="mt-3">
                      <SesionLogs sessionId={s.id} />
                    </div>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      ) : null}
    </>
  )
}
