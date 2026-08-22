/**
 * Aritmetica de dinero del modulo de compra.
 *
 * Regla del encargo: nunca sumar ni repartir dinero en float de JS. Todo se
 * mueve en centimos enteros y solo se convierte a euros (float) en el ultimo
 * paso, para pintarlo en pantalla con `eur()`.
 *
 * El reparto por persona usa el metodo del mayor resto (largest remainder):
 * reparte centimos enteros segun unos pesos y garantiza que la suma de las
 * partes es EXACTAMENTE el total, sin perder ni sobrar un centimo por el
 * redondeo.
 */

import { eur } from '../../lib/format'
import type { HouseholdMember, PurchaseItem } from './tipos'

// ------------------------------------------------------------ conversion

/**
 * Decimal en euros (string tipo "12.50" o numero) a centimos enteros.
 * Parseo por texto, no `Math.round(parseFloat(x) * 100)`, para no arrastrar
 * el error de coma flotante de multiplicar antes de redondear.
 */
export function eurosACentimos(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === '') return 0
  const texto = String(valor).trim().replace(',', '.')
  const negativo = texto.startsWith('-')
  const sinSigno = negativo ? texto.slice(1) : texto
  const [enteroStr = '0', decimalStr = ''] = sinSigno.split('.')
  const entero = Number.parseInt(enteroStr || '0', 10)
  const decimalPadded = (decimalStr + '00').slice(0, 2)
  const decimal = Number.parseInt(decimalPadded || '0', 10)
  if (Number.isNaN(entero) || Number.isNaN(decimal)) return 0
  const centimos = entero * 100 + decimal
  return negativo ? -centimos : centimos
}

/** Centimos enteros a texto en euros, formato es-ES. Unico punto de division. */
export function centimosAEur(centimos: number | null | undefined): string {
  if (centimos === null || centimos === undefined) return eur(null)
  return eur(centimos / 100)
}

/** Suma seguro de centimos enteros. */
export function sumarCentimos(valores: readonly number[]): number {
  return valores.reduce((acc, v) => acc + Math.round(v), 0)
}

// ------------------------------------------------------------- reparto

/**
 * Reparte un total en centimos segun unos pesos (no hace falta que sumen 1),
 * con el metodo del mayor resto: la suma de las partes siempre da el total
 * exacto.
 */
export function repartirProporcional(totalCentimos: number, pesos: readonly number[]): number[] {
  const sumaPesos = pesos.reduce((a, b) => a + b, 0)
  if (sumaPesos <= 0 || pesos.length === 0) return pesos.map(() => 0)

  const total = Math.round(totalCentimos)
  const brutos = pesos.map((p) => (total * p) / sumaPesos)
  const bases = brutos.map((b) => Math.floor(b))
  let restante = total - sumarCentimos(bases)

  // Reparte lo que falta, un centimo cada vez, a quien tenga mayor resto decimal.
  const ordenPorResto = brutos
    .map((b, i) => ({ i, resto: b - Math.floor(b) }))
    .sort((a, b) => b.resto - a.resto)

  const resultado = [...bases]
  let idx = 0
  while (restante > 0 && ordenPorResto.length > 0) {
    const objetivo = ordenPorResto[idx % ordenPorResto.length]!.i
    resultado[objetivo] = (resultado[objetivo] ?? 0) + 1
    restante -= 1
    idx += 1
  }
  return resultado
}

export type PartePersona = {
  member: number
  name: string
  /** Puntos porcentuales de consumo, 0-100. */
  share: number
  amountCentimos: number
}

/**
 * Reparte las lineas de una compra entre los miembros del hogar.
 *
 * - Lo marcado `is_shared: false` va entero a `item.member`.
 * - El resto se reparte segun `consumption_share` de cada miembro.
 *
 * Ejemplo del encargo: compra de 100 EUR, persona 1 al 60%, persona 2 al 40%
 * -> 60 EUR y 40 EUR si todo es compartido.
 */
export function repartoCompra(
  items: readonly Pick<PurchaseItem, 'price' | 'is_shared' | 'member'>[],
  miembros: readonly Pick<HouseholdMember, 'id' | 'name' | 'consumption_share'>[],
): PartePersona[] {
  const porMiembro = new Map<number, number>(miembros.map((m) => [m.id, 0]))

  const compartidoCentimos = sumarCentimos(
    items.filter((i) => i.is_shared).map((i) => eurosACentimos(i.price)),
  )

  if (compartidoCentimos > 0 && miembros.length > 0) {
    const pesos = miembros.map((m) => Math.max(0, m.consumption_share))
    const partes = repartirProporcional(compartidoCentimos, pesos)
    miembros.forEach((m, i) => {
      porMiembro.set(m.id, (porMiembro.get(m.id) ?? 0) + (partes[i] ?? 0))
    })
  }

  for (const item of items) {
    if (item.is_shared || item.member === null) continue
    const centimos = eurosACentimos(item.price)
    porMiembro.set(item.member, (porMiembro.get(item.member) ?? 0) + centimos)
  }

  return miembros.map((m) => ({
    member: m.id,
    name: m.name,
    share: m.consumption_share,
    amountCentimos: porMiembro.get(m.id) ?? 0,
  }))
}

/** Coste diario por persona (division solo para mostrar, no se vuelve a sumar). */
export function costeDiarioPorPersona(amountCentimos: number, coversDays: number): number {
  if (coversDays <= 0) return 0
  return amountCentimos / coversDays
}

/** Reparte 100 puntos porcentuales a partes iguales entre n miembros, exacto. */
export function repartirPartesIguales(n: number): number[] {
  if (n <= 0) return []
  // Trabaja en centesimas de punto para poder usar el mismo reparto entero.
  const centesimas = repartirProporcional(10_000, Array.from({ length: n }, () => 1))
  return centesimas.map((c) => c / 100)
}

/** La suma de porcentajes del hogar debe dar 100, con un margen minimo de redondeo. */
export function sumaDeReparteBien(shares: readonly number[]): boolean {
  const suma = shares.reduce((a, b) => a + b, 0)
  return Math.abs(suma - 100) < 0.05
}
