/** Formateo consistente en toda la app. Locale es-ES. */

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
const cf = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export const num = (v: number | string | null | undefined): string =>
  v === null || v === undefined || v === '' ? '-' : nf.format(Number(v))

export const int = (v: number | string | null | undefined): string =>
  v === null || v === undefined || v === '' ? '-' : nf0.format(Number(v))

export const eur = (v: number | string | null | undefined): string =>
  v === null || v === undefined || v === '' ? '-' : cf.format(Number(v))

export const kg = (v: number | string | null | undefined): string =>
  v === null || v === undefined || v === '' ? '-' : `${nf.format(Number(v))} kg`

/** Segundos a "1:30" o "45s" */
export function rest(seconds: number | string | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === '') return '-'
  const s = Number(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `${m}:00` : `${m}:${String(r).padStart(2, '0')}`
}

/** Fecha ISO a "lun 24 ago" */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** Fecha de hoy en YYYY-MM-DD, hora local (no UTC, que desplaza el dia). */
export function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Suma (o resta, con delta negativo) dias a una fecha YYYY-MM-DD, en hora
 * local. Construye el Date con año/mes/dia sueltos (no parseando el ISO
 * completo) para no pasar por UTC: `new Date('2026-08-25')` interpretaria
 * medianoche UTC, que en cualquier huso horario negativo cae en el dia
 * anterior una vez formateado en local.
 */
export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  fecha.setDate(fecha.getDate() + delta)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`
}

/** Fecha ISO a "Lunes 25 de agosto" (mismo problema de huso que addDays, mismo arreglo). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  const s = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
