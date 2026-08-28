/**
 * Regresion del modal roto en iPhone (ver web/src/components/ui/index.tsx,
 * funcion Superposicion). Corre contra web/tests/fixtures/modal-harness.tsx,
 * que monta los componentes REALES de la app, no una copia.
 *
 * Limitacion, ver playwright.config.ts: solo hay Chromium en este entorno.
 * No se reproduce aqui el mecanismo exacto de Safari (viewport grande vs.
 * visible); se reproducen las dos causas que si son deterministas en
 * cualquier motor: falta de portal (bloque de referencia equivocado) y
 * botones de accion que se salen de la pantalla con contenido largo o
 * viewport pequeno. Falta comprobar en un iPhone o un simulador WebKit real.
 */

import { expect, test } from '@playwright/test'

const RUTA = '/tests/fixtures/modal-harness.html'
// Objetivo tactil minimo del sistema de diseno (ver docs/DESIGN-SYSTEM.md).
const OBJETIVO_TACTIL_MIN = 44

test.describe('Modal: portal a document.body', () => {
  test('escapa de un ancestro con transform en vez de quedar encajonado', async ({ page }) => {
    await page.goto(RUTA)
    const ancestro = page.getByTestId('ancestro-con-transform')
    const cajaAncestro = await ancestro.boundingBox()
    expect(cajaAncestro).toBeTruthy()

    await page.getByTestId('abrir-en-transform').click()
    const dialogo = page.getByRole('dialog', { name: 'Deberia cubrir toda la pantalla' })
    await expect(dialogo).toBeVisible()

    const cajaDialogo = await dialogo.boundingBox()
    expect(cajaDialogo).toBeTruthy()

    // Si el modal SIGUIERA dentro del arbol normal (sin portal), el ancestro
    // con `transform` de mas arriba seria su bloque de referencia para
    // `position: fixed`, y el dialogo quedaria limitado a los 200x200px de
    // esa caja. Con el portal, el dialogo cubre la ventana real, que en
    // este viewport es mucho mas ancha que esos 200px.
    expect(cajaDialogo!.width).toBeGreaterThan(cajaAncestro!.width * 1.5)

    // Y el propio nodo del dialogo tiene que estar fuera del DOM del
    // ancestro (es la prueba directa de que hay portal, no solo un efecto
    // visual parecido por casualidad).
    const dentroDelAncestro = await ancestro.locator('[role="dialog"]').count()
    expect(dentroDelAncestro).toBe(0)
  })
})

test.describe('Modal: botones de accion siempre alcanzables', () => {
  test('confirmacion corta: Cancelar y Eliminar visibles sin hacer nada mas', async ({ page }) => {
    await page.goto(RUTA)
    await page.getByTestId('abrir-corto').click()
    await expect(page.getByRole('dialog', { name: 'Confirmacion corta' })).toBeVisible()

    const cancelar = page.getByRole('button', { name: 'Cancelar' })
    const eliminar = page.getByRole('button', { name: 'Eliminar' })
    await expect(cancelar).toBeInViewport()
    await expect(eliminar).toBeInViewport()
    // toBeInViewport no comprueba que nada lo tape por encima; click() si
    // falla de verdad si el elemento no es realmente pulsable.
    await eliminar.click()
  })

  test('confirmacion larga: los botones no quedan detras del contenido, sin scroll', async ({
    page,
  }) => {
    await page.goto(RUTA)
    await page.getByTestId('abrir-largo').click()
    const dialogo = page.getByRole('dialog', { name: 'Confirmacion larga' })
    await expect(dialogo).toBeVisible()

    // El punto real de esta prueba: con el codigo anterior, titulo, cuerpo Y
    // botones compartian una sola caja con scroll (max-h-[90vh] overflow-
    // auto). Con 25 lineas de texto de relleno, los botones empezaban por
    // debajo del final visible de esa caja y hacia falta desplazarse DENTRO
    // del modal para llegar a ellos. Ahora la cabecera y los botones estan
    // fuera del area que hace scroll, asi que tienen que verse en cuanto se
    // abre, sin tocar nada mas.
    const cancelar = page.getByRole('button', { name: 'Cancelar' })
    const eliminar = page.getByRole('button', { name: 'Eliminar' })
    await expect(cancelar).toBeInViewport()
    await expect(eliminar).toBeInViewport()

    // Y el dialogo entero cabe en la pantalla: nunca se sale por abajo,
    // aunque el contenido sea largo.
    const cajaDialogo = await dialogo.boundingBox()
    const viewport = page.viewportSize()
    expect(cajaDialogo).toBeTruthy()
    expect(viewport).toBeTruthy()
    expect(cajaDialogo!.y + cajaDialogo!.height).toBeLessThanOrEqual(viewport!.height + 1)
  })

  test('el boton de cerrar cumple el objetivo tactil minimo de 44x44', async ({ page }) => {
    await page.goto(RUTA)
    await page.getByTestId('abrir-corto').click()
    const cerrar = page.getByRole('button', { name: 'Cerrar' })
    const caja = await cerrar.boundingBox()
    expect(caja).toBeTruthy()
    expect(caja!.width).toBeGreaterThanOrEqual(OBJETIVO_TACTIL_MIN)
    expect(caja!.height).toBeGreaterThanOrEqual(OBJETIVO_TACTIL_MIN)
  })
})

test.describe('Modal: teclado y foco', () => {
  test('Escape cierra el modal', async ({ page }) => {
    await page.goto(RUTA)
    await page.getByTestId('abrir-corto').click()
    const dialogo = page.getByRole('dialog', { name: 'Confirmacion corta' })
    await expect(dialogo).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialogo).not.toBeVisible()
  })

  test('al cerrar, el foco vuelve al boton que abrio el modal', async ({ page }) => {
    await page.goto(RUTA)
    const disparador = page.getByTestId('abrir-corto')
    await disparador.click()
    await page.keyboard.press('Escape')
    await expect(disparador).toBeFocused()
  })

  test('el foco entra en el modal al abrirlo', async ({ page }) => {
    await page.goto(RUTA)
    await page.getByTestId('abrir-corto').click()
    const dialogo = page.getByRole('dialog', { name: 'Confirmacion corta' })
    // El foco inicial cae en el primer elemento enfocable (el boton de
    // cerrar, X), no se queda en el boton disparador de fuera.
    await expect(dialogo.getByRole('button', { name: 'Cerrar' })).toBeFocused()
  })
})

test.describe('Modal: bloqueo de scroll', () => {
  test('el body queda fijado mientras el modal esta abierto, y se libera al cerrar', async ({
    page,
  }) => {
    await page.goto(RUTA)
    const posicionAntes = await page.evaluate(() => document.body.style.position)
    expect(posicionAntes).not.toBe('fixed')

    await page.getByTestId('abrir-corto').click()
    const posicionAbierto = await page.evaluate(() => document.body.style.position)
    expect(posicionAbierto).toBe('fixed')

    await page.keyboard.press('Escape')
    const posicionCerrado = await page.evaluate(() => document.body.style.position)
    expect(posicionCerrado).not.toBe('fixed')
  })
})
