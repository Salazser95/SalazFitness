/**
 * "Esto ya esta comprado" dentro de la pantalla de Nutricion.
 *
 * Es la mitad que faltaba de la sincronizacion: la lista de la compra sale de
 * los platos del plan (POST /shopping-list/from-nutrition/), y aqui vuelve la
 * informacion en sentido contrario. Al abrir el diario de un dia, cada comida
 * dice si sus alimentos estan ya comprados, a medias o pendientes, sin tener
 * que cambiar de pestana.
 *
 * Si no hay lista activa, o la lista no salio de un plan de nutricion, el hook
 * devuelve `null` y las pantallas no pintan nada: la funcion es un extra, no
 * puede estorbar a quien no use el modulo de compra.
 */

import { Check, ShoppingCart } from 'lucide-react'

import { useCobertura, useHousehold, useListaActiva } from '../compra/datos'
import type { CoberturaComida } from '../compra/tipos'

export type EstadoCompraComida = CoberturaComida['status']

/** Estado de compra de cada comida de una fecha, indexado por id de `meal`. */
export function useEstadoCompraPorComida(fecha: string): Map<string, CoberturaComida> | null {
  const household = useHousehold()
  const lista = useListaActiva(household.data?.id ?? 0)
  // Solo tiene sentido preguntar por la cobertura de una lista que salio de un
  // plan de nutricion: las generadas desde recetas no saben de comidas.
  const listaId = lista.data?.nutrition_plan ? lista.data.id : 0
  const cobertura = useCobertura(listaId, fecha)

  if (!cobertura.data) return null
  return new Map(cobertura.data.meals.map((m) => [m.meal, m]))
}

const ESTILO: Record<EstadoCompraComida, { texto: string; clase: string }> = {
  comprado: { texto: 'Comprado', clase: 'border-success/40 bg-success/10 text-success' },
  parcial: { texto: 'A medias', clase: 'border-warning/40 bg-warning/10 text-warning' },
  pendiente: { texto: 'Sin comprar', clase: 'border-danger/40 bg-danger/10 text-danger' },
  sin_datos: { texto: '', clase: '' },
}

export function EtiquetaCompra({ estado }: { estado: CoberturaComida | undefined }) {
  if (!estado || estado.status === 'sin_datos') return null
  const { texto, clase } = ESTILO[estado.status]
  const Icono = estado.status === 'comprado' ? Check : ShoppingCart

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${clase}`}
      title={`${estado.purchased} de ${estado.total} alimentos comprados`}
    >
      <Icono size={12} aria-hidden="true" />
      {estado.status === 'parcial' ? `${texto} (${estado.purchased}/${estado.total})` : texto}
    </span>
  )
}
