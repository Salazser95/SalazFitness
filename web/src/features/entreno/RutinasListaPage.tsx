import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronRight, Dumbbell } from 'lucide-react'

import { Card, EmptyState, ErrorState, PageTitle, SkeletonList } from '../../components/ui'
import { shortDate } from '../../lib/format'
import { pickActiveRoutine, useRoutines } from './api'

export default function RutinasListaPage() {
  const navigate = useNavigate()
  const routines = useRoutines()

  const activeId = useMemo(
    () => (routines.data ? pickActiveRoutine(routines.data)?.id : undefined),
    [routines.data],
  )

  return (
    <>
      <PageTitle
        right={
          <button
            type="button"
            onClick={() => navigate('/entreno/historial')}
            className="flex h-11 items-center gap-2 rounded-[14px] border border-border bg-surface-2 px-4 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-3"
          >
            <CalendarDays size={18} aria-hidden="true" />
            Historial
          </button>
        }
      >
        Entreno
      </PageTitle>

      {routines.isLoading ? <SkeletonList rows={3} height="h-24" /> : null}

      {routines.isError ? (
        <ErrorState
          message="No se han podido cargar las rutinas."
          onRetry={() => void routines.refetch()}
        />
      ) : null}

      {routines.data && routines.data.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Todavia no tienes rutinas"
          description="Crea una rutina en wger para empezar a entrenar."
        />
      ) : null}

      {routines.data && routines.data.length > 0 ? (
        <ul className="space-y-3">
          {[...routines.data]
            .sort((a, b) => (a.start < b.start ? 1 : -1))
            .map((r) => (
              <li key={r.id}>
                <Card
                  as="article"
                  className="flex cursor-pointer items-center justify-between gap-3 transition-colors duration-150 hover:bg-surface-2"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/entreno/rutina/${r.id}`)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-display text-xl">{r.name}</p>
                        {r.id === activeId ? (
                          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-primary">
                            Activa
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-fg-muted">
                        {shortDate(r.start)} - {shortDate(r.end)}
                      </p>
                    </div>
                    <ChevronRight size={20} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                  </button>
                </Card>
              </li>
            ))}
        </ul>
      ) : null}
    </>
  )
}
