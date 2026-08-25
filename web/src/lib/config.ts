/**
 * A que servidor habla la app.
 *
 * En el navegador con `npm run dev` las rutas son relativas y Vite las proxea
 * al Django local, asi que no hay nada que configurar. Pero la app empaquetada
 * (el APK de Android y la de iPhone) NO se sirve desde el servidor: se abre
 * desde el propio movil, con origen `capacitor://` o `https://localhost`, y una
 * ruta relativa como `/api/v2/...` no llega a ninguna parte.
 *
 * De ahi estas dos capas:
 *
 * 1. `VITE_API_BASE`, fijado al compilar, es el servidor por defecto con el que
 *    sale la app. Es lo que se rellena al generar el APK.
 * 2. El usuario puede cambiarlo desde Ajustes y queda guardado en el
 *    dispositivo. Hace falta para quien se monte el servidor en su casa: la
 *    direccion no se sabe al compilar.
 *
 * Con las dos vacias, rutas relativas: el caso del navegador, que es el que ya
 * funcionaba y no se toca.
 */

const CLAVE_SERVIDOR = 'salaz.ajustes.servidor'

/** El servidor con el que se compilo la app. Vacio en desarrollo. */
export const SERVIDOR_POR_DEFECTO = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/** Quita la barra final y valida que sea una URL http(s) absoluta. */
export function normalizarServidor(valor: string): string {
  const limpio = valor.trim().replace(/\/+$/, '')
  if (limpio === '') return ''
  try {
    const url = new URL(limpio)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return limpio
  } catch {
    return ''
  }
}

export function servidorActual(): string {
  const guardado = localStorage.getItem(CLAVE_SERVIDOR)
  if (guardado !== null) return normalizarServidor(guardado)
  return SERVIDOR_POR_DEFECTO
}

/** `''` vuelve al servidor de compilacion (o a rutas relativas si no hay). */
export function escribirServidor(valor: string): string {
  const normalizado = normalizarServidor(valor)
  if (normalizado === '') localStorage.removeItem(CLAVE_SERVIDOR)
  else localStorage.setItem(CLAVE_SERVIDOR, normalizado)
  return normalizado
}

/**
 * La URL completa a la que hay que pedir.
 *
 * Se resuelve en cada peticion, no una vez al arrancar: si el usuario cambia
 * el servidor en Ajustes, la siguiente peticion ya va al nuevo sin recargar.
 */
export function urlApi(ruta: string): string {
  if (/^https?:\/\//i.test(ruta)) return ruta
  const base = servidorActual()
  return base ? `${base}${ruta.startsWith('/') ? '' : '/'}${ruta}` : ruta
}
