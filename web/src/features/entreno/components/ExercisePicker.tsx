import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'

import { Skeleton } from '../../../components/ui'
import { useBuscarEjercicios, type EjercicioBuscable } from '../api'

/**
 * Selector de ejercicio por nombre. wger NO tiene /api/v2/exercise/search/,
 * asi que useBuscarEjercicios trae la lista completa una vez (cacheada,
 * staleTime Infinity) y aqui se filtra en el cliente por substring.
 */
export function ExercisePicker({
  value,
  onChange,
}: {
  value: EjercicioBuscable | null
  onChange: (ejercicio: EjercicioBuscable | null) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const ejercicios = useBuscarEjercicios()

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q || !ejercicios.data) return []
    return ejercicios.data.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 30)
  }, [busqueda, ejercicios.data])

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[14px] border border-primary/40 bg-primary/[0.08] px-4 py-3">
        <span className="min-w-0 truncate text-fg">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Quitar ejercicio elegido"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor="buscar-ejercicio" className="mb-1.5 block text-sm font-medium text-fg-muted">
        Ejercicio
      </label>
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <input
          id="buscar-ejercicio"
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Escribe para buscar, ej. sentadilla"
          className="h-12 w-full rounded-[14px] border border-border bg-surface-2 pl-11 pr-4 text-fg placeholder:text-fg-subtle focus:border-primary"
        />
      </div>

      {ejercicios.isLoading ? <Skeleton className="mt-2 h-12" /> : null}

      {ejercicios.isError ? (
        <p className="mt-2 text-sm text-danger">No se ha podido cargar la lista de ejercicios.</p>
      ) : null}

      {busqueda.trim() && resultados.length === 0 && !ejercicios.isLoading ? (
        <p className="mt-2 text-sm text-fg-subtle">Sin resultados para "{busqueda}".</p>
      ) : null}

      {resultados.length > 0 ? (
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {resultados.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(e)
                  setBusqueda('')
                }}
                className="flex h-11 w-full items-center rounded-[12px] px-3 text-left text-sm text-fg transition-colors duration-150 hover:bg-surface-2"
              >
                {e.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
