import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BedDouble, ChevronLeft, ChevronRight, Flag, Info } from 'lucide-react'

import { Button, Card, EmptyState, ErrorState, Modal, SkeletonList, Thumbnail } from '../../components/ui'
import { useAjustes } from '../../lib/settings'
import { today } from '../../lib/format'
import {
  useCrearSesion,
  useEliminarSerie,
  useExerciseMedia,
  useExerciseNames,
  useRegistrarSerie,
  type SetConfigData,
} from './api'
import { useEstadoDelDia } from './estadoDelDia'
import { RestTimer } from './components/RestTimer'
import { SerieRow } from './components/SerieRow'
import { useGuardarSesionDraft, useLimpiarSesionDraft, useSesionDraft } from './sesionDraft'
import type { SesionProgreso } from './lib/sesionStorage'

const DESCANSO_POR_DEFECTO = 90
const RETARDO_GUARDADO_MS = 500

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
  const [params] = useSearchParams()
  // Por defecto hoy: "Empezar entreno" desde Hoy o desde el calendario de
  // Entreno manda ?fecha=, pero entrar sin ella (enlace viejo, barra de
  // direcciones) sigue funcionando igual que antes.
  const fecha = params.get('fecha') || today()

  // Unica fuente de verdad de "que toca esta fecha": la misma que usan Hoy y
  // el calendario de Entreno (ver estadoDelDia.ts), ya con los intercambios
  // aplicados. Sustituye a la derivacion manual que habia aqui antes
  // (rutina activa + secuencia + movidos de localStorage por separado).
  const estado = useEstadoDelDia(fecha)
  const activeRoutine = estado.rutina
  const diaHoy = estado.dia
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

  // Progreso guardado en el servidor (ver sesionDraft.ts): reemplaza al
  // localStorage de antes, para que un entreno a medias se pueda retomar
  // desde otro dispositivo.
  const draftQ = useSesionDraft(fecha)
  const guardarDraft = useGuardarSesionDraft(fecha)
  const limpiarDraft = useLimpiarSesionDraft(fecha)

  // Carga el progreso guardado (o arranca uno nuevo) en cuanto se sabe que
  // toca ese dia Y ya se sabe si habia un borrador guardado en el servidor.
  useEffect(() => {
    if (progreso || !activeRoutine || !diaHoy?.day || ejerciciosBase.length === 0) return
    if (draftQ.isLoading) return
    const guardado = draftQ.data
    if (guardado && guardado.dayId === diaHoy.day.id) {
      setProgreso(guardado)
      return
    }
    setProgreso({
      routineId: activeRoutine.id,
      dayId: diaHoy.day.id,
      fecha,
      ejercicioActual: 0,
      sesionId: null,
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
          logId: null,
        })),
      })),
    })
  }, [activeRoutine, diaHoy, ejerciciosBase, fecha, progreso, draftQ.data, draftQ.isLoading])

  // Guarda con retardo: cada serie marcada o cifra tecleada cambia
  // `progreso`, y no hace falta una peticion por cada una (mismo patron que
  // el objetivo de peso en features/yo/YoPage.tsx).
  const temporizadorDraft = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progresoRef = useRef(progreso)
  const guardarDraftRef = useRef(guardarDraft)
  useEffect(() => {
    progresoRef.current = progreso
    guardarDraftRef.current = guardarDraft
  }, [progreso, guardarDraft])

  useEffect(() => {
    if (!progreso) return
    if (temporizadorDraft.current) clearTimeout(temporizadorDraft.current)
    temporizadorDraft.current = setTimeout(() => {
      guardarDraftRef.current.mutate(progresoRef.current!)
    }, RETARDO_GUARDADO_MS)
    return () => {
      if (temporizadorDraft.current) clearTimeout(temporizadorDraft.current)
    }
  }, [progreso])

  // Si se desmonta con un guardado pendiente (se navega fuera antes de que
  // pasen los 500ms), lo manda ya en vez de perderlo.
  useEffect(() => {
    return () => {
      if (temporizadorDraft.current) {
        clearTimeout(temporizadorDraft.current)
        if (progresoRef.current) guardarDraftRef.current.mutate(progresoRef.current)
      }
    }
  }, [])

  const crearSesion = useCrearSesion()
  const registrarSerie = useRegistrarSerie()
  const eliminarSerie = useEliminarSerie()
  const [desmarcandoIdx, setDesmarcandoIdx] = useState<number | null>(null)

  if (estado.isLoading) {
    return <SkeletonList rows={4} height="h-24" />
  }

  if (estado.isError) {
    return <ErrorState message="No se ha podido cargar el entreno de esta fecha." />
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
        title="Toca descansar"
        description="No hay entreno programado para esta fecha en la rutina activa."
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

  /**
   * Desmarca una serie ya completada (se salto el ejercicio o se marco por
   * error). Si esa serie ya tenia un workoutlog guardado en el backend
   * (`logId`: pasa cuando "Terminar" fallo a mitad y se reintenta, ver
   * `terminarEntreno`), lo borra primero para que el progreso guardado
   * refleje de verdad lo que se hizo.
   */
  async function desmarcarSerie(serieIdx: number) {
    if (!progreso) return
    const serie = progreso.ejercicios[idx].series[serieIdx]
    if (!serie.completada) return

    if (serie.logId) {
      setDesmarcandoIdx(serieIdx)
      setError(null)
      try {
        await eliminarSerie.mutateAsync(serie.logId)
      } catch {
        setError('No se ha podido borrar el registro guardado. Prueba otra vez.')
        setDesmarcandoIdx(null)
        return
      }
      setDesmarcandoIdx(null)
    }

    setProgreso((p) => {
      if (!p) return p
      const ejercicios = p.ejercicios.map((e, i) =>
        i !== idx
          ? e
          : {
              ...e,
              series: e.series.map((s, j) =>
                j !== serieIdx ? s : { ...s, completada: false, logId: null },
              ),
            },
      )
      return { ...p, ejercicios }
    })
  }

  /**
   * Crea la sesion (si no existe todavia) y registra cada serie completada
   * que aun no tenga `logId`. Guarda el id de sesion y de cada log en cuanto
   * se crean: si algo falla a mitad (red, servidor), un reintento no
   * duplica lo que ya se guardo, solo continua donde se quedo.
   */
  async function terminarEntreno() {
    if (!progreso || !activeRoutine || !diaHoy?.day) return
    setError(null)
    setEnviando(true)
    try {
      let sesionId = progreso.sesionId
      if (!sesionId) {
        const sesion = await crearSesion.mutateAsync({
          routine: activeRoutine.id,
          day: diaHoy.day.id,
          date: fecha,
        })
        sesionId = sesion.id
        setProgreso((p) => (p ? { ...p, sesionId } : p))
      }

      const ahora = new Date().toISOString()
      for (let ei = 0; ei < progreso.ejercicios.length; ei++) {
        const ej = progreso.ejercicios[ei]
        for (let si = 0; si < ej.series.length; si++) {
          const s = ej.series[si]
          if (!s.completada || s.logId) continue
          const log = await registrarSerie.mutateAsync({
            session: sesionId,
            routine: activeRoutine.id,
            exercise: s.exercise,
            slot_entry: s.slotEntryId,
            weight: s.peso || undefined,
            repetitions: s.repeticiones || undefined,
            rir: s.rir || undefined,
            rest: s.descansoSeg || undefined,
            date: ahora,
          })
          setProgreso((p) => {
            if (!p) return p
            const ejercicios = p.ejercicios.map((e, i) =>
              i !== ei
                ? e
                : { ...e, series: e.series.map((ss, j) => (j !== si ? ss : { ...ss, logId: log.id })) },
            )
            return { ...p, ejercicios }
          })
        }
      }
      limpiarDraft.mutate()
      navigate('/entreno/historial')
    } catch {
      setError(
        'No se ha podido guardar el entreno entero. Lo que ya se guardó no se repetirá: pulsa Terminar otra vez para completar el resto.',
      )
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
              Cómo hacerlo
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
            desmarcando={desmarcandoIdx === j}
            onPesoChange={(v) => actualizarCampo(j, 'peso', v)}
            onRepeticionesChange={(v) => actualizarCampo(j, 'repeticiones', v)}
            onCompletar={() => completarSerie(j)}
            onDesmarcar={() => void desmarcarSerie(j)}
          />
        ))}
      </div>

      {idx === totalEjercicios - 1 ? (
        <Card className="mt-2">
          <p className="text-sm text-fg-muted">
            Es el último ejercicio. Cuando termines las series, pulsa Terminar arriba para
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
        title={`Cómo hacerlo: ${nombre}`}
      >
        {media.video ? (
          <video controls muted loop playsInline src={media.video} className="w-full rounded-[14px]" />
        ) : media.image ? (
          <Thumbnail src={media.image} alt={`Cómo hacer: ${nombre}`} className="aspect-video" />
        ) : (
          <p className="text-sm text-fg-muted">No hay video ni imagen para este ejercicio todavía.</p>
        )}
      </Modal>
    </>
  )
}
