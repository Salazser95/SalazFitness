import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BedDouble, ChevronLeft, ChevronRight, Flag, Info } from 'lucide-react'

import { Button, Card, EmptyState, ErrorState, Modal, SkeletonList, Thumbnail } from '../../components/ui'
import { useAjustes } from '../../lib/settings'
import { today } from '../../lib/format'
import {
  pickActiveRoutine,
  useCrearSesion,
  useDateSequenceGym,
  useExerciseMedia,
  useExerciseNames,
  useRegistrarSerie,
  useRoutines,
  type SetConfigData,
} from './api'
import { RestTimer } from './components/RestTimer'
import { SerieRow } from './components/SerieRow'
import {
  borrarProgreso,
  guardarProgreso,
  leerProgreso,
  type SesionProgreso,
} from './lib/sesionStorage'

const DESCANSO_POR_DEFECTO = 90

/** Agrupa las series ya expandidas por ejercicio, respetando el primer orden de aparicion. */
function agruparPorEjercicio(sets: SetConfigData[]): { exercise: number; sets: SetConfigData[] }[] {
  const orden: number[] = []
  const mapa = new Map<number, SetConfigData[]>()
  for (const s of sets) {
    if (!mapa.has(s.exercise)) {
      mapa.set(s.exercise, [])
      orden.push(s.exercise)
    }
    mapa.get(s.exercise)!.push(s)
  }
  return orden.map((exercise) => ({ exercise, sets: mapa.get(exercise)! }))
}

export default function SesionPage() {
  const navigate = useNavigate()
  const fecha = today()

  const routines = useRoutines()
  const activeRoutine = useMemo(
    () => (routines.data ? pickActiveRoutine(routines.data) : null),
    [routines.data],
  )
  const secuencia = useDateSequenceGym(activeRoutine?.id ?? null)

  const diaHoy = useMemo(
    () => secuencia.data?.find((d) => d.date === fecha) ?? null,
    [secuencia.data, fecha],
  )

  const esDescanso = diaHoy ? !diaHoy.day || diaHoy.day.is_rest : false

  const ejerciciosBase = useMemo(() => {
    if (!diaHoy || !diaHoy.day || diaHoy.day.is_rest) return []
    return agruparPorEjercicio(diaHoy.slots.flatMap((s) => s.sets))
  }, [diaHoy])

  const nombres = useExerciseNames(useMemo(() => ejerciciosBase.map((e) => e.exercise), [ejerciciosBase]))

  const [progreso, setProgreso] = useState<SesionProgreso | null>(null)
  const [descansoActivo, setDescansoActivo] = useState<{ id: string; segundos: number } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [comoHacerloAbierto, setComoHacerloAbierto] = useState(false)

  const { mostrarMediaEjercicios } = useAjustes()
  // Hooks siempre en el mismo orden: se calcula antes de los "return"
  // condicionales de mas abajo, con 0 como id "vacio" si aun no hay progreso.
  const exerciseIdActual = progreso ? (progreso.ejercicios[progreso.ejercicioActual]?.exercise ?? 0) : 0
  const media = useExerciseMedia(exerciseIdActual)

  // Carga el progreso guardado o arranca uno nuevo, una sola vez por dia+rutina.
  useEffect(() => {
    if (progreso || !activeRoutine || !diaHoy?.day || ejerciciosBase.length === 0) return
    const guardado = leerProgreso(activeRoutine.id, fecha)
    if (guardado && guardado.dayId === diaHoy.day.id) {
      setProgreso(guardado)
      return
    }
    setProgreso({
      routineId: activeRoutine.id,
      dayId: diaHoy.day.id,
      fecha,
      ejercicioActual: 0,
      ejercicios: ejerciciosBase.map((e) => ({
        exercise: e.exercise,
        series: e.sets.map((s, i) => ({
          slotEntryId: s.slot_entry_id,
          exercise: e.exercise,
          orden: i + 1,
          peso: s.weight ?? '',
          repeticiones: s.repetitions ?? '',
          rir: s.rir ?? '',
          descansoSeg: s.rest ? Math.round(Number(s.rest)) : DESCANSO_POR_DEFECTO,
          completada: false,
        })),
      })),
    })
  }, [activeRoutine, diaHoy, ejerciciosBase, fecha, progreso])

  useEffect(() => {
    if (progreso) guardarProgreso(progreso)
  }, [progreso])

  const crearSesion = useCrearSesion()
  const registrarSerie = useRegistrarSerie()

  if (routines.isLoading || secuencia.isLoading) {
    return <SkeletonList rows={4} height="h-24" />
  }

  if (routines.isError || secuencia.isError) {
    return (
      <ErrorState
        message="No se ha podido cargar el entreno de hoy."
        onRetry={() => {
          void routines.refetch()
          void secuencia.refetch()
        }}
      />
    )
  }

  if (!activeRoutine) {
    return (
      <EmptyState
        icon={Flag}
        title="No hay una rutina activa"
        description="Crea o activa una rutina para poder entrenar."
        action={{ label: 'Ir a Entreno', onClick: () => navigate('/entreno') }}
      />
    )
  }

  if (!diaHoy || esDescanso) {
    return (
      <EmptyState
        icon={BedDouble}
        title="Hoy toca descansar"
        description="No hay entreno programado para hoy en la rutina activa."
        action={{ label: 'Volver a Hoy', onClick: () => navigate('/hoy') }}
      />
    )
  }

  if (!progreso) {
    return <SkeletonList rows={4} height="h-24" />
  }

  const idx = progreso.ejercicioActual
  const ejercicioActual = progreso.ejercicios[idx]
  const nombre = nombres.get(ejercicioActual.exercise) ?? `Ejercicio ${ejercicioActual.exercise}`
  const totalEjercicios = progreso.ejercicios.length
  const totalSeries = progreso.ejercicios.reduce((n, e) => n + e.series.length, 0)
  const seriesCompletadas = progreso.ejercicios.reduce(
    (n, e) => n + e.series.filter((s) => s.completada).length,
    0,
  )

  function irA(nuevoIndex: number) {
    setProgreso((p) => (p ? { ...p, ejercicioActual: nuevoIndex } : p))
    setComoHacerloAbierto(false)
  }

  const hayMedia = Boolean(media.video || media.image)

  function actualizarCampo(
    serieIdx: number,
    campo: 'peso' | 'repeticiones',
    valor: string,
  ) {
    setProgreso((p) => {
      if (!p) return p
      const ejercicios = p.ejercicios.map((e, i) =>
        i !== idx
          ? e
          : { ...e, series: e.series.map((s, j) => (j !== serieIdx ? s : { ...s, [campo]: valor })) },
      )
      return { ...p, ejercicios }
    })
  }

  function completarSerie(serieIdx: number) {
    if (!progreso) return
    const serie = progreso.ejercicios[idx].series[serieIdx]
    if (serie.completada) return
    const nuevo: SesionProgreso = {
      ...progreso,
      ejercicios: progreso.ejercicios.map((e, i) =>
        i !== idx
          ? e
          : { ...e, series: e.series.map((s, j) => (j !== serieIdx ? s : { ...s, completada: true })) },
      ),
    }
    setProgreso(nuevo)
    setDescansoActivo({
      id: `${idx}-${serieIdx}-${Date.now()}`,
      segundos: Math.max(serie.descansoSeg || DESCANSO_POR_DEFECTO, 5),
    })
  }

  async function terminarEntreno() {
    if (!progreso || !activeRoutine || !diaHoy?.day) return
    setError(null)
    setEnviando(true)
    try {
      const sesion = await crearSesion.mutateAsync({
        routine: activeRoutine.id,
        day: diaHoy.day.id,
        date: fecha,
      })
      const ahora = new Date().toISOString()
      for (const ej of progreso.ejercicios) {
        for (const s of ej.series) {
          if (!s.completada) continue
          await registrarSerie.mutateAsync({
            session: sesion.id,
            routine: activeRoutine.id,
            exercise: s.exercise,
            slot_entry: s.slotEntryId,
            weight: s.peso || undefined,
            repetitions: s.repeticiones || undefined,
            rir: s.rir || undefined,
            rest: s.descansoSeg || undefined,
            date: ahora,
          })
        }
      }
      borrarProgreso(activeRoutine.id, fecha)
      navigate('/entreno/historial')
    } catch {
      setError('No se ha podido guardar el entreno. Los datos siguen aqui, prueba otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Ejercicio {idx + 1} de {totalEjercicios} · {seriesCompletadas}/{totalSeries} series
          </p>
          <h1 className="font-display text-4xl leading-tight">{nombre}</h1>
          {mostrarMediaEjercicios && hayMedia ? (
            <button
              type="button"
              onClick={() => setComoHacerloAbierto(true)}
              className="mt-1 flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-xs font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg"
            >
              <Info size={14} aria-hidden="true" />
              Como hacerlo
            </button>
          ) : null}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void terminarEntreno()}
          disabled={enviando || seriesCompletadas === 0}
        >
          {enviando ? 'Guardando...' : 'Terminar'}
        </Button>
      </div>

      {error ? <ErrorState message={error} /> : null}

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => irA(idx - 1)}
          disabled={idx === 0}
          aria-label="Ejercicio anterior"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-surface-2 text-fg disabled:opacity-30"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {progreso.ejercicios.map((e, i) => {
            const hechas = e.series.filter((s) => s.completada).length
            const llena = hechas === e.series.length
            return (
              <button
                key={i}
                type="button"
                onClick={() => irA(i)}
                aria-current={i === idx ? 'step' : undefined}
                aria-label={`Ir al ejercicio ${i + 1}`}
                className={`h-2 flex-1 min-w-[24px] rounded-full transition-colors duration-150 ${
                  i === idx ? 'bg-accent' : llena ? 'bg-primary/60' : 'bg-surface-3'
                }`}
              />
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => irA(idx + 1)}
          disabled={idx === totalEjercicios - 1}
          aria-label="Siguiente ejercicio"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-surface-2 text-fg disabled:opacity-30"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-3 pb-24">
        {ejercicioActual.series.map((s, j) => (
          <SerieRow
            key={j}
            numero={s.orden}
            peso={s.peso}
            repeticiones={s.repeticiones}
            rir={s.rir}
            descansoSeg={s.descansoSeg}
            completada={s.completada}
            onPesoChange={(v) => actualizarCampo(j, 'peso', v)}
            onRepeticionesChange={(v) => actualizarCampo(j, 'repeticiones', v)}
            onCompletar={() => completarSerie(j)}
          />
        ))}
      </div>

      {idx === totalEjercicios - 1 ? (
        <Card className="mt-2">
          <p className="text-sm text-fg-muted">
            Es el ultimo ejercicio. Cuando termines las series, pulsa Terminar arriba para
            guardar el entreno.
          </p>
        </Card>
      ) : null}

      {descansoActivo ? (
        <RestTimer
          key={descansoActivo.id}
          segundosIniciales={descansoActivo.segundos}
          onTerminar={() => setDescansoActivo(null)}
        />
      ) : null}

      <Modal
        open={comoHacerloAbierto}
        onClose={() => setComoHacerloAbierto(false)}
        title={`Como hacerlo: ${nombre}`}
      >
        {media.video ? (
          <video controls muted loop playsInline src={media.video} className="w-full rounded-[14px]" />
        ) : media.image ? (
          <Thumbnail src={media.image} alt={`Como hacer: ${nombre}`} className="aspect-video" />
        ) : (
          <p className="text-sm text-fg-muted">No hay video ni imagen para este ejercicio todavia.</p>
        )}
      </Modal>
    </>
  )
}
