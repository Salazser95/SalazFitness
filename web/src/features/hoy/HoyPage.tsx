import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, BedDouble, Dumbbell, Flame, Undo2 } from 'lucide-react'

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  PageTitle,
  SectionLabel,
  SkeletonList,
  StatCard,
} from '../../components/ui'
import { int, num, shortDate, today } from '../../lib/format'
import { useActiveRoutine, useDateSequenceGym, useWorkoutSessions, type DiaSecuencia } from '../entreno/api'
import { aplicarMovidos, deshacerMovido, moverEntreno, useMovidos } from '../entreno/local'
import { useWeightEntries } from '../yo/api'
import { claveSemana, pesoActualConDelta } from '../yo/utils'
import { pickActivePlan, useCaloriasHoy, useNutritionPlans } from './api'

/**
 * Lista de dias cercanos a los que se puede mover el entreno de hoy. Solo
 * fechas ya presentes en la secuencia cargada (dentro del rango de la
 * rutina), para no ofrecer un destino invalido.
 */
function ModalMoverDia({
  open,
  onClose,
  opciones,
  onElegir,
}: {
  open: boolean
  onClose: () => void
  opciones: DiaSecuencia[]
  onElegir: (fecha: string) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Mover el entreno de hoy">
      <p className="mb-3 text-sm text-fg-muted">
        Elige el dia al que quieres pasar el entreno de hoy. Solo cambia esta semana: la rutina no
        se modifica.
      </p>
      {opciones.length === 0 ? (
        <p className="text-sm text-fg-subtle">No hay mas dias en el rango de esta rutina.</p>
      ) : (
        <ul className="space-y-2">
          {opciones.map((d) => {
            const descanso = !d.day || d.day.is_rest
            return (
              <li key={d.date}>
                <button
                  type="button"
                  onClick={() => onElegir(d.date)}
                  className="flex h-14 w-full items-center justify-between rounded-[14px] border border-border bg-surface-2 px-4 text-left transition-colors duration-150 hover:bg-surface-3"
                >
                  <span className="capitalize text-fg">{shortDate(d.date)}</span>
                  <span className={`text-sm ${descanso ? 'text-fg-subtle' : 'text-fg-muted'}`}>
                    {descanso ? 'Descanso' : d.day!.name}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

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
  const activeRoutineQ = useActiveRoutine()
  const activeRoutine = activeRoutineQ.data
  const secuenciaQ = useDateSequenceGym(activeRoutine?.id ?? null)

  // Desplazamientos puntuales guardados en localStorage (ver features/entreno/local.ts):
  // se aplican encima de la secuencia real que devuelve el backend, sin tocar la rutina.
  const movidos = useMovidos(activeRoutine?.id ?? null)
  const secuencia = useMemo(
    () => (secuenciaQ.data ? aplicarMovidos(secuenciaQ.data, movidos) : secuenciaQ.data),
    [secuenciaQ.data, movidos],
  )

  const diaHoy = useMemo(
    () => secuencia?.find((d) => d.date === fecha) ?? null,
    [secuencia, fecha],
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
    if (!secuencia) return null
    return secuencia.find((d) => d.date > fecha && d.day && !d.day.is_rest) ?? null
  }, [secuencia, fecha])

  const proximosDias = useMemo(
    () => (secuencia ?? []).filter((d) => d.date > fecha).slice(0, 5),
    [secuencia, fecha],
  )

  // El entreno de hoy se movio A otra fecha (hoy queda con lo que tuviera esa fecha).
  const movidoAFecha = movidos[fecha]
  // El entreno de hoy VINO de otra fecha (alguien lo movio hacia hoy).
  const movidoDesdeFecha = useMemo(
    () => Object.entries(movidos).find(([, hasta]) => hasta === fecha)?.[0] ?? null,
    [movidos, fecha],
  )
  const [modalMoverAbierto, setModalMoverAbierto] = useState(false)

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

      {activeRoutineQ.isLoading ? <SkeletonList rows={1} height="h-44" /> : null}

      {activeRoutineQ.isError ? (
        <ErrorState
          message="No se ha podido cargar tu rutina."
          onRetry={() => void activeRoutineQ.refetch()}
        />
      ) : null}

      {activeRoutine === null ? (
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

      {activeRoutine && diaHoy && (movidoAFecha || movidoDesdeFecha) ? (
        <p className="flex items-center gap-2 text-xs text-fg-subtle">
          <ArrowRightLeft size={14} aria-hidden="true" />
          {movidoAFecha
            ? `Moviste el entreno de hoy al ${shortDate(movidoAFecha)}.`
            : `Este entreno estaba programado el ${shortDate(movidoDesdeFecha!)}.`}
          <button
            type="button"
            onClick={() =>
              deshacerMovido(activeRoutine.id, movidoAFecha ? fecha : movidoDesdeFecha!)
            }
            className="inline-flex items-center gap-1 font-semibold text-fg-muted underline-offset-2 hover:underline"
          >
            <Undo2 size={12} aria-hidden="true" />
            Deshacer
          </button>
        </p>
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
          {!movidoAFecha ? (
            <Button
              full
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setModalMoverAbierto(true)}
            >
              <ArrowRightLeft size={16} aria-hidden="true" />
              Mover a otro dia
            </Button>
          ) : null}
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

      <ModalMoverDia
        open={modalMoverAbierto}
        onClose={() => setModalMoverAbierto(false)}
        opciones={proximosDias}
        onElegir={(destino) => {
          if (activeRoutine) moverEntreno(activeRoutine.id, fecha, destino)
          setModalMoverAbierto(false)
        }}
      />

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
