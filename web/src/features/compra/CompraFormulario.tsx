import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'

import { Button, Card, Field, PageTitle, SectionLabel } from '../../components/ui'
import { eurosACentimos, sumarCentimos } from './calculo'
import { useCrearCompra, useHousehold, fechaPorDefectoNuevaCompra } from './datos'
import { BuscadorIngrediente } from './componentes/BuscadorIngrediente'

type LineaForm = {
  tempId: number
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
  return { tempId: contadorLocal, ingredientId: null, name: '', amount: '1', unit: 'ud', price: '', is_shared: true, member: null }
}

export default function CompraFormulario() {
  const navigate = useNavigate()
  const household = useHousehold()
  const crear = useCrearCompra()

  const [fecha, setFecha] = useState(fechaPorDefectoNuevaCompra())
  const [descripcion, setDescripcion] = useState('Compra semanal')
  const [supermercado, setSupermercado] = useState('')
  const [coversDays, setCoversDays] = useState('7')
  const [lineas, setLineas] = useState<LineaForm[]>([nuevaLinea()])
  const [error, setError] = useState<string | null>(null)

  const miembros = household.data?.members ?? []

  const totalCentimos = useMemo(
    () => sumarCentimos(lineas.map((l) => eurosACentimos(l.price))),
    [lineas],
  )

  function actualizarLinea(tempId: number, cambios: Partial<LineaForm>) {
    setLineas((prev) => prev.map((l) => (l.tempId === tempId ? { ...l, ...cambios } : l)))
  }

  function quitarLinea(tempId: number) {
    setLineas((prev) => (prev.length > 1 ? prev.filter((l) => l.tempId !== tempId) : prev))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!household.data) return
    if (!supermercado.trim()) return setError('Falta el supermercado.')
    if (lineas.some((l) => !l.name.trim())) return setError('Hay lineas sin producto.')
    if (lineas.some((l) => eurosACentimos(l.price) <= 0)) return setError('Hay lineas sin precio.')
    if (lineas.some((l) => !l.is_shared && l.member === null)) {
      return setError('Hay lineas individuales sin persona asignada.')
    }

    const compra = await crear.mutateAsync({
      cabecera: {
        household: household.data.id,
        date: fecha,
        description: descripcion.trim() || 'Compra',
        supermarket: supermercado.trim(),
        covers_days: Math.max(1, Number(coversDays) || 1),
      },
      lineas: lineas.map((l) => ({
        ingredient: l.ingredientId,
        name: l.name.trim(),
        amount: Number(String(l.amount).replace(',', '.')) || 0,
        unit: l.unit.trim() || 'ud',
        price: (eurosACentimos(l.price) / 100).toFixed(2),
        is_shared: l.is_shared,
        member: l.is_shared ? null : l.member,
      })),
    })

    navigate(`/compra/compras/${compra.id}`)
  }

  return (
    <div className="animate-rise">
      <PageTitle>Nueva compra</PageTitle>
      <form onSubmit={onSubmit} className="space-y-5">
        <Card className="space-y-4">
          <SectionLabel>Cabecera</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            <Field
              label="Dias que cubre"
              inputMode="numeric"
              value={coversDays}
              onChange={(e) => setCoversDays(e.target.value)}
              required
            />
          </div>
          <Field label="Descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
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
            <SectionLabel>Lineas</SectionLabel>
            <Button type="button" variant="secondary" size="sm" onClick={() => setLineas((p) => [...p, nuevaLinea()])}>
              <Plus size={16} aria-hidden="true" />
              Anadir linea
            </Button>
          </div>

          {lineas.map((linea, i) => (
            <Card key={linea.tempId} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-fg-muted">Linea {i + 1}</p>
                {lineas.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Quitar linea ${i + 1}`}
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
                onSeleccionar={({ ingredientId, name }) => actualizarLinea(linea.tempId, { ingredientId, name })}
              />

              <div className="grid grid-cols-3 gap-3">
                <Field
                  label="Cantidad"
                  inputMode="decimal"
                  value={linea.amount}
                  onChange={(e) => actualizarLinea(linea.tempId, { amount: e.target.value })}
                />
                <Field
                  label="Unidad"
                  value={linea.unit}
                  onChange={(e) => actualizarLinea(linea.tempId, { unit: e.target.value })}
                />
                <Field
                  label="Precio (€)"
                  inputMode="decimal"
                  value={linea.price}
                  onChange={(e) => actualizarLinea(linea.tempId, { price: e.target.value })}
                  placeholder="0,00"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-surface-2 p-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={linea.is_shared}
                  onClick={() => actualizarLinea(linea.tempId, { is_shared: !linea.is_shared, member: null })}
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
                    onChange={(e) => actualizarLinea(linea.tempId, { member: Number(e.target.value) || null })}
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
        {crear.isError ? <p className="text-sm text-danger">No se pudo guardar la compra.</p> : null}

        <div className="glass sticky bottom-20 flex items-center justify-between rounded-[16px] border border-border-strong p-4 lg:bottom-4">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-fg-muted">Total</p>
            <p className="tnum font-display text-3xl text-violet">{(totalCentimos / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
          </div>
          <Button type="submit" disabled={crear.isPending}>
            {crear.isPending ? 'Guardando...' : 'Guardar compra'}
          </Button>
        </div>
      </form>
    </div>
  )
}
