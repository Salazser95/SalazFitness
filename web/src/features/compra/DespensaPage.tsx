import { useState } from 'react'
import { Check, PackagePlus, Pencil, Trash2, X } from 'lucide-react'

import { Button, Card, ErrorState, Field, SectionLabel, SkeletonList, UndoBar } from '../../components/ui'
import { num } from '../../lib/format'
import { useUndoStack } from '../../lib/undo'
import { BuscadorIngrediente } from './componentes/BuscadorIngrediente'
import { useCrearPantryItem, useEliminarPantryItem, useHousehold, useIngredienteWger, usePantryItems, useActualizarPantryItem } from './datos'
import type { PantryItem } from './tipos'

const ETIQUETAS_UNIDAD: Record<string, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', unit: 'ud' }

function etiquetaUnidad(unit: string): string {
  return ETIQUETAS_UNIDAD[unit] ?? unit
}

/**
 * Una linea de despensa: cantidad editable a mano (para corregir lo
 * consumido), mismo patron de edicion in situ que FilaMiembro (HogarPage)
 * y FilaPeso (YoPage) -- el borrador solo se rellena al entrar en edicion,
 * nunca con un efecto que lo sincronice de fondo.
 */
function FilaDespensa({
  item,
  onGuardar,
  onEliminar,
}: {
  item: PantryItem
  onGuardar: (amount: number) => void
  onEliminar: (nombre: string) => void
}) {
  const infoIngrediente = useIngredienteWger(item.ingredient ?? 0)
  const nombre = item.ingredient
    ? (infoIngrediente.data?.name ?? (infoIngrediente.isLoading ? 'Cargando...' : `Ingrediente #${item.ingredient}`))
    : item.name

  const [editando, setEditando] = useState(false)
  const [cantidad, setCantidad] = useState('')

  function empezarEdicion() {
    setCantidad(String(item.amount))
    setEditando(true)
  }

  if (editando) {
    const valorValido = Number(String(cantidad).replace(',', '.')) >= 0
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-[14px] bg-surface-2 px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-sm text-fg">{nombre}</p>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          className="h-10 w-24 min-w-0 rounded-[10px] border border-border bg-surface px-2 text-sm text-fg transition-colors focus:border-primary"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
        <span className="text-xs text-fg-subtle">{etiquetaUnidad(item.unit)}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded-[10px] p-2 text-primary transition-colors duration-150 hover:bg-surface-3 disabled:opacity-40"
            aria-label={`Guardar cantidad de ${nombre}`}
            disabled={!valorValido}
            onClick={() => {
              onGuardar(Number(String(cantidad).replace(',', '.')))
              setEditando(false)
            }}
          >
            <Check size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3"
            aria-label="Cancelar edición"
            onClick={() => setEditando(false)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-fg">{nombre}</p>
        <p className="tnum text-xs text-fg-subtle">
          {num(item.amount)} {etiquetaUnidad(item.unit)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-fg"
          aria-label={`Corregir cantidad de ${nombre}`}
          onClick={empezarEdicion}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rounded-[10px] p-2 text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-danger"
          aria-label={`Quitar ${nombre} de la despensa`}
          onClick={() => onEliminar(nombre)}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

export default function DespensaPage() {
  const household = useHousehold()
  const householdId = household.data?.id ?? 0
  const items = usePantryItems(householdId)
  const crear = useCrearPantryItem()
  const actualizar = useActualizarPantryItem()
  const eliminar = useEliminarPantryItem()

  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoIngredientId, setNuevoIngredientId] = useState<number | null>(null)
  const [nuevaUnidad, setNuevaUnidad] = useState('unit')
  const [nuevaCantidad, setNuevaCantidad] = useState('1')
  const deshacer = useUndoStack()

  function anadir() {
    const nombre = nuevoNombre.trim()
    if (!nombre || !householdId) return
    crear.mutate(
      {
        household: householdId,
        ingredient: nuevoIngredientId,
        name: nuevoIngredientId ? '' : nombre,
        unit: nuevaUnidad,
        amount: Number(String(nuevaCantidad).replace(',', '.')) || 0,
      },
      {
        onSuccess: () => {
          setNuevoNombre('')
          setNuevoIngredientId(null)
          setNuevaCantidad('1')
        },
      },
    )
  }

  // Sin confirmar: se quita directamente, y se puede deshacer justo despues.
  function borrarLinea(item: PantryItem, nombre: string) {
    eliminar.mutate({ id: item.id, household: item.household })
    deshacer.registrar({
      etiqueta: `${nombre} quitado de la despensa`,
      restaurar: () =>
        crear
          .mutateAsync({
            household: item.household,
            ingredient: item.ingredient,
            name: item.name,
            unit: item.unit,
            amount: item.amount,
          })
          .then(() => undefined),
    })
  }

  if (household.isLoading || items.isLoading) return <SkeletonList rows={4} height="h-16" />
  if (household.isError || items.isError || !household.data) {
    return (
      <ErrorState
        onRetry={() => {
          household.refetch()
          items.refetch()
        }}
      />
    )
  }

  const lista = items.data ?? []

  return (
    <div className="animate-rise space-y-4">
      <SectionLabel>Despensa</SectionLabel>

      {lista.length > 0 ? (
        <ul className="space-y-2">
          {lista.map((item) => (
            <FilaDespensa
              key={item.id}
              item={item}
              onGuardar={(amount) => actualizar.mutate({ id: item.id, household: item.household, amount })}
              onEliminar={(nombre) => borrarLinea(item, nombre)}
            />
          ))}
        </ul>
      ) : (
        <Card>
          <p className="text-sm text-fg-muted">
            Todavía no hay nada en la despensa. Se rellena sola al marcar líneas de una compra como
            compradas, o puedes añadir algo a mano abajo.
          </p>
        </Card>
      )}

      <Card className="space-y-3">
        <SectionLabel>Añadir a mano</SectionLabel>
        <BuscadorIngrediente
          label="Producto"
          valorInicial={nuevoNombre}
          onSeleccionar={({ ingredientId, name }) => {
            setNuevoIngredientId(ingredientId)
            setNuevoNombre(name)
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Cantidad"
            inputMode="decimal"
            value={nuevaCantidad}
            onChange={(e) => setNuevaCantidad(e.target.value)}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg-muted" htmlFor="despensa-unidad">
              Unidad
            </label>
            <select
              id="despensa-unidad"
              value={nuevaUnidad}
              onChange={(e) => setNuevaUnidad(e.target.value)}
              className="h-12 w-full rounded-[14px] border border-border bg-surface-2 px-3 text-fg transition-colors focus:border-primary"
            >
              <option value="unit">unidad</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="l">l</option>
            </select>
          </div>
        </div>
        <Button full disabled={!nuevoNombre.trim() || crear.isPending} onClick={anadir}>
          <PackagePlus size={18} aria-hidden="true" />
          {crear.isPending ? 'Añadiendo...' : 'Añadir a la despensa'}
        </Button>
        {crear.isError ? <p className="text-sm text-danger">No se pudo añadir. Inténtalo de nuevo.</p> : null}
      </Card>

      {actualizar.isError ? <p className="text-sm text-danger">No se pudo guardar la cantidad.</p> : null}
      {eliminar.isError ? <p className="text-sm text-danger">No se pudo quitar la línea.</p> : null}

      <UndoBar
        visible={deshacer.pendientes > 0}
        etiqueta={deshacer.error ?? deshacer.etiquetaUltima}
        onDeshacer={() => void deshacer.deshacer()}
        deshaciendo={deshacer.deshaciendo}
      />
    </div>
  )
}
