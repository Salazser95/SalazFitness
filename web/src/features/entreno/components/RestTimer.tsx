import { useEffect, useRef, useState } from 'react'
import { Plus, SkipForward, Timer } from 'lucide-react'

/**
 * Temporizador de descanso. Arranca solo al completar una serie, cuenta
 * atras, se puede saltar o alargar 30s. Al llegar a cero vibra si el
 * navegador lo soporta; si no, no pasa nada. Nunca sonido.
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

  function saltar() {
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
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <Timer size={22} className="shrink-0 text-accent" aria-hidden="true" />
        <p className="flex-1 font-display text-4xl leading-none tnum text-accent">
          {mm}:{String(ss).padStart(2, '0')}
        </p>
        <button
          type="button"
          onClick={() => setRestante((s) => s + 30)}
          className="flex h-11 items-center gap-1 rounded-[14px] border border-border bg-surface-2 px-3 text-sm font-medium text-fg transition-colors duration-150 hover:bg-surface-3"
        >
          <Plus size={16} aria-hidden="true" />
          30s
        </button>
        <button
          type="button"
          onClick={saltar}
          className="flex h-11 items-center gap-1 rounded-[14px] px-3 text-sm font-medium text-fg-muted transition-colors duration-150 hover:text-fg"
        >
          Saltar
          <SkipForward size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
