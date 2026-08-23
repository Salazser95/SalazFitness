import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BedDouble, Dumbbell, Flame } from 'lucide-react'

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageTitle,
  SectionLabel,
  SkeletonList,
  StatCard,
} from '../../components/ui'
import { int, num, shortDate, today } from '../../lib/format'
import {
  pickActiveRoutine,
  useDateSequenceGym,
  useRoutines,
  useWorkoutSessions,
} from '../entreno/api'
import { useWeightEntries } from '../yo/api'
import { claveSemana, pesoActualConDelta } from '../yo/utils'
import { pickActivePlan, useCaloriasHoy, useNutritionPlans } from './api'

function tituloDeHoy(): string {
  const s = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function HoyPage() {
  const navigate = useNavigate()
  const fecha = today()

  // ---- Entreno de hoy ----
  const routinesQ = useRoutines()
  const activeRoutine = useMemo(
    () => (routinesQ.data ? pickActiveRoutine(routinesQ.data) : null),
    [routinesQ.data],
  )
  const secuenciaQ = useDateSequenceGym(activeRoutine?.id ?? null)

  const diaHoy = useMemo(
    () => secuenciaQ.data?.find((d) => d.date === fecha) ?? null,
    [secuenciaQ.data, fecha],
  )
  const esDescanso = diaHoy ? !diaHoy.day || diaHoy.day.is_rest : false

  const numEjercicios = useMemo(
    () => (diaHoy ? new Set(diaHoy.slots.flatMap((s) => s.exercises)).size : 0),
    [diaHoy],
  )
  const numSeries = useMemo(
    () => diaHoy?.slots.flatMap((s) => s.sets).length ?? 0,
    [diaHoy],
  )

  const proximoEntreno = useMemo(() => {
    if (!secuenciaQ.data) return null
    return secuenciaQ.data.find((d) => d.date > fecha && d.day && !d.day.is_rest) ?? null
  }, [secuenciaQ.data, fecha])

  const proximosDias = useMemo(
    () => (secuenciaQ.data ?? []).filter((d) => d.date > fecha).slice(0, 5),
    [secuenciaQ.data, fecha],
  )

  // ---- Estadisticas ----
  const pesoQ = useWeightEntries()
  const pesoActual = useMemo(
    () => (pesoQ.data ? pesoActualConDelta(pesoQ.data) : null),
    [pesoQ.data],
  )

  const sesionesQ = useWorkoutSessions()
  const entrenosEstaSemana = useMemo(() => {
    if (!sesionesQ.data) return null
    const semana = claveSemana(fecha)
    return sesionesQ.data.filter((s) => claveSemana(s.date) === semana).length
  }, [sesionesQ.data, fecha])

  const planesQ = useNutritionPlans()
  const planActivo = useMemo(
    () => (planesQ.data ? pickActivePlan(planesQ.data) : null),
    [planesQ.data],
  )
  const caloriasQ = useCaloriasHoy(planActivo?.id ?? null)

  return (
    <div className="animate-rise space-y-5">
      <PageTitle>{tituloDeHoy()}</PageTitle>

      {/* Tarjeta principal: que toca hoy */}
      <SectionLabel>Entreno de hoy</SectionLabel>

      {routinesQ.isLoading ? <SkeletonList rows={1} height="h-44" /> : null}

      {routinesQ.isError ? (
        <ErrorState
          message="No se ha podido cargar tu rutina."
          onRetry={() => void routinesQ.refetch()}
        />
      ) : null}

      {routinesQ.data && !activeRoutine ? (
        <EmptyState
          icon={Dumbbell}
          title="Sin rutina activa"
          description="Crea o activa una rutina para ver aqui que toca entrenar cada dia."
          action={{ label: 'Ir a Entreno', onClick: () => navigate('/entreno') }}
        />
      ) : null}

      {activeRoutine && secuenciaQ.isLoading ? <SkeletonList rows={1} height="h-44" /> : null}

      {activeRoutine && secuenciaQ.isError ? (
        <ErrorState
          message="No se ha podido cargar el entreno de hoy."
          onRetry={() => void secuenciaQ.refetch()}
        />
      ) : null}

      {activeRoutine && diaHoy && !esDescanso ? (
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
            {activeRoutine.name}
          </p>
          <p className="mt-1 font-display text-4xl leading-none">{diaHoy.day!.name}</p>
          <p className="mt-2 text-sm text-fg-muted tnum">
            {numEjercicios} {numEjercicios === 1 ? 'ejercicio' : 'ejercicios'} · {numSeries}{' '}
            {numSeries === 1 ? 'serie' : 'series'}
          </p>
          <Button
            full
            size="lg"
            className="mt-5"
            onClick={() => navigate('/entreno/sesion')}
          >
            <Dumbbell size={20} aria-hidden="true" />
            Empezar entreno
          </Button>
        </Card>
      ) : null}

      {activeRoutine && diaHoy && esDescanso ? (
        <Card className="p-5 text-center">
          <BedDouble size={32} className="mx-auto text-fg-subtle" aria-hidden="true" />
          <p className="mt-3 font-display text-2xl">Hoy toca descanso</p>
          <p className="mt-1 text-sm text-fg-muted">
            {proximoEntreno && proximoEntreno.day
              ? `Siguiente entreno: ${proximoEntreno.day.name} el ${shortDate(proximoEntreno.date)}`
              : 'Todavia no hay mas entrenos programados en esta rutina.'}
          </p>
        </Card>
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
            label="Calorias hoy"
            value={caloriasQ.data !== undefined ? int(caloriasQ.data) : '-'}
            unit="kcal"
            accent="violet"
          />
        ) : null}
      </div>

      {/* Proximos dias */}
      {proximosDias.length > 0 ? (
        <div>
          <SectionLabel>Proximos dias</SectionLabel>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {proximosDias.map((d) => {
              const descanso = !d.day || d.day.is_rest
              return (
                <Card
                  key={d.date}
                  className={`w-32 shrink-0 p-3 text-center ${descanso ? 'opacity-60' : ''}`}
                >
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
              )
            })}
          </div>
        </div>
      ) : null}

      {planActivo === null && planesQ.data && planesQ.data.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-fg-subtle">
          <Flame size={14} aria-hidden="true" />
          Crea un plan nutricional para ver aqui tus calorias de hoy.
        </p>
      ) : null}
    </div>
  )
}
