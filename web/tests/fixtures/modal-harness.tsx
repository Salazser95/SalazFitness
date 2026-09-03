/**
 * Punto de entrada de la pagina de pruebas (ver modal-harness.html). Solo
 * monta: el componente de verdad vive en Arnes.tsx, en su propio fichero
 * para que oxlint no se queje de que este modulo no exporta un componente
 * (regla pensada para fast-refresh, que aqui no aplica, pero separar el
 * bootstrap del componente es limpio de todas formas).
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Arnes } from './Arnes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Arnes />
  </StrictMode>,
)
