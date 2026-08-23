import { Route, Routes } from 'react-router-dom'

import RutinasListaPage from './RutinasListaPage'
import SesionPage from './SesionPage'
import HistorialPage from './HistorialPage'
import RutinaDetallePage from './RutinaDetallePage'
import EjercicioEvolucionPage from './EjercicioEvolucionPage'

/**
 * Enrutador de la sección de entrenamiento.
 *
 * La ruta padre en App.tsx es `/entreno/*`, así que aquí las rutas van
 * relativas. El modo gimnasio (`sesion`) es pantalla completa y se pinta sin
 * pestañas, porque en el gimnasio estorban.
 */
export default function EntrenoPage() {
  return (
    <Routes>
      <Route index element={<RutinasListaPage />} />
      <Route path="sesion" element={<SesionPage />} />
      <Route path="historial" element={<HistorialPage />} />
      <Route path="rutina/:id" element={<RutinaDetallePage />} />
      <Route path="ejercicio/:id" element={<EjercicioEvolucionPage />} />
      <Route path="*" element={<RutinasListaPage />} />
    </Routes>
  )
}
