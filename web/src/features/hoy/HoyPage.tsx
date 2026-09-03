import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BedDouble, ChevronLeft, ChevronRight, Dumbbell, Flame } from 'lucide-react'

import {
  Card,
  EmptyState,
  ErrorState,
  PageTitle,
  SectionLabel,
  SkeletonList,
  StatCard,
} from '../../components/ui'
import { DayNavigator } from '../../components/DayNavigator'
import { addDays, int, num, shortDate, today } from '../../lib/format'
import { useWorkoutSessions } from '../entreno/api'
import { AntesDeEmpezar } from '../entreno/components/AntesDeEmpezar'
import { useEstadoDelDia } from '../entreno/estadoDelDia'
import { useWeightEntries } from '../yo/api'
import { claveSemana, pesoActualConDelta } from '../yo/utils'
import { pickActivePlan, useCaloriasHoy, useNutritionPlans } from './api'

export default function HoyPage() {
  const navigate = useNavigate()
  const [fecha, setFecha] = useState(today())
  const hoyReal = today()

  const estado = useEstadoDelDia(fecha)

  // Ventana de 5 dias independiente del dia seleccionado arriba: por defecto
  // anclada a hoy, y se avanza/retrocede de 5 en 5 con las flechas. La tira
  // en si se desliza con el dedo de forma nativa (overflow-x-auto), igual
  // que las pestanas de Compra -- sin gesto propio encima.
  const [anclaProximos, setAnclaProximos] = useState(hoyReal)
  const proximosDias = useMemo(
    () => (estado.secuencia ?? []).filter((d) => d.date > anclaProximos).slice(0, 5),
    [estado.secuencia, anclaProximos],
  )

  // ---- Estadisticas: siempre del dia real, aunque se este mirando otra fecha ----
  const pesoQ = useWeightEntries()
  const pesoActual = useMemo(
    () => (pesoQ.data ? pesoActualConDelta(pesoQ.data) : null),
    [pesoQ.data],
  )

  const sesionesQ = useWorkoutSessions()
  const entrenosEstaSemana = useMemo(() => {
    if (!sesionesQ.data) return null
    const semana = claveSemana(hoyReal)
    return sesionesQ.data.filter((s) => claveSemana(s.date) === semana).length
  }, [sesionesQ.data, hoyReal])

  const planesQ = useNutritionPlans()
  const planActivo = useMemo(
    () => (planesQ.data ? pickActivePlan(planesQ.data) : null),
    [planesQ.data],
  )
  const caloriasQ = useCaloriasHoy(planActivo?.id ?? null)

  return (
    <div className="animate-rise space-y-5">
      <PageTitle>Hoy</PageTitle>

      <DayNavigator fecha={fecha} onFechaChange={setFecha} />

      <SectionLabel>{fecha === hoyReal ? 'Entreno de hoy' : 'Entreno de ese día'}</SectionLabel>

      {estado.isLoading ? <SkeletonList rows={1} height="h-44" /> : null}

      {estado.isError ? (
        <ErrorState message="No se ha podido cargar el entreno de esta fecha." />
      ) : null}

      {!estado.isLoading && !estado.isError && estado.rutina === null ? (
        <EmptyState
          icon={Dumbbell}
          title="Sin rutina activa"
          description="Crea o activa una rutina para ver aquí qué toca entrenar cada día."
          action={{ label: 'Ir a Entreno', onClick: () => navigate('/entreno') }}
        />
      ) : null}

      {!estado.isLoading && !estado.isError && estado.rutina !== null ? (
        <AntesDeEmpezar estado={estado} />
      ) : null}

      {/* Estadisticas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Peso corporal"
          value={pesoActual ? num(pesoActual.actual) : '-'}
          unit="kg"
          delta={pesoActual?.delta7d ?? null}
          invertDelta
          accent="accent"
        />
        <StatCard
          label="Entrenos esta semana"
          value={entrenosEstaSemana !== null ? int(entrenosEstaSemana) : '-'}
          accent="primary"
        />
        {planActivo ? (
          <StatCard
            label="Calorías hoy"
            value={caloriasQ.data !== undefined ? int(caloriasQ.data) : '-'}
            unit="kcal"
            accent="violet"
          />
        ) : null}
      </div>

      {/* Proximos dias: ventana propia de 5 dias, deslizable, anclada a hoy por defecto */}
      {estado.secuencia && estado.secuencia.length > 0 ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <SectionLabel>Próximos días</SectionLabel>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAnclaProximos((a) => addDays(a, -5))}
                aria-label="5 días anteriores"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setAnclaProximos((a) => addDays(a, 5))}
                aria-label="5 días siguientes"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] text-fg-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div key={anclaProximos} className="animate-rise flex gap-3 overflow-x-auto pb-1">
            {proximosDias.length === 0 ? (
              <p className="px-1 py-2 text-sm text-fg-subtle">No hay días en este rango.</p>
            ) : null}
            {proximosDias.map((d) => {
              const descanso = !d.day || d.day.is_rest
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setFecha(d.date)}
                  className="shrink-0 text-left"
                >
                  <Card className={`w-32 p-3 text-center ${descanso ? 'opacity-60' : ''}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
                      {shortDate(d.date)}
                    </p>
                    {descanso ? (
                      <>
                        <BedDouble
                          size={18}
                          className="mx-auto mt-2 text-fg-subtle"
                          aria-hidden="true"
                        />
                        <p className="mt-1 text-sm text-fg-muted">Descanso</p>
                      </>
                    ) : (
                      <p className="mt-2 line-clamp-2 text-sm font-semibold text-fg">
                        {d.day!.name}
                      </p>
                    )}
                  </Card>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {planActivo === null && planesQ.data && planesQ.data.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-fg-subtle">
          <Flame size={14} aria-hidden="true" />
          Crea un plan nutricional para ver aquí tus calorías de hoy.
        </p>
      ) : null}
    </div>
  )
}
