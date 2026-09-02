import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Minus, Plus } from 'lucide-react'

/**
 * Temporizador de descanso. Arranca solo al completar una serie, cuenta
 * atras, se puede alargar o acortar 30s. Al llegar a cero vibra si el
 * navegador lo soporta; si no, no pasa nada. Nunca sonido.
 *
 * Diseno (ver Figma "Sesion - con descanso activo"): -30s / tiempo centrado
 * / +30s en una fila, y debajo un boton "Siguiente" a todo lo ancho.
 */

type RestTimerProps = {
  segundosIniciales: number
  onTerminar: () => void
}

export function RestTimer({ segundosIniciales, onTerminar }: RestTimerProps) {
  const [restante, setRestante] = useState(segundosIniciales)
  const terminadoRef = useRef(false)

  // Un solo intervalo por montaje. El padre remonta este componente (key)
  // cada vez que arranca un descanso nuevo.
  useEffect(() => {
    const id = setInterval(() => {
      setRestante((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (restante === 0 && !terminadoRef.current) {
      terminadoRef.current = true
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(400)
      onTerminar()
    }
  }, [restante, onTerminar])

  function siguiente() {
    if (terminadoRef.current) return
    terminadoRef.current = true
    onTerminar()
  }

  const mm = Math.floor(restante / 60)
  const ss = restante % 60

  return (
    <div
      // bottom-16 (4rem) es la altura de la barra inferior de movil SIN
      // contar el area segura del iPhone (el hueco del indicador de
      // inicio, ver pb-safe en styles/theme.css): en un iPhone con ese
      // indicador la barra real es mas alta que 4rem, y con un valor fijo
      // el temporizador quedaba tapado por detras. z-50 (antes z-40, por
      // debajo de la barra) para que nunca quede detras aunque el calculo
      // no cuadre al pixel.
      className="glass fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 border-t border-border px-4 py-3 lg:bottom-0"
      role="timer"
      aria-live="polite"
      aria-label={`Descanso, quedan ${mm} minutos ${ss} segundos`}
    >
      <div className="mx-auto max-w-3xl space-y-2.5">
        <div className="flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => setRestante((s) => Math.max(s - 30, 0))}
            aria-label="Quitar 30 segundos de descanso"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-fg transition-colors duration-150 hover:bg-surface-3"
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <p className="w-32 text-center font-display text-5xl leading-none tnum text-accent">
            {mm}:{String(ss).padStart(2, '0')}
          </p>
          <button
            type="button"
            onClick={() => setRestante((s) => s + 30)}
            aria-label="Añadir 30 segundos de descanso"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-fg transition-colors duration-150 hover:bg-surface-3"
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={siguiente}
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-[14px] bg-primary text-base font-semibold text-on-primary transition-colors duration-150 hover:bg-primary-dim"
        >
          Siguiente
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
