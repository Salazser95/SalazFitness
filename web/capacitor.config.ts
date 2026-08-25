/**
 * Empaquetado de la PWA como app nativa (APK de Android y app de iPhone).
 *
 * Capacitor no reescribe la app: mete la web ya compilada (`dist/`) dentro de
 * un contenedor nativo con su icono, su splash y su entrada en el cajon de
 * aplicaciones. El mismo codigo que corre en el navegador corre en el movil, y
 * no hace falta mantener dos aplicaciones.
 *
 * Ojo con el origen: dentro del contenedor la app se sirve desde
 * `https://localhost` (Android) o `capacitor://localhost` (iOS), NO desde el
 * servidor. Por eso las peticiones tienen que ir a una URL absoluta
 * (ver src/lib/config.ts) y por eso el backend declara esos origenes en CORS
 * (ver backend/salaz_settings_prod.py).
 */

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.salazfitness.app',
  appName: 'SalazFitness',
  webDir: 'dist',
  android: {
    // https en vez de http: sin esto Android bloquea las peticiones a un
    // servidor https desde un origen http por politica de contenido mixto.
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'always',
  },
  server: {
    // Solo dominios propios se abren dentro de la app; cualquier otro enlace
    // sale al navegador del sistema, que es lo que se espera de una app.
    androidScheme: 'https',
  },
}

export default config
