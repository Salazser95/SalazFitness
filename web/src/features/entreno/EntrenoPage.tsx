import { Route, Routes } from 'react-router-dom'

import RutinasListaPage from './RutinasListaPage'
import SesionPage from './SesionPage'
import HistorialPage from './HistorialPage'
import RutinaDetallePage from './RutinaDetallePage'
import RutinaFormPage from './RutinaFormPage'
import ImportarPlantillaPage from './ImportarPlantillaPage'
import EjercicioEvolucionPage from './EjercicioEvolucionPage'

/**
 * Enrutador de la sección de entrenamiento.
 *
 * La ruta padre en App.tsx es `/entreno/*`, así que aquí las rutas van
 * relativas. El modo gimnasio (`sesion`) es pantalla completa y se pinta sin
 * pestañas, porque en el gimnasio estorban.
 *
 * Ojo con el orden: "rutina/nueva" tiene que ir antes que "rutina/:id" o
 * react-router interpretaria "nueva" como un id.
 */
export default function EntrenoPage() {
  return (
    <Routes>
      <Route index element={<RutinasListaPage />} />
      <Route path="sesion" element={<SesionPage />} />
      <Route path="historial" element={<HistorialPage />} />
      <Route path="importar-plantilla" element={<ImportarPlantillaPage />} />
      <Route path="rutina/nueva" element={<RutinaFormPage />} />
      <Route path="rutina/:id/editar" element={<RutinaFormPage />} />
      <Route path="rutina/:id" element={<RutinaDetallePage />} />
      <Route path="ejercicio/:id" element={<EjercicioEvolucionPage />} />
      <Route path="*" element={<RutinasListaPage />} />
    </Routes>
  )
}
