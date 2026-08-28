import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, BedDouble, CalendarClock, CheckCircle2, Dumbbell, Undo2 } from 'lucide-react'

import { Button, Card, Modal } from '../../../components/ui'
import { shortDate } from '../../../lib/format'
import type { EstadoDia } from '../estadoDelDia'
import {
  useCrearReschedule,
  useDeshacerReschedule,
  useMarcarOmitido,
  useQuitarOmitido,
  useReschedules,
} from '../reprogramacion'

/**
 * Panel "antes de empezar": lo que toca en la fecha elegida (rutina,
 * ejercicios, series), su estado, y las acciones posibles. Lo comparten Hoy
 * y el calendario de Entreno via DayNavigator + useEstadoDelDia — una fecha
 * significa lo mismo se mire desde donde se mire.
 */
export function AntesDeEmpezar({ estado }: { estado: EstadoDia }) {
  const navigate = useNavigate()
  const [pickerAbierto, setPickerAbierto] = useState(false)

  const reschedulesQ = useReschedules()
  const crearReschedule = useCrearReschedule()
  const deshacerReschedule = useDeshacerReschedule()
  const marcarOmitido = useMarcarOmitido()
  const quitarOmitido = useQuitarOmitido()

  const numEjercicios = useMemo(
    () => (estado.dia ? new Set(estado.dia.slots.flatMap((s) => s.exercises)).size : 0),
    [estado.dia],
  )
  const numSeries = useMemo(
    () => estado.dia?.slots.flatMap((s) => s.sets).length ?? 0,
    [estado.dia],
  )

  // Fechas que se pueden ofrecer como destino del intercambio: dentro del
  // rango cargado, que no sean esta misma fecha, y que no esten ya
  // metidas en otro intercambio activo (el backend lo rechazaria igual,
  // pero no tiene sentido ni ofrecerlo).
  const fechasOcupadas = useMemo(() => {
    const ocupadas = new Set<string>()
    for (const r of reschedulesQ.data ?? []) {
      ocupadas.add(r.origin_date)
      ocupadas.add(r.target_date)
    }
    return ocupadas
  }, [reschedulesQ.data])

  const opcionesIntercambio = useMemo(
    () =>
      (estado.secuencia ?? []).filter(
        (d) => d.date !== estado.fecha && !fechasOcupadas.has(d.date),
      ),
    [estado.secuencia, estado.fecha, fechasOcupadas],
  )

  async function intercambiarCon(otraFecha: string) {
    if (!estado.rutina) return
    const actual = estado.dia
    const otro = (estado.secuencia ?? []).find((d) => d.date === otraFecha) ?? null
    await crearReschedule.mutateAsync({
      origin_date: estado.fecha,
      target_date: otraFecha,
      origin_routine: actual?.day ? estado.rutina.id : null,
      origin_day: actual?.day?.id ?? null,
      target_routine: otro?.day ? estado.rutina.id : null,
      target_day: otro?.day?.id ?? null,
    })
    setPickerAbierto(false)
  }

  if (!estado.rutina) {
    return (
      <Card className="p-5 text-center">
        <Dumbbell size={28} className="mx-auto text-fg-subtle" aria-hidden="true" />
        <p className="mt-3 text-sm text-fg-muted">
          No hay una rutina activa para el {shortDate(estado.fecha)}.
        </p>
      </Card>
    )
  }

  if (estado.tipo === 'completado' && estado.sesion) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 text-primary">
          <CheckCircle2 size={20} aria-hidden="true" />
          <p className="font-semibold">Entreno registrado</p>
        </div>
        <p className="mt-2 text-sm text-fg-muted">
          Ya se registró un entreno para el {shortDate(estado.fecha)}.
        </p>
        <Button
          full
          variant="secondary"
          className="mt-4"
          onClick={() => navigate('/entreno/historial')}
        >
          Ver historial
        </Button>
      </Card>
    )
  }

  if (estado.tipo === 'omitido' && estado.marcaOmitido) {
    return (
      <Card className="p-5 text-center">
        <BedDouble size={28} className="mx-auto text-fg-subtle" aria-hidden="true" />
        <p className="mt-3 font-display text-xl">Marcado como omitido</p>
        <p className="mt-1 text-sm text-fg-muted">
          Se decidió no entrenar el {shortDate(estado.fecha)} a propósito.
        </p>
        <Button
          full
          variant="ghost"
          className="mt-4"
          disabled={quitarOmitido.isPending}
          onClick={() => void quitarOmitido.mutateAsync(estado.marcaOmitido!.id)}
        >
          <Undo2 size={16} aria-hidden="true" />
          Quitar marca
        </Button>
      </Card>
    )
  }

  return (
    <>
      {estado.movido && estado.reschedule ? (
        <p className="mb-3 flex items-center gap-2 text-xs text-fg-subtle">
          <ArrowRightLeft size={14} aria-hidden="true" />
          {estado.reschedule.origin_date === estado.fecha
            ? `Este día se intercambió con el ${shortDate(estado.reschedule.target_date)}.`
            : `Este día se intercambió con el ${shortDate(estado.reschedule.origin_date)}.`}
          <button
            type="button"
            onClick={() => void deshacerReschedule.mutateAsync(estado.reschedule!.id)}
            disabled={deshacerReschedule.isPending}
            className="inline-flex items-center gap-1 font-semibold text-fg-muted underline-offset-2 hover:underline"
          >
            <Undo2 size={12} aria-hidden="true" />
            Deshacer
          </button>
        </p>
      ) : null}

      {estado.tipo === 'planificado' && estado.dia?.day ? (
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
            {estado.rutina.name}
          </p>
          <p className="mt-1 font-display text-4xl leading-none">{estado.dia.day.name}</p>
          <p className="mt-2 text-sm text-fg-muted tnum">
            {numEjercicios} {numEjercicios === 1 ? 'ejercicio' : 'ejercicios'} · {numSeries}{' '}
            {numSeries === 1 ? 'serie' : 'series'}
          </p>
          <Button
            full
            size="lg"
            className="mt-5"
            onClick={() => navigate(`/entreno/sesion?fecha=${estado.fecha}`)}
          >
            <Dumbbell size={20} aria-hidden="true" />
            Empezar entreno
          </Button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPickerAbierto(true)}>
              <ArrowRightLeft size={16} aria-hidden="true" />
              Cambiar de día
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={marcarOmitido.isPending}
              onClick={() => void marcarOmitido.mutateAsync(estado.fecha)}
            >
              <BedDouble size={16} aria-hidden="true" />
              Omitir
            </Button>
          </div>
        </Card>
      ) : null}

      {estado.tipo === 'descanso' ? (
        <Card className="p-5 text-center">
          <BedDouble size={32} className="mx-auto text-fg-subtle" aria-hidden="true" />
          <p className="mt-3 font-display text-2xl">Descanso</p>
          <p className="mt-1 text-sm text-fg-muted">
            No hay entreno programado para el {shortDate(estado.fecha)}.
          </p>
          {opcionesIntercambio.some((d) => d.day && !d.day.is_rest) ? (
            <Button full variant="secondary" className="mt-4" onClick={() => setPickerAbierto(true)}>
              <CalendarClock size={16} aria-hidden="true" />
              Traer un entreno a este día
            </Button>
          ) : null}
        </Card>
      ) : null}

      <Modal
        open={pickerAbierto}
        onClose={() => setPickerAbierto(false)}
        title="Elige el otro día"
      >
        <p className="mb-3 text-sm text-fg-muted">
          Se intercambia el contenido de las dos fechas. La rutina en sí no cambia.
        </p>
        {opcionesIntercambio.length === 0 ? (
          <p className="text-sm text-fg-subtle">No hay más días en el rango de esta rutina.</p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {opcionesIntercambio.map((d) => {
              const descanso = !d.day || d.day.is_rest
              return (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => void intercambiarCon(d.date)}
                    disabled={crearReschedule.isPending}
                    className="flex h-14 w-full items-center justify-between rounded-[14px] border border-border bg-surface-2 px-4 text-left transition-colors duration-150 hover:bg-surface-3 disabled:opacity-50"
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
    </>
  )
}
