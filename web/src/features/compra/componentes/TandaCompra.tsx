/**
 * Una tanda de la lista de la compra: un viaje al supermercado.
 *
 * Una lista de 12 dias no se compra de una vez. El backend reparte cada linea
 * en tandas segun lo que aguante el producto (ver backend/salaz/frescura.py), y
 * esta es la pieza que lo ensena: la compra grande del primer dia, y luego las
 * reposiciones de fruta fresca cada dos o tres dias, cada una con su fecha.
 */

import { Check, Snowflake } from 'lucide-react'

import { Card, SectionLabel } from '../../../components/ui'
import { eur, shortDate, today } from '../../../lib/format'
import type { CategoriaFrescura, ShoppingListItem } from '../tipos'

/** Etiqueta corta por categoria, para el pasillo del super. */
const ETIQUETA_CATEGORIA: Record<CategoriaFrescura, string> = {
  despensa: 'Despensa',
  congelado: 'Congelado',
  lacteo: 'Lácteos',
  fruta: 'Fruta',
  fruta_delicada: 'Fruta delicada',
  verdura: 'Verdura',
  carne: 'Carne',
  pescado: 'Pescado',
  huevos: 'Huevos',
  panaderia: 'Panadería',
}

export function etiquetaCategoria(categoria: CategoriaFrescura | ''): string {
  return categoria ? ETIQUETA_CATEGORIA[categoria] : ''
}

/**
 * Como de urgente es una tanda respecto a hoy.
 *
 * `hoy` se pasa como parametro en vez de leerlo aqui para que la pantalla
 * calcule la fecha una sola vez por render y todas las tandas la compartan.
 */
export function estadoTanda(
  fecha: string | null,
  hoy: string,
): 'hoy' | 'pasada' | 'futura' | 'sin_fecha' {
  if (!fecha) return 'sin_fecha'
  if (fecha === hoy) return 'hoy'
  return fecha < hoy ? 'pasada' : 'futura'
}

function textoCuando(fecha: string | null, hoy: string): string {
  const estado = estadoTanda(fecha, hoy)
  if (estado === 'sin_fecha' || !fecha) return 'Sin fecha'
  if (estado === 'hoy') return 'Hoy'
  const dias = Math.round(
    (new Date(`${fecha}T00:00:00`).getTime() - new Date(`${hoy}T00:00:00`).getTime()) / 86_400_000,
  )
  if (dias === 1) return 'Mañana'
  if (dias === -1) return 'Ayer'
  if (dias > 1) return `En ${dias} días · ${shortDate(fecha)}`
  return `Hace ${Math.abs(dias)} días · ${shortDate(fecha)}`
}

export function CabeceraTanda({
  trip,
  fecha,
  items,
  comprados,
  estimado,
}: {
  trip: number
  fecha: string | null
  items: number
  comprados: number
  estimado: number
}) {
  const hoy = today()
  const estado = estadoTanda(fecha, hoy)
  const hecha = items > 0 && comprados === items

  const color = hecha
    ? 'border-success/40 bg-success/10 text-success'
    : estado === 'hoy'
      ? 'border-primary/50 bg-primary/10 text-primary'
      : estado === 'pasada'
        ? 'border-danger/40 bg-danger/10 text-danger'
        : 'border-border bg-surface-2 text-fg-muted'

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <div className="flex items-center gap-2">
        <SectionLabel>
          {trip === 1 ? 'Compra grande' : `Reposición ${trip - 1}`}
        </SectionLabel>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${color}`}>
          {hecha ? 'Hecha' : textoCuando(fecha, hoy)}
        </span>
      </div>
      <span className="tnum text-sm text-fg-muted">
        {comprados}/{items} · {eur(estimado / 100)}
      </span>
    </div>
  )
}

/** Las pistas de frescura de una linea: cuanto aguanta, si hay que congelarla. */
export function PistasFrescura({ item }: { item: ShoppingListItem }) {
  const etiqueta = etiquetaCategoria(item.category)
  const cubre = item.days_covered > 0 ? `para ${item.days_covered} días` : ''

  return (
    <>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
        <span>
          {item.amount} {item.unit}
        </span>
        {cubre ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{cubre}</span>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <span>{item.supermarket || 'Sin asignar'}</span>
        {etiqueta ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{etiqueta}</span>
          </>
        ) : null}
      </p>

      {item.freeze_on_arrival ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-cyan-300">
          <Snowflake size={13} aria-hidden="true" />
          Al congelador al llegar a casa
        </p>
      ) : null}

      {item.source ? <p className="mt-0.5 truncate text-xs text-fg-subtle">para: {item.source}</p> : null}
      {item.note ? <p className="mt-0.5 text-xs text-fg-subtle">{item.note}</p> : null}
    </>
  )
}

/** Aviso de la tanda de hoy en la cabecera de la lista. */
export function AvisoDeHoy({ items }: { items: ShoppingListItem[] }) {
  const hoy = today()
  const pendientes = items.filter(
    (i) => !i.purchased && i.buy_date !== null && i.buy_date <= hoy,
  )
  if (pendientes.length === 0) return null

  const frescos = pendientes.filter((i) => (i.shelf_life_days ?? 999) <= 7)

  return (
    <Card className="border-primary/40 bg-primary/5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Check size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-fg">Hoy toca comprar {pendientes.length} cosas</p>
          <p className="mt-0.5 text-sm text-fg-muted">
            {frescos.length > 0
              ? `${frescos.length} de fresco, que no aguanta hasta la próxima compra.`
              : 'Todo de despensa: aguanta el período entero.'}
          </p>
        </div>
      </div>
    </Card>
  )
}
