import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'

import { EmptyState, ErrorState, PageTitle, SkeletonList } from '../../components/ui'
import { DayNavigator } from '../../components/DayNavigator'
import { today } from '../../lib/format'
import { AntesDeEmpezar } from './components/AntesDeEmpezar'
import { useEstadoDelDia } from './estadoDelDia'

/**
 * Calendario de Entreno: la misma DayNavigator + useEstadoDelDia + panel que
 * Hoy, pero como pantalla propia dentro de /entreno (enlazada desde
 * RutinasListaPage). Una fecha significa lo mismo se mire desde donde se
 * mire: no hay dos calculos distintos de "que toca hoy/ese dia".
 *
 * La fecha vive en la URL (?fecha=YYYY-MM-DD) para que un enlace a "el
 * entreno del 25" se pueda compartir o recargar sin perderse.
 */
export default function EntrenoDiaPage() {
  const [params, setParams] = useSearchParams()
  const [fechaSinUrl] = useState(today())
  const fecha = params.get('fecha') || fechaSinUrl

  const estado = useEstadoDelDia(fecha)

  function irA(nuevaFecha: string) {
    setParams(nuevaFecha === today() ? {} : { fecha: nuevaFecha })
  }

  return (
    <div className="animate-rise space-y-5">
      <PageTitle>Calendario</PageTitle>

      <DayNavigator fecha={fecha} onFechaChange={irA} />

      {estado.isLoading ? <SkeletonList rows={1} height="h-44" /> : null}

      {estado.isError ? (
        <ErrorState message="No se ha podido cargar el entreno de esta fecha." />
      ) : null}

      {!estado.isLoading && !estado.isError && estado.rutina === null ? (
        <EmptyState
          icon={Dumbbell}
          title="Sin rutina activa"
          description="Activa una rutina desde la lista de rutinas para ver aquí qué toca cada día."
        />
      ) : null}

      {!estado.isLoading && !estado.isError && estado.rutina !== null ? (
        <AntesDeEmpezar estado={estado} />
      ) : null}
    </div>
  )
}
