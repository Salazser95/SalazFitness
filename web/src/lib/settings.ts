import { create } from 'zustand'

/**
 * Ajustes de la aplicacion que persisten en localStorage.
 *
 * Compartido entre la pantalla de Ajustes (que los escribe) y cualquier
 * pantalla que necesite leerlos (por ejemplo, el detalle de ejercicio decide
 * si pinta el video/imagen segun `mostrarMediaEjercicios`).
 */

const CLAVE_MOSTRAR_MEDIA = 'salaz.ajustes.mostrarMediaEjercicios'
const CLAVE_SUPERMERCADO = 'salaz.ajustes.supermercadoDefecto'

function leerBooleano(clave: string, porDefecto: boolean): boolean {
  const v = localStorage.getItem(clave)
  return v === null ? porDefecto : v === '1'
}

type AjustesState = {
  mostrarMediaEjercicios: boolean
  supermercadoDefecto: string
  setMostrarMediaEjercicios: (v: boolean) => void
  setSupermercadoDefecto: (v: string) => void
}

export const useAjustes = create<AjustesState>((set) => ({
  mostrarMediaEjercicios: leerBooleano(CLAVE_MOSTRAR_MEDIA, true),
  supermercadoDefecto: localStorage.getItem(CLAVE_SUPERMERCADO) ?? 'Mercadona',

  setMostrarMediaEjercicios: (v) => {
    localStorage.setItem(CLAVE_MOSTRAR_MEDIA, v ? '1' : '0')
    set({ mostrarMediaEjercicios: v })
  },

  setSupermercadoDefecto: (v) => {
    localStorage.setItem(CLAVE_SUPERMERCADO, v)
    set({ supermercadoDefecto: v })
  },
}))

/** Lectura puntual fuera de React (por ejemplo, al construir un formulario). */
export function supermercadoDefectoActual(): string {
  return localStorage.getItem(CLAVE_SUPERMERCADO) ?? 'Mercadona'
}
