import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

import { addDays, longDate, today } from '../lib/format'

/**
 * Selector de fecha reutilizado por Hoy y por el calendario de Entreno: los
 * dos necesitan exactamente lo mismo (fecha por defecto hoy, anterior /
 * siguiente / hoy / calendario, deslizar en móvil). Un solo sitio evita que
 * las dos pantallas acaben con gestos o accesibilidad ligeramente distintos.
 *
 * El deslizamiento horizontal es solo un atajo sobre la cabecera: los
 * botones y el calendario funcionan siempre, con o sin gesto (importante
 * porque un mando, un lector de pantalla o un ratón nunca deslizan).
 */

const UMBRAL_DESLIZAR_PX = 56
const LIMITE_ARRASTRE_PX = 80

type DayNavigatorProps = {
  fecha: string
  onFechaChange: (fecha: string) => void
  className?: string
}

export function DayNavigator({ fecha, onFechaChange, className = '' }: DayNavigatorProps) {
  const esHoy = fecha === today()
  const inputFechaRef = useRef<HTMLInputElement>(null)
  const [arrastreX, setArrastreX] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const inicioXRef = useRef<number | null>(null)

  const prefiereMenosMovimiento =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  function manejarPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // El gesto es solo para dedo/lápiz: con ratón ya están los botones.
    if (e.pointerType === 'mouse') return
    inicioXRef.current = e.clientX
    setArrastrando(true)
  }

  function manejarPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (inicioXRef.current === null) return
    const delta = e.clientX - inicioXRef.current
    setArrastreX(Math.max(-LIMITE_ARRASTRE_PX, Math.min(LIMITE_ARRASTRE_PX, delta)))
  }

  function soltar() {
    if (inicioXRef.current === null) return
    if (arrastreX <= -UMBRAL_DESLIZAR_PX) onFechaChange(addDays(fecha, 1))
    else if (arrastreX >= UMBRAL_DESLIZAR_PX) onFechaChange(addDays(fecha, -1))
    inicioXRef.current = null
    setArrastrando(false)
    setArrastreX(0)
  }

  function abrirCalendario() {
    const el = inputFechaRef.current
    if (!el) return
    if ('showPicker' in el && typeof el.showPicker === 'function') el.showPicker()
    else el.focus()
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onFechaChange(addDays(fecha, -1))}
        aria-label="Día anterior"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-surface-2 text-fg transition-colors duration-150 hover:bg-surface-3"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>

      <div
        onPointerDown={manejarPointerDown}
        onPointerMove={manejarPointerMove}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        className="flex min-w-0 flex-1 touch-pan-y select-none flex-col items-center justify-center rounded-[14px] border border-border bg-surface-2 px-3 py-2 text-center"
        style={{
          transform:
            arrastreX && !prefiereMenosMovimiento ? `translateX(${arrastreX}px)` : undefined,
          transition: arrastrando || prefiereMenosMovimiento ? 'none' : 'transform 150ms ease-out',
        }}
      >
        <p aria-live="polite" className="truncate text-sm font-semibold capitalize text-fg">
          {longDate(fecha)}
        </p>
        {esHoy ? (
          <span
            data-testid="insignia-hoy"
            className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary"
          >
            Hoy
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onFechaChange(today())}
        disabled={esHoy}
        aria-label="Ir a hoy"
        className="flex h-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-surface-2 px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-3 disabled:opacity-30"
      >
        Hoy
      </button>

      <button
        type="button"
        onClick={abrirCalendario}
        aria-label="Elegir fecha en el calendario"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-surface-2 text-fg transition-colors duration-150 hover:bg-surface-3"
      >
        <CalendarDays size={20} aria-hidden="true" />
        <input
          ref={inputFechaRef}
          type="date"
          value={fecha}
          onChange={(e) => {
            if (e.target.value) onFechaChange(e.target.value)
          }}
          aria-hidden="true"
          tabIndex={-1}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </button>

      <button
        type="button"
        onClick={() => onFechaChange(addDays(fecha, 1))}
        aria-label="Día siguiente"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-surface-2 text-fg transition-colors duration-150 hover:bg-surface-3"
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  )
}
