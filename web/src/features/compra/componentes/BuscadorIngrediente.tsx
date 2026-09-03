import { useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import { useBuscarIngredientesWger } from '../datos'

type Props = {
  label: string
  /** Nombre de partida (texto libre o el de un ingrediente ya elegido). */
  valorInicial?: string
  onSeleccionar: (elegido: { ingredientId: number | null; name: string }) => void
}

/**
 * Campo de producto para una linea de compra.
 *
 * Busca contra el endpoint real de wger (`GET /api/v2/ingredient/?name__search=`)
 * segun se escribe, con un pequeno debounce. Si el usuario no elige ninguna
 * sugerencia y sigue escribiendo texto libre ("verduras varias"), se acepta
 * igual: al salir del campo se guarda como texto suelto sin `ingredient` id.
 */
export function BuscadorIngrediente({ label, valorInicial = '', onSeleccionar }: Props) {
  const [texto, setTexto] = useState(valorInicial)
  const [debounced, setDebounced] = useState(valorInicial)
  const [abierto, setAbierto] = useState(false)
  const listboxId = useId()
  const contenedorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto), 300)
    return () => clearTimeout(t)
  }, [texto])

  const busqueda = useBuscarIngredientesWger(debounced)
  const resultados = busqueda.data ?? []

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  function elegir(id: number | null, nombre: string) {
    setTexto(nombre)
    setAbierto(false)
    onSeleccionar({ ingredientId: id, name: nombre })
  }

  return (
    <div ref={contenedorRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-fg-muted">{label}</label>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <input
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className="h-12 w-full rounded-[14px] border border-border bg-surface-2 pl-10 pr-4 text-fg placeholder:text-fg-subtle transition-colors focus:border-primary"
          placeholder="Buscar alimento o escribir texto libre"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
            onSeleccionar({ ingredientId: null, name: e.target.value })
          }}
          onFocus={() => setAbierto(true)}
        />
      </div>

      {abierto && debounced.trim().length >= 2 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-[14px] border border-border bg-surface-2 p-1 shadow-lg"
        >
          {busqueda.isLoading ? (
            <li className="px-3 py-2 text-sm text-fg-subtle">Buscando...</li>
          ) : resultados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-subtle">
              Sin resultados. Se guardará "{debounced}" como texto libre.
            </li>
          ) : (
            resultados.map((r) => (
              <li key={r.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-sm text-fg hover:bg-surface-3"
                  onClick={() => elegir(r.id, r.name)}
                >
                  {r.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
