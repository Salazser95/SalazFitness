import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CalendarDays, ChevronRight, Dumbbell, Plus, Trash2, Zap } from 'lucide-react'

import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  HeroStat,
  PageTitle,
  Pill,
  SkeletonList,
} from '../../components/ui'
import { shortDate, today } from '../../lib/format'
import { ActivarRutinaModal } from './components/ActivarRutinaModal'
import {
  escribirRutinaActivaId,
  useActiveRoutine,
  useEliminarRutina,
  useRoutines,
  type Routine,
} from './api'

/** Dias entre dos fechas YYYY-MM-DD, en hora local (mismo patron que addDays). */
function diasEntre(desdeIso: string, hastaIso: string): number {
  const [y1, m1, d1] = desdeIso.split('-').map(Number)
  const [y2, m2, d2] = hastaIso.split('-').map(Number)
  const a = new Date(y1, m1 - 1, d1)
  const b = new Date(y2, m2 - 1, d2)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

type EstadoRutina = 'en-curso' | 'proxima' | 'terminada'

function estadoDeRutina(r: Routine): EstadoRutina {
  const hoy = today()
  if (hoy < r.start) return 'proxima'
  if (hoy > r.end) return 'terminada'
  return 'en-curso'
}

const ESTADO_TEXTO: Record<EstadoRutina, string> = {
  'en-curso': 'En curso',
  proxima: 'Próxima',
  terminada: 'Terminada',
}

const ESTADO_TONO: Record<EstadoRutina, 'primary' | 'neutral'> = {
  'en-curso': 'primary',
  proxima: 'neutral',
  terminada: 'neutral',
}

function RutinaActivaHero({ rutina, navigate }: { rutina: Routine; navigate: (to: string) => void }) {
  const diasRestantes = Math.max(0, diasEntre(today(), rutina.end))
  const totalSemanas = Math.max(1, Math.ceil((diasEntre(rutina.start, rutina.end) + 1) / 7))
  const semanaActual = Math.min(
    totalSemanas,
    Math.max(1, Math.floor(diasEntre(rutina.start, today()) / 7) + 1),
  )

  return (
    <Card className="border-primary/25 p-5">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            Rutina activa
          </p>
          <p className="font-display text-4xl leading-none">{rutina.name}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill icon={CalendarDays}>
              {shortDate(rutina.start)} - {shortDate(rutina.end)}
            </Pill>
            <Pill icon={CalendarClock}>
              Semana {semanaActual} de {totalSemanas}
            </Pill>
            {rutina.fit_in_week ? <Pill>Semana fija</Pill> : null}
          </div>
        </div>
        <HeroStat
          label="Días restantes"
          value={diasRestantes}
          className="mt-4 text-right lg:mt-0 lg:shrink-0"
        />
      </div>
      <Button full className="mt-4" onClick={() => navigate(`/entreno/rutina/${rutina.id}`)}>
        Ver rutina
      </Button>
    </Card>
  )
}

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

  const otrasRutinas = (routines.data ?? []).filter((r) => r.id !== activeId)

  return (
    <div className="animate-rise">
      <PageTitle
        right={
          <Button size="sm" onClick={() => navigate('/entreno/rutina/nueva')}>
            <Plus size={16} aria-hidden="true" />
            Nueva
          </Button>
        }
      >
        Entreno
      </PageTitle>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate('/entreno/calendario')}
          className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-sm text-fg-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg"
        >
          <CalendarClock size={16} aria-hidden="true" />
          Calendario
        </button>
        <button
          type="button"
          onClick={() => navigate('/entreno/historial')}
          className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-sm text-fg-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg"
        >
          <CalendarDays size={16} aria-hidden="true" />
          Historial
        </button>
        <button
          type="button"
          onClick={() => navigate('/entreno/importar-plantilla')}
          className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-sm text-fg-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg"
        >
          Importar plantilla
        </button>
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

      {activeRoutine.data ? (
        <div className="mb-5">
          <RutinaActivaHero rutina={activeRoutine.data} navigate={navigate} />
        </div>
      ) : null}

      {otrasRutinas.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
            {activeRoutine.data ? 'Todas las rutinas' : 'Rutinas'}
          </p>
          <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {[...otrasRutinas]
              .sort((a, b) => (a.start < b.start ? 1 : -1))
              .map((r, i) => {
                const estado = estadoDeRutina(r)
                return (
                  <li
                    key={r.id}
                    className="animate-rise"
                    style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}
                  >
                    <Card as="article" className="group flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/entreno/rutina/${r.id}`)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[14px] p-1 text-left transition-colors duration-150 hover:bg-surface-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-display text-xl">{r.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Pill tone={ESTADO_TONO[estado]}>{ESTADO_TEXTO[estado]}</Pill>
                            <Pill icon={CalendarDays}>
                              {shortDate(r.start)} - {shortDate(r.end)}
                            </Pill>
                          </div>
                        </div>
                        <ChevronRight size={20} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => activar(r)}
                        aria-label={`Activar rutina ${r.name}`}
                        className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-fg-subtle transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                      >
                        <Zap size={16} aria-hidden="true" />
                        Activar
                      </button>
                      <button
                        type="button"
                        onClick={() => setRutinaABorrar(r)}
                        aria-label={`Eliminar rutina ${r.name}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </Card>
                  </li>
                )
              })}
          </ul>
        </div>
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
    </div>
  )
}
