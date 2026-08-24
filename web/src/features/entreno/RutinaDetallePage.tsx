import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BedDouble, ChevronRight, Copy, Pencil, Trash2, Zap } from 'lucide-react'

import {
  Button,
  Card,
  ConfirmModal,
  ErrorState,
  Field,
  Modal,
  PageTitle,
  SectionLabel,
  SkeletonList,
} from '../../components/ui'
import { shortDate, today } from '../../lib/format'
import { ActivarRutinaModal } from './components/ActivarRutinaModal'
import { escribirRutinaActivaId } from './local'
import {
  useActiveRoutine,
  useDuplicarRutina,
  useEliminarRutina,
  useExerciseNames,
  useRoutineStructure,
  type Routine,
  type StructureSlotEntry,
} from './api'

/** El primer valor de la lista de configs (normalmente solo hay uno por iteracion 1). */
function valorConfig(configs: { value: string | number }[]): string | null {
  return configs[0] !== undefined ? String(configs[0].value) : null
}

function resumenSerie(entry: StructureSlotEntry): string {
  const sets = valorConfig(entry.set_nr_configs)
  const reps = valorConfig(entry.repetitions_configs)
  const peso = valorConfig(entry.weight_configs)
  const partes = [sets ? `${sets} series` : null, reps ? `${reps} reps` : null, peso ? `${peso} kg` : null]
  return partes.filter(Boolean).join(' · ') || 'Sin configurar'
}

/** Misma duracion que la original, pero empezando hoy. */
function fechaFinPorDuracion(start: string, end: string, nuevoInicio: string): string {
  const dias = Math.max(
    1,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000),
  )
  const d = new Date(`${nuevoInicio}T00:00:00`)
  d.setDate(d.getDate() + dias)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function ModalDuplicar({
  open,
  onClose,
  routineId,
  nombreOriginal,
  start,
  end,
}: {
  open: boolean
  onClose: () => void
  routineId: number
  nombreOriginal: string
  start: string
  end: string
}) {
  const navigate = useNavigate()
  const duplicar = useDuplicarRutina()
  const inicio = today()
  const [nombre, setNombre] = useState(`${nombreOriginal} (copia)`.slice(0, 25))
  const [nuevoInicio, setNuevoInicio] = useState(inicio)
  const [nuevoFin, setNuevoFin] = useState(fechaFinPorDuracion(start, end, inicio))
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const nueva = await duplicar.mutateAsync({
        routineId,
        nombre: nombre.trim(),
        start: nuevoInicio,
        end: nuevoFin,
      })
      onClose()
      navigate(`/entreno/rutina/${nueva.id}`)
    } catch {
      setError('No se ha podido duplicar la rutina. Prueba otra vez.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Duplicar rutina">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <Field label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={25} />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Inicio"
            type="date"
            value={nuevoInicio}
            onChange={(e) => setNuevoInicio(e.target.value)}
          />
          <Field label="Fin" type="date" value={nuevoFin} onChange={(e) => setNuevoFin(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <p className="text-xs text-fg-subtle">
          Se copian todos los dias, ejercicios y series configuradas, una peticion por cada uno:
          en rutinas largas puede tardar cerca de un minuto. No cierres esta pantalla mientras
          dure.
        </p>
        <Button type="submit" full disabled={duplicar.isPending}>
          {duplicar.isPending ? 'Duplicando...' : 'Duplicar'}
        </Button>
      </form>
    </Modal>
  )
}

export default function RutinaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const routineId = id ? Number(id) : null

  const structure = useRoutineStructure(routineId)
  const activeRoutine = useActiveRoutine()
  const eliminar = useEliminarRutina()
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [modalDuplicarAbierto, setModalDuplicarAbierto] = useState(false)
  const [rutinaParaDesplazar, setRutinaParaDesplazar] = useState<Routine | null>(null)

  const exerciseIds = useMemo(
    () =>
      structure.data
        ? structure.data.days.flatMap((d) => d.slots.flatMap((s) => s.entries.map((e) => e.exercise)))
        : [],
    [structure.data],
  )
  const nombres = useExerciseNames(exerciseIds)

  if (structure.isLoading) return <SkeletonList rows={4} height="h-28" />

  if (structure.isError || !structure.data) {
    return (
      <ErrorState
        message="No se ha podido cargar la rutina."
        onRetry={() => void structure.refetch()}
      />
    )
  }

  const rutina = structure.data
  const esActiva = activeRoutine.data?.id === rutina.id

  function activar() {
    escribirRutinaActivaId(rutina.id)
    const hoy = today()
    const cubreHoy = rutina.start <= hoy && hoy <= rutina.end
    if (!cubreHoy) setRutinaParaDesplazar(rutina)
  }

  return (
    <>
      <PageTitle
        right={
          esActiva ? (
            <span className="mb-1 shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-primary">
              Activa
            </span>
          ) : undefined
        }
      >
        {rutina.name}
      </PageTitle>
      <p className="-mt-3 mb-3 text-sm text-fg-muted">
        {shortDate(rutina.start)} - {shortDate(rutina.end)}
        {rutina.description ? ` · ${rutina.description}` : ''}
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {!esActiva ? (
          <Button size="sm" onClick={activar}>
            <Zap size={16} aria-hidden="true" />
            Activar
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => navigate(`/entreno/rutina/${rutina.id}/editar`)}>
          <Pencil size={16} aria-hidden="true" />
          Editar
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setModalDuplicarAbierto(true)}>
          <Copy size={16} aria-hidden="true" />
          Duplicar
        </Button>
        <Button variant="danger" size="sm" onClick={() => setConfirmarBorrado(true)}>
          <Trash2 size={16} aria-hidden="true" />
          Eliminar
        </Button>
      </div>

      <SectionLabel>Dias de la rutina</SectionLabel>
      <ul className="space-y-3">
        {[...rutina.days]
          .sort((a, b) => a.order - b.order)
          .map((day) => (
            <li key={day.id}>
              <Card>
                <div className="mb-2 flex items-center gap-2">
                  {day.is_rest ? (
                    <BedDouble size={18} className="text-fg-subtle" aria-hidden="true" />
                  ) : null}
                  <p className="font-display text-xl">{day.name || `Dia ${day.order}`}</p>
                </div>

                {day.is_rest ? (
                  <p className="text-sm text-fg-muted">Dia de descanso</p>
                ) : day.slots.length === 0 ? (
                  <p className="text-sm text-fg-muted">Sin ejercicios configurados</p>
                ) : (
                  <ul className="space-y-2">
                    {day.slots
                      .flatMap((s) => s.entries)
                      .map((entry) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/entreno/ejercicio/${entry.exercise}`)}
                            className="flex w-full items-center justify-between gap-3 rounded-[14px] px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-2"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-fg">
                                {nombres.get(entry.exercise) ?? `Ejercicio ${entry.exercise}`}
                              </span>
                              <span className="block text-xs text-fg-subtle">
                                {resumenSerie(entry)}
                              </span>
                            </span>
                            <ChevronRight
                              size={18}
                              className="shrink-0 text-fg-subtle"
                              aria-hidden="true"
                            />
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
      </ul>

      <ConfirmModal
        open={confirmarBorrado}
        onClose={() => setConfirmarBorrado(false)}
        onConfirm={() => {
          void eliminar.mutateAsync(rutina.id)
          navigate('/entreno')
        }}
        title={`Eliminar "${rutina.name}"`}
        description="Se borraran tambien todos sus dias y ejercicios configurados. No se puede deshacer."
      />

      <ModalDuplicar
        open={modalDuplicarAbierto}
        onClose={() => setModalDuplicarAbierto(false)}
        routineId={rutina.id}
        nombreOriginal={rutina.name}
        start={rutina.start}
        end={rutina.end}
      />

      <ActivarRutinaModal routine={rutinaParaDesplazar} onClose={() => setRutinaParaDesplazar(null)} />
    </>
  )
}
