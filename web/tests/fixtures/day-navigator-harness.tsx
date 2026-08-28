/**
 * Punto de entrada de la pagina de pruebas (ver day-navigator-harness.html).
 * Solo monta: el componente de verdad vive en ArnesNavegador.tsx (mismo
 * motivo que modal-harness.tsx / Arnes.tsx: separar el bootstrap evita el
 * aviso de oxlint de fast-refresh sobre exportar solo componentes).
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ArnesNavegador } from './ArnesNavegador'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArnesNavegador />
  </StrictMode>,
)
