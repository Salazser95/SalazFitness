import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * Gesto de deslizar horizontal, reutilizado por cualquier selector de fecha
 * (DayNavigator, el carrusel de "Proximos dias" de Hoy, el selector de dia
 * de Nutricion...). Convencion: deslizar hacia la DERECHA dispara "siguiente"
 * (direccion 1), hacia la IZQUIERDA dispara "anterior" (direccion -1) -- lo
 * que "siguiente"/"anterior" signifiquen (un dia, una semana, 5 dias) lo
 * decide quien llama.
 *
 * Solo dedo/lapiz: con raton ya estan los botones, y ademas el pointerdown
 * de un click normal dispararia el gesto sin querer.
 */

const UMBRAL_DESLIZAR_PX = 56
const LIMITE_ARRASTRE_PX = 80

export function useSwipe(onPaso: (direccion: 1 | -1) => void) {
  const [arrastreX, setArrastreX] = useState(0)
  const [arrastrando, setArrastrando] = useState(false)
  const inicioXRef = useRef<number | null>(null)

  function onPointerDown(e: ReactPointerEvent) {
    if (e.pointerType === 'mouse') return
    inicioXRef.current = e.clientX
    setArrastrando(true)
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (inicioXRef.current === null) return
    const delta = e.clientX - inicioXRef.current
    setArrastreX(Math.max(-LIMITE_ARRASTRE_PX, Math.min(LIMITE_ARRASTRE_PX, delta)))
  }

  function soltar() {
    if (inicioXRef.current === null) return
    if (arrastreX >= UMBRAL_DESLIZAR_PX) onPaso(1)
    else if (arrastreX <= -UMBRAL_DESLIZAR_PX) onPaso(-1)
    inicioXRef.current = null
    setArrastrando(false)
    setArrastreX(0)
  }

  const prefiereMenosMovimiento =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return {
    arrastreX,
    arrastrando,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: soltar,
      onPointerCancel: soltar,
    },
    /** Listo para pegar en `style`: desplazamiento en vivo + transicion suave al soltar. */
    estiloArrastre: {
      transform: arrastreX && !prefiereMenosMovimiento ? `translateX(${arrastreX}px)` : undefined,
      transition: arrastrando || prefiereMenosMovimiento ? 'none' : 'transform 150ms ease-out',
    },
  }
}
