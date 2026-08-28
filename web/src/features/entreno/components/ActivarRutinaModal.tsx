import { useState } from 'react'

import { Button, Modal } from '../../../components/ui'
import { shortDate, today } from '../../../lib/format'
import { escribirRutinaActivaId, useActualizarRutina, type Routine } from '../api'

/** Misma duracion que la original, pero empezando en `nuevoInicio`. */
function finPorDuracion(start: string, end: string, nuevoInicio: string): string {
  const dias = Math.max(
    1,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000),
  )
  const d = new Date(`${nuevoInicio}T00:00:00`)
  d.setDate(d.getDate() + dias)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** El proximo lunes despues de `desde` (si `desde` ya es lunes, el de la semana siguiente). */
function proximoLunes(desde: string): string {
  const d = new Date(`${desde}T00:00:00`)
  const dow = d.getDay()
  const diff = ((1 - dow + 7) % 7) || 7
  d.setDate(d.getDate() + diff)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Se abre despues de pulsar "Activar" en una rutina cuyas fechas no cubren
 * hoy. La rutina YA quedo activa en localStorage al pulsar el boton (eso
 * pasa antes, fuera de este componente): este modal solo ofrece, sin
 * forzarlo, desplazar `start`/`end` con un PATCH para que se pueda entrenar
 * de verdad hoy o desde el proximo lunes.
 */
export function ActivarRutinaModal({
  routine,
  onClose,
}: {
  routine: Routine | null
  onClose: () => void
}) {
  const actualizar = useActualizarRutina(routine?.id ?? 0)
  const [error, setError] = useState<string | null>(null)

  async function desplazar(nuevoInicio: string) {
    if (!routine) return
    setError(null)
    try {
      const nuevoFin = finPorDuracion(routine.start, routine.end, nuevoInicio)
      await actualizar.mutateAsync({ start: nuevoInicio, end: nuevoFin })
      void escribirRutinaActivaId(routine.id)
      onClose()
    } catch {
      setError('No se han podido cambiar las fechas. Prueba otra vez.')
    }
  }

  return (
    <Modal open={routine !== null} onClose={onClose} title="Fechas fuera de rango">
      {routine ? (
        <>
          <p className="text-sm text-fg-muted">
            "{routine.name}" ya es tu rutina activa, pero sus fechas ({shortDate(routine.start)} -{' '}
            {shortDate(routine.end)}) no cubren hoy. Puedes desplazarlas para poder entrenar, o
            dejarlas como están.
          </p>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
          <div className="mt-5 space-y-2">
            <Button full disabled={actualizar.isPending} onClick={() => void desplazar(today())}>
              Empezar hoy
            </Button>
            <Button
              full
              variant="secondary"
              disabled={actualizar.isPending}
              onClick={() => void desplazar(proximoLunes(today()))}
            >
              Empezar el próximo lunes
            </Button>
            <Button full variant="ghost" onClick={onClose} disabled={actualizar.isPending}>
              Dejar las fechas como están
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  )
}
