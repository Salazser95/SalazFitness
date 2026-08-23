import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BedDouble, ChevronRight } from 'lucide-react'

import { Card, ErrorState, PageTitle, SectionLabel, SkeletonList } from '../../components/ui'
import { shortDate } from '../../lib/format'
import { useExerciseNames, useRoutineStructure, type StructureSlotEntry } from './api'

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

export default function RutinaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const routineId = id ? Number(id) : null

  const structure = useRoutineStructure(routineId)

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

  return (
    <>
      <PageTitle>{rutina.name}</PageTitle>
      <p className="-mt-3 mb-5 text-sm text-fg-muted">
        {shortDate(rutina.start)} - {shortDate(rutina.end)}
        {rutina.description ? ` · ${rutina.description}` : ''}
      </p>

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
    </>
  )
}
