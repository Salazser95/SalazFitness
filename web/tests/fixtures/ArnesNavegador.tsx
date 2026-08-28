/**
 * Escenario de DayNavigator para web/tests/day-navigator.spec.ts. Usa el
 * componente real de src/components/DayNavigator.tsx y expone la fecha
 * elegida como texto y como el enlace que en la app de verdad usa
 * "Empezar entreno" (?fecha=), para poder comprobar que la fecha que elige
 * el selector es la misma que llegaria a SesionPage.
 */

import { useState } from 'react'

import { DayNavigator } from '../../src/components/DayNavigator'
import { today } from '../../src/lib/format'

export function ArnesNavegador() {
  const [fecha, setFecha] = useState(today())

  return (
    <div style={{ padding: 24, maxWidth: 480, fontFamily: 'sans-serif' }}>
      <DayNavigator fecha={fecha} onFechaChange={setFecha} />
      <p data-testid="fecha-actual">{fecha}</p>
      <a data-testid="ir-a-sesion" href={`/entreno/sesion?fecha=${fecha}`}>
        Empezar entreno
      </a>
    </div>
  )
}
