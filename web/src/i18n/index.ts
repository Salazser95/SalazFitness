import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './en.json'
import esES from './es-ES.json'

/**
 * Infraestructura de i18n de SalazFitness (i18next + react-i18next).
 *
 * es-ES es siempre el idioma por defecto: nunca se detecta el idioma del
 * navegador ni se cae en ingles sin que el usuario lo haya elegido de forma
 * explicita desde el selector de Ajustes. La eleccion se recuerda en
 * localStorage bajo CLAVE_IDIOMA.
 */

export const CLAVE_IDIOMA = 'salaz.idioma'

export const IDIOMAS_DISPONIBLES = [
  { codigo: 'es-ES', etiqueta: 'Español (España)' },
  { codigo: 'en', etiqueta: 'English' },
] as const

function idiomaInicial(): string {
  if (typeof window === 'undefined') return 'es-ES'
  const guardado = window.localStorage.getItem(CLAVE_IDIOMA)
  const esValido = IDIOMAS_DISPONIBLES.some((i) => i.codigo === guardado)
  return esValido ? (guardado as string) : 'es-ES'
}

void i18n.use(initReactI18next).init({
  resources: {
    'es-ES': { translation: esES },
    en: { translation: en },
  },
  lng: idiomaInicial(),
  fallbackLng: 'es-ES',
  interpolation: { escapeValue: false },
})

export default i18n
