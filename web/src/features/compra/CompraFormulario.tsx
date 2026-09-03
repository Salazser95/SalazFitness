import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'

import { Button, Card, ErrorState, Field, PageTitle, SectionLabel, SkeletonList } from '../../components/ui'
import { supermercadoDefectoActual } from '../../lib/settings'
import { eurosACentimos, sumarCentimos } from './calculo'
import {
  fechaPorDefectoNuevaCompra,
  useActualizarCompra,
  useActualizarLineaCompra,
  useCrearCompra,
  useCrearLineaCompra,
  useEliminarLineaCompra,
  useHousehold,
  usePurchase,
  usePurchaseItems,
} from './datos'
import { BuscadorIngrediente } from './componentes/BuscadorIngrediente'
import type { NuevaLinea } from './datos'
import type { PurchaseItem } from './tipos'

type LineaForm = {
  tempId: number
  /** Id real en el backend. Si falta, es una linea nueva que aun no existe. */
  id?: number
  ingredientId: number | null
  name: string
  amount: string
  unit: string
  price: string
  is_shared: boolean
  member: number | null
}

let contadorLocal = 0
function nuevaLinea(): LineaForm {
  contadorLocal += 1
  return { tempId: contadorLocal, ingredientId: null, name: '', amount: '1', unit: 'unit', price: '', is_shared: true, member: null }
}

function lineaFormDesdeItem(item: PurchaseItem): LineaForm {
  contadorLocal += 1
  return {
    tempId: contadorLocal,
    id: item.id,
    ingredientId: item.ingredient,
    name: item.name,
    amount: String(item.amount),
    unit: item.unit,
    price: item.price,
    is_shared: item.is_shared,
    member: item.member,
  }
}

function lineaAPayload(l: LineaForm): NuevaLinea {
  return {
    ingredient: l.ingredientId,
    name: l.name.trim(),
    amount: Number(String(l.amount).replace(',', '.')) || 0,
    unit: l.unit.trim() || 'unit',
    price: (eurosACentimos(l.price) / 100).toFixed(2),
    purchased: false,
    is_shared: l.is_shared,
    member: l.is_shared ? null : l.member,
  }
}

export default function CompraFormulario() {
  const navigate = useNavigate()
  const { id: idParam } = useParams<{ id?: string }>()
  const id = Number(idParam) || 0
  const esEdicion = id > 0

  const household = useHousehold()
  const compraExistente = usePurchase(id)
  const lineasExistentes = usePurchaseItems(id)

  const crear = useCrearCompra()
  const actualizar = useActualizarCompra()
  const crearLinea = useCrearLineaCompra()
  const actualizarLinea = useActualizarLineaCompra()
  const eliminarLinea = useEliminarLineaCompra()

  const [fecha, setFecha] = useState(fechaPorDefectoNuevaCompra())
  const [descripcion, setDescripcion] = useState('Compra semanal')
  const [supermercado, setSupermercado] = useState(supermercadoDefectoActual())
  const [coversDays, setCoversDays] = useState('7')
  const [lineas, setLineas] = useState<LineaForm[]>([nuevaLinea()])
  const [lineasEliminadas, setLineasEliminadas] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const cargadoRef = useRef(false)

  const miembros = household.data?.members ?? []

  // En modo edicion, precarga el formulario una sola vez con lo que ya hay
  // en el backend. No se repite al refrescar para no pisar lo que el
  // usuario este escribiendo.
  useEffect(() => {
    if (!esEdicion || cargadoRef.current) return
    if (!compraExistente.data || !lineasExistentes.data) return
    setFecha(compraExistente.data.date)
    setDescripcion(compraExistente.data.description)
    setSupermercado(compraExistente.data.supermarket)
    setCoversDays(String(compraExistente.data.covers_days))
    setLineas(
      lineasExistentes.data.length > 0 ? lineasExistentes.data.map(lineaFormDesdeItem) : [nuevaLinea()],
    )
    cargadoRef.current = true
  }, [esEdicion, compraExistente.data, lineasExistentes.data])

  const totalCentimos = useMemo(
    () => sumarCentimos(lineas.map((l) => eurosACentimos(l.price))),
    [lineas],
  )

  function actualizarCampoLinea(tempId: number, cambios: Partial<LineaForm>) {
    setLineas((prev) => prev.map((l) => (l.tempId === tempId ? { ...l, ...cambios } : l)))
  }

  function quitarLinea(tempId: number) {
    setLineas((prev) => {
      if (prev.length <= 1) return prev
      const linea = prev.find((l) => l.tempId === tempId)
      if (linea?.id) setLineasEliminadas((ids) => [...ids, linea.id!])
      return prev.filter((l) => l.tempId !== tempId)
    })
  }

  const guardando =
    crear.isPending || actualizar.isPending || crearLinea.isPending || actualizarLinea.isPending || eliminarLinea.isPending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!household.data) return
    if (!supermercado.trim()) return setError('Falta el supermercado.')
    if (lineas.some((l) => !l.name.trim())) return setError('Hay líneas sin producto.')
    if (lineas.some((l) => eurosACentimos(l.price) <= 0)) return setError('Hay líneas sin precio.')
    if (lineas.some((l) => !l.is_shared && l.member === null)) {
      return setError('Hay líneas individuales sin persona asignada.')
    }

    const cabecera = {
      date: fecha,
      description: descripcion.trim() || 'Compra',
      supermarket: supermercado.trim(),
      covers_days: Math.max(1, Number(coversDays) || 1),
    }

    if (esEdicion) {
      await actualizar.mutateAsync({ id, cambios: cabecera })

      await Promise.all([
        ...lineas.map((l) =>
          l.id
            ? actualizarLinea.mutateAsync({ id: l.id, purchase: id, cambios: lineaAPayload(l) })
            : crearLinea.mutateAsync({ purchase: id, linea: lineaAPayload(l) }),
        ),
        ...lineasEliminadas.map((lineaId) => eliminarLinea.mutateAsync({ id: lineaId, purchase: id })),
      ])

      navigate(`/compra/compras/${id}`)
      return
    }

    const compra = await crear.mutateAsync({
      cabecera: { household: household.data.id, ...cabecera },
      lineas: lineas.map(lineaAPayload),
    })

    navigate(`/compra/compras/${compra.id}`)
  }

  if (esEdicion && (compraExistente.isLoading || lineasExistentes.isLoading)) {
    return <SkeletonList rows={5} height="h-16" />
  }
  if (esEdicion && (compraExistente.isError || !compraExistente.data)) {
    return <ErrorState onRetry={() => compraExistente.refetch()} />
  }

  return (
    <div className="animate-rise">
      <PageTitle>{esEdicion ? 'Editar compra' : 'Nueva compra'}</PageTitle>
      <form onSubmit={onSubmit} className="space-y-5">
        <Card className="space-y-4">
          <SectionLabel>Cabecera</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            <Field
              label="Días que cubre"
              inputMode="numeric"
              value={coversDays}
              onChange={(e) => setCoversDays(e.target.value)}
              required
            />
          </div>
          <Field label="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
          <Field
            label="Supermercado"
            value={supermercado}
            onChange={(e) => setSupermercado(e.target.value)}
            placeholder="Mercadona, Lidl..."
            required
          />
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Líneas</SectionLabel>
            <Button type="button" variant="secondary" size="sm" onClick={() => setLineas((p) => [...p, nuevaLinea()])}>
              <Plus size={16} aria-hidden="true" />
              Añadir línea
            </Button>
          </div>

          {lineas.map((linea, i) => (
            <Card key={linea.tempId} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-fg-muted">Línea {i + 1}</p>
                {lineas.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Quitar línea ${i + 1}`}
                    onClick={() => quitarLinea(linea.tempId)}
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] text-fg-subtle hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <BuscadorIngrediente
                label="Producto"
                valorInicial={linea.name}
                onSeleccionar={({ ingredientId, name }) => actualizarCampoLinea(linea.tempId, { ingredientId, name })}
              />

              <div className="grid grid-cols-3 gap-3">
                <Field
                  label="Cantidad"
                  inputMode="decimal"
                  value={linea.amount}
                  onChange={(e) => actualizarCampoLinea(linea.tempId, { amount: e.target.value })}
                />
                <div>
                  {/* Select, no texto libre: el backend valida `unit` contra
                      una lista cerrada de opciones (verificado contra la API
                      real: g, kg, ml, l, unit). Texto libre daria un 400. */}
                  <label
                    className="mb-1.5 block text-sm font-medium text-fg-muted"
                    htmlFor={`unidad-${linea.tempId}`}
                  >
                    Unidad
                  </label>
                  <select
                    id={`unidad-${linea.tempId}`}
                    value={linea.unit}
                    onChange={(e) => actualizarCampoLinea(linea.tempId, { unit: e.target.value })}
                    className="h-12 w-full rounded-[14px] border border-border bg-surface-2 px-3 text-fg transition-colors focus:border-primary"
                  >
                    <option value="unit">unidad</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                  </select>
                </div>
                <Field
                  label="Precio (€)"
                  inputMode="decimal"
                  value={linea.price}
                  onChange={(e) => actualizarCampoLinea(linea.tempId, { price: e.target.value })}
                  placeholder="0,00"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-surface-2 p-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={linea.is_shared}
                  onClick={() => actualizarCampoLinea(linea.tempId, { is_shared: !linea.is_shared, member: null })}
                  className="flex items-center gap-3 text-sm font-medium text-fg"
                >
                  <span
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 ${linea.is_shared ? 'bg-primary' : 'bg-surface-3'}`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-fg transition-transform duration-150 ${linea.is_shared ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </span>
                  {linea.is_shared ? 'Compartido' : 'Individual'}
                </button>

                {!linea.is_shared ? (
                  <select
                    aria-label="De quien es este gasto"
                    value={linea.member ?? ''}
                    onChange={(e) => actualizarCampoLinea(linea.tempId, { member: Number(e.target.value) || null })}
                    className="h-10 rounded-[10px] border border-border bg-surface px-3 text-sm text-fg"
                  >
                    <option value="">Elige persona...</option>
                    {miembros.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </Card>
          ))}
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {crear.isError || actualizar.isError ? (
          <p className="text-sm text-danger">No se pudo guardar la compra.</p>
        ) : null}

        <div className="glass sticky bottom-20 flex items-center justify-between rounded-[16px] border border-border-strong p-4 lg:bottom-4">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-fg-muted">Total</p>
            <p className="tnum font-display text-3xl text-violet">{(totalCentimos / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
          </div>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Guardar compra'}
          </Button>
        </div>
      </form>
    </div>
  )
}
