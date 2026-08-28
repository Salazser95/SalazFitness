import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CalendarDays, ChevronRight, Dumbbell, Plus, Trash2, Zap } from 'lucide-react'

import { Button, Card, ConfirmModal, EmptyState, ErrorState, PageTitle, SkeletonList } from '../../components/ui'
import { shortDate, today } from '../../lib/format'
import { ActivarRutinaModal } from './components/ActivarRutinaModal'
import {
  escribirRutinaActivaId,
  useActiveRoutine,
  useEliminarRutina,
  useRoutines,
  type Routine,
} from './api'

export default function RutinasListaPage() {
  const navigate = useNavigate()
  const routines = useRoutines()
  const activeRoutine = useActiveRoutine()
  const eliminar = useEliminarRutina()
  const [rutinaABorrar, setRutinaABorrar] = useState<Routine | null>(null)
  const [rutinaParaDesplazar, setRutinaParaDesplazar] = useState<Routine | null>(null)

  const activeId = activeRoutine.data?.id

  /** Guarda la eleccion; si sus fechas no cubren hoy, ofrece desplazarlas (sin forzarlo). */
  function activar(r: Routine) {
    void escribirRutinaActivaId(r.id)
    const hoy = today()
    const cubreHoy = r.start <= hoy && hoy <= r.end
    if (!cubreHoy) setRutinaParaDesplazar(r)
  }

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

      <div className="mb-5 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigate('/entreno/rutina/nueva')}>
          <Plus size={16} aria-hidden="true" />
          Nueva rutina
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate('/entreno/importar-plantilla')}>
          Importar plantilla
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate('/entreno/calendario')}>
          <CalendarClock size={16} aria-hidden="true" />
          Calendario
        </Button>
      </div>

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
          title="Todavía no tienes rutinas"
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
                  className="flex cursor-pointer items-center justify-between gap-1 transition-colors duration-150 hover:bg-surface-2"
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
                  {r.id !== activeId ? (
                    <button
                      type="button"
                      onClick={() => activar(r)}
                      aria-label={`Activar rutina ${r.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                    >
                      <Zap size={18} aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setRutinaABorrar(r)}
                    aria-label={`Eliminar rutina ${r.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </Card>
              </li>
            ))}
        </ul>
      ) : null}

      <ConfirmModal
        open={rutinaABorrar !== null}
        onClose={() => setRutinaABorrar(null)}
        onConfirm={() => {
          if (rutinaABorrar) void eliminar.mutateAsync(rutinaABorrar.id)
        }}
        title={`Eliminar "${rutinaABorrar?.name ?? ''}"`}
        description="Se borrarán también todos sus días y ejercicios configurados. No se puede deshacer."
      />

      <ActivarRutinaModal routine={rutinaParaDesplazar} onClose={() => setRutinaParaDesplazar(null)} />
    </>
  )
}
