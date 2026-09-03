/**
 * Configuracion de Playwright SOLO para la prueba de regresion del modal en
 * movil (web/tests/modal.spec.ts). No hay mas suites todavia.
 *
 * Usa el Chromium ya instalado en el entorno (PLAYWRIGHT_BROWSERS_PATH), no
 * hace falta `playwright install`.
 *
 * Limitacion conocida: aqui SOLO hay Chromium disponible, no Safari/WebKit
 * de verdad. La reproduccion del bug original (el "viewport grande" de
 * Safari en iPhone, mas alto que el area visible) no se puede replicar tal
 * cual en Chromium, que no distingue viewport grande/pequeno de esa forma.
 * Por eso las pruebas de aqui atacan las DOS causas que si son
 * reproducibles en cualquier motor y que son las que de verdad se
 * arreglaron: que el modal escape por portal a document.body (y no quede
 * encajonado por un ancestro con transform/filter, que es el mismo tipo de
 * problema de "bloque de referencia equivocado" que el de Safari, solo que
 * provocado por CSS de la propia app en vez de por el navegador), y que los
 * botones de accion nunca queden fuera de la pantalla sea cual sea el
 * tamano del contenido o del viewport. Antes de dar esto por bueno en
 * Safari de verdad hace falta probarlo en un iPhone o un simulador WebKit,
 * que no hay en este entorno.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/tests/fixtures/modal-harness.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      // Comprobacion rapida de que el mismo cambio no rompe nada en
      // escritorio: portal, dvh y bloqueo de scroll tienen que comportarse
      // igual de bien con mucho mas sitio disponible.
      name: 'escritorio',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
      },
    },
    {
      // 390x664: iPhone 14 con la barra de Safari VISIBLE (no el viewport
      // "grande" de 390x844 que se mide con la barra oculta). Es justo la
      // diferencia de 180px la que provocaba el fallo: cualquier calculo
      // que asumiera los 844px completos empujaba el modal por debajo de lo
      // que de verdad se ve.
      name: 'iphone-14-safari-visible',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 664 },
        hasTouch: true,
        isMobile: true,
        // El Chromium preinstalado en este entorno es una revision anterior
        // a la que esta version de @playwright/test intentaria descargar
        // por defecto. Se apunta al binario ya instalado en vez de dejar
        // que Playwright intente bajarse otro (sin red de por medio).
        launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
      },
    },
  ],
})
