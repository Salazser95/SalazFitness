/**
 * Escenarios de Modal/ConfirmModal para web/tests/modal.spec.ts.
 * Usa los componentes reales de src/components/ui/index.tsx: si Modal
 * cambia, esta pagina prueba el cambio de verdad, no una reimplementacion.
 */

import { useState } from 'react'

import { Button, ConfirmModal, Modal } from '../../src/components/ui/index'

const DESCRIPCION_LARGA = Array.from(
  { length: 25 },
  (_, i) => `Linea de contenido numero ${i + 1} para forzar que el modal necesite scroll interno.`,
).join(' ')

export function Arnes() {
  const [cortoAbierto, setCortoAbierto] = useState(false)
  const [largoAbierto, setLargoAbierto] = useState(false)
  const [enTransformAbierto, setEnTransformAbierto] = useState(false)

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <button data-testid="abrir-corto" onClick={() => setCortoAbierto(true)}>
        Abrir confirmacion corta
      </button>
      <button data-testid="abrir-largo" onClick={() => setLargoAbierto(true)}>
        Abrir confirmacion larga
      </button>

      {/*
        Ancestro con `transform`: crea un nuevo bloque de referencia para
        `position: fixed` en cualquier descendiente que NO se renderice en
        un portal. Es la prueba de que Modal escapa de verdad a
        document.body: sin portal, el modal quedaria encajonado dentro de
        esta caja de 200x200 en vez de cubrir la pantalla entera.
      */}
      <div
        data-testid="ancestro-con-transform"
        style={{ transform: 'translateZ(0)', width: 200, height: 200, overflow: 'hidden' }}
      >
        <button data-testid="abrir-en-transform" onClick={() => setEnTransformAbierto(true)}>
          Abrir dentro de un ancestro con transform
        </button>
        <Modal
          open={enTransformAbierto}
          onClose={() => setEnTransformAbierto(false)}
          title="Deberia cubrir toda la pantalla"
        >
          <p>Si esto se ve encajonado en una caja de 200x200, el portal no esta funcionando.</p>
        </Modal>
      </div>

      <ConfirmModal
        open={cortoAbierto}
        onClose={() => setCortoAbierto(false)}
        onConfirm={() => {}}
        title="Confirmacion corta"
        description="Una descripcion breve."
      />

      <ConfirmModal
        open={largoAbierto}
        onClose={() => setLargoAbierto(false)}
        onConfirm={() => {}}
        title="Confirmacion larga"
        description={DESCRIPCION_LARGA}
      />

      <Button data-testid="fuera-del-modal" onClick={() => {}}>
        Boton de fuera, para probar que el foco vuelve aqui
      </Button>
    </div>
  )
}
