/**
 * DayNavigator (ver web/src/components/DayNavigator.tsx), reutilizado por
 * Hoy y por el calendario de Entreno. Corre contra
 * web/tests/fixtures/day-navigator-harness.tsx, que monta el componente
 * REAL y expone la fecha elegida como el mismo enlace ?fecha= que usa
 * "Empezar entreno" en la app de verdad: comprobar ese enlace es comprobar
 * que la fecha que elige el selector es la que le llegaria a SesionPage.
 */

import { expect, test } from '@playwright/test'

const RUTA = '/tests/fixtures/day-navigator-harness.html'
const OBJETIVO_TACTIL_MIN = 44

function hoyIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function sumarDias(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  fecha.setDate(fecha.getDate() + delta)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`
}

test.describe('DayNavigator: fecha por defecto y botones', () => {
  test('empieza en hoy, con la insignia "Hoy" visible', async ({ page }) => {
    await page.goto(RUTA)
    await expect(page.getByTestId('fecha-actual')).toHaveText(hoyIso())
    await expect(page.getByTestId('insignia-hoy')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ir a hoy' })).toBeDisabled()
  })

  test('"Día siguiente" avanza un día y actualiza el enlace a sesión', async ({ page }) => {
    await page.goto(RUTA)
    await page.getByRole('button', { name: 'Día siguiente' }).click()
    const manana = sumarDias(hoyIso(), 1)
    await expect(page.getByTestId('fecha-actual')).toHaveText(manana)
    await expect(page.getByTestId('ir-a-sesion')).toHaveAttribute(
      'href',
      `/entreno/sesion?fecha=${manana}`,
    )
  })

  test('"Día anterior" retrocede un día', async ({ page }) => {
    await page.goto(RUTA)
    await page.getByRole('button', { name: 'Día anterior' }).click()
    await expect(page.getByTestId('fecha-actual')).toHaveText(sumarDias(hoyIso(), -1))
  })

  test('"Ir a hoy" vuelve a hoy tras navegar, y se vuelve a deshabilitar', async ({ page }) => {
    await page.goto(RUTA)
    await page.getByRole('button', { name: 'Día siguiente' }).click()
    await page.getByRole('button', { name: 'Día siguiente' }).click()
    const boton = page.getByRole('button', { name: 'Ir a hoy' })
    await expect(boton).toBeEnabled()
    await boton.click()
    await expect(page.getByTestId('fecha-actual')).toHaveText(hoyIso())
    await expect(boton).toBeDisabled()
  })

  test('el calendario permite saltar a cualquier fecha', async ({ page }) => {
    await page.goto(RUTA)
    // El <input type="date"> real esta oculto visualmente pero funcional,
    // superpuesto al boton con el icono (mismo patron que un <input
    // type="file"> disfrazado): es el control accesible de verdad, el
    // boton solo aporta el icono y el aria-label.
    await page.locator('input[type="date"]').fill('2026-09-15')
    await expect(page.getByTestId('fecha-actual')).toHaveText('2026-09-15')
  })
})

test.describe('DayNavigator: objetivos táctiles y accesibilidad', () => {
  test('los botones miden al menos 44x44px', async ({ page }) => {
    await page.goto(RUTA)
    for (const nombre of ['Día anterior', 'Ir a hoy', 'Elegir fecha en el calendario', 'Día siguiente']) {
      const caja = await page.getByRole('button', { name: nombre }).boundingBox()
      expect(caja).toBeTruthy()
      expect(caja!.width).toBeGreaterThanOrEqual(OBJETIVO_TACTIL_MIN)
      expect(caja!.height).toBeGreaterThanOrEqual(OBJETIVO_TACTIL_MIN)
    }
  })

  test('los cuatro botones son alcanzables con Tab, en orden', async ({ page }) => {
    await page.goto(RUTA)
    // "Ir a hoy" empieza deshabilitado (ya se esta en hoy) y un boton
    // deshabilitado no entra en el orden de tabulacion: se navega un dia
    // primero para que los cuatro botones esten activos a la vez.
    await page.getByRole('button', { name: 'Día siguiente' }).click()
    await page.getByRole('button', { name: 'Día anterior' }).focus()
    await expect(page.getByRole('button', { name: 'Día anterior' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Ir a hoy' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Elegir fecha en el calendario' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Día siguiente' })).toBeFocused()
  })

  test('activar "Día siguiente" con el teclado (Enter) también avanza la fecha', async ({ page }) => {
    await page.goto(RUTA)
    await page.getByRole('button', { name: 'Día siguiente' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('fecha-actual')).toHaveText(sumarDias(hoyIso(), 1))
  })
})

test.describe('DayNavigator: deslizar en la cabecera (solo táctil)', () => {
  test.use({ hasTouch: true })

  test('deslizar a la derecha por encima del umbral avanza un día', async ({ page }) => {
    await page.goto(RUTA)
    const objetivo = page.locator('p[aria-live="polite"]').locator('xpath=..')
    const caja = await objetivo.boundingBox()
    expect(caja).toBeTruthy()
    const centroY = caja!.y + caja!.height / 2
    const inicioX = caja!.x + caja!.width / 2

    await objetivo.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: inicioX,
      clientY: centroY,
      bubbles: true,
    })
    await objetivo.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: inicioX + 70,
      clientY: centroY,
      bubbles: true,
    })
    await objetivo.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: inicioX + 70,
      clientY: centroY,
      bubbles: true,
    })

    await expect(page.getByTestId('fecha-actual')).toHaveText(sumarDias(hoyIso(), 1))
  })

  test('deslizar a la izquierda por encima del umbral retrocede un día', async ({ page }) => {
    await page.goto(RUTA)
    const objetivo = page.locator('p[aria-live="polite"]').locator('xpath=..')
    const caja = await objetivo.boundingBox()
    expect(caja).toBeTruthy()
    const centroY = caja!.y + caja!.height / 2
    const inicioX = caja!.x + caja!.width / 2

    await objetivo.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: inicioX,
      clientY: centroY,
      bubbles: true,
    })
    await objetivo.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: inicioX - 70,
      clientY: centroY,
      bubbles: true,
    })
    await objetivo.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: inicioX - 70,
      clientY: centroY,
      bubbles: true,
    })

    await expect(page.getByTestId('fecha-actual')).toHaveText(sumarDias(hoyIso(), -1))
  })

  test('un arrastre por debajo del umbral no cambia la fecha (el gesto nunca es el único camino)', async ({
    page,
  }) => {
    await page.goto(RUTA)
    const objetivo = page.locator('p[aria-live="polite"]').locator('xpath=..')
    const caja = await objetivo.boundingBox()
    expect(caja).toBeTruthy()
    const centroY = caja!.y + caja!.height / 2
    const inicioX = caja!.x + caja!.width / 2

    await objetivo.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: inicioX,
      clientY: centroY,
      bubbles: true,
    })
    await objetivo.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: inicioX - 20,
      clientY: centroY,
      bubbles: true,
    })
    await objetivo.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: inicioX - 20,
      clientY: centroY,
      bubbles: true,
    })

    await expect(page.getByTestId('fecha-actual')).toHaveText(hoyIso())
  })

  test('un intento de arrastre con ratón no mueve la fecha (el gesto es solo táctil)', async ({
    page,
  }) => {
    await page.goto(RUTA)
    const objetivo = page.locator('p[aria-live="polite"]').locator('xpath=..')
    const caja = await objetivo.boundingBox()
    expect(caja).toBeTruthy()
    const centroY = caja!.y + caja!.height / 2
    const inicioX = caja!.x + caja!.width / 2

    await objetivo.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: inicioX,
      clientY: centroY,
      bubbles: true,
    })
    await objetivo.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: inicioX - 70,
      clientY: centroY,
      bubbles: true,
    })
    await objetivo.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: inicioX - 70,
      clientY: centroY,
      bubbles: true,
    })

    await expect(page.getByTestId('fecha-actual')).toHaveText(hoyIso())
  })
})
