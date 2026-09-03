import { useCallback, useRef, useState } from 'react'

/**
 * Pila de "deshacer" en memoria (se pierde al recargar, a proposito: es solo
 * para arrepentirse justo despues de borrar algo, no un historial persistente).
 * Cada `registrar` mete una accion nueva arriba de la pila; `deshacer` quita
 * y ejecuta la de arriba. Se puede deshacer tantas veces seguidas como cosas
 * se hayan borrado, una a una, en orden inverso.
 */
export type AccionDeshacer = {
  /** Texto corto para la barra, p.ej. "Serie de Press de banca eliminada". */
  etiqueta: string
  /** Recrea lo que se borro. Si falla, la accion se queda en la pila para reintentar. */
  restaurar: () => Promise<void>
}

export function useUndoStack() {
  const pilaRef = useRef<AccionDeshacer[]>([])
  const [pendientes, setPendientes] = useState(0)
  const [etiquetaUltima, setEtiquetaUltima] = useState<string | null>(null)
  const [deshaciendo, setDeshaciendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sincronizar = useCallback(() => {
    setPendientes(pilaRef.current.length)
    setEtiquetaUltima(pilaRef.current.length > 0 ? pilaRef.current[pilaRef.current.length - 1].etiqueta : null)
  }, [])

  const registrar = useCallback(
    (accion: AccionDeshacer) => {
      setError(null)
      pilaRef.current = [...pilaRef.current, accion]
      sincronizar()
    },
    [sincronizar],
  )

  const deshacer = useCallback(async () => {
    const ultima = pilaRef.current[pilaRef.current.length - 1]
    if (!ultima || deshaciendo) return
    setDeshaciendo(true)
    setError(null)
    try {
      await ultima.restaurar()
      pilaRef.current = pilaRef.current.slice(0, -1)
      sincronizar()
    } catch {
      setError('No se ha podido deshacer. Prueba otra vez.')
    } finally {
      setDeshaciendo(false)
    }
  }, [deshaciendo, sincronizar])

  return { pendientes, etiquetaUltima, registrar, deshacer, deshaciendo, error }
}
