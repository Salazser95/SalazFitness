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
