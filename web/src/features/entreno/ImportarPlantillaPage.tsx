import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LayoutTemplate } from 'lucide-react'

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  PageTitle,
  SkeletonList,
} from '../../components/ui'
import { today } from '../../lib/format'
import { useImportarPlantilla, usePublicTemplates, type Routine } from './api'

function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00`)
  d.setDate(d.getDate() + dias)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function ModalImportar({
  plantilla,
  onClose,
}: {
  plantilla: Routine | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const importar = useImportarPlantilla()
  const [nombre, setNombre] = useState('')
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(sumarDias(today(), 84))
  const [error, setError] = useState<string | null>(null)

  // Cada vez que se elige una plantilla distinta, se rellenan los valores por defecto.
  useEffect(() => {
    if (!plantilla) return
    const inicio = today()
    setNombre(`${plantilla.name} (copia)`.slice(0, 25))
    setStart(inicio)
    setEnd(sumarDias(inicio, 84))
    setError(null)
  }, [plantilla])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!plantilla) return
    setError(null)
    try {
      const nueva = await importar.mutateAsync({
        routineId: plantilla.id,
        nombre: (nombre.trim() || plantilla.name).slice(0, 25),
        start,
        end,
      })
      onClose()
      navigate(`/entreno/rutina/${nueva.id}`)
    } catch {
      setError('No se ha podido importar la plantilla. Prueba otra vez.')
    }
  }

  return (
    <Modal
      open={plantilla !== null}
      onClose={onClose}
      title={`Importar "${plantilla?.name ?? ''}"`}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <Field
          label="Nombre de tu copia"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={plantilla?.name}
          maxLength={25}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Field label="Fin" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <p className="text-xs text-fg-subtle">
          Se copian todos los días, ejercicios y series de la plantilla a una rutina propia, una
          petición por cada uno: en plantillas largas puede tardar cerca de un minuto. No cierres
          esta pantalla mientras dure.
        </p>
        <Button type="submit" full disabled={importar.isPending}>
          {importar.isPending ? 'Importando...' : 'Importar'}
        </Button>
      </form>
    </Modal>
  )
}

export default function ImportarPlantillaPage() {
  const navigate = useNavigate()
  const plantillas = usePublicTemplates()
  const [elegida, setElegida] = useState<Routine | null>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/entreno')}
        className="mb-3 flex h-11 items-center gap-2 text-sm text-fg-muted transition-colors duration-150 hover:text-fg"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Rutinas
      </button>

      <PageTitle>Importar plantilla</PageTitle>

      {plantillas.isLoading ? <SkeletonList rows={3} height="h-24" /> : null}

      {plantillas.isError ? (
        <ErrorState
          message="No se han podido cargar las plantillas públicas."
          onRetry={() => void plantillas.refetch()}
        />
      ) : null}

      {plantillas.data && plantillas.data.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No hay plantillas públicas todavía"
          description="Cuando la comunidad de wger publique rutinas como plantilla, aparecerán aquí para poder importarlas."
        />
      ) : null}

      {plantillas.data && plantillas.data.length > 0 ? (
        <ul className="space-y-3">
          {plantillas.data.map((p) => (
            <li key={p.id}>
              <Card as="article">
                <p className="font-display text-xl">{p.name}</p>
                {p.description ? (
                  <p className="mt-1 text-sm text-fg-muted">{p.description}</p>
                ) : null}
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => setElegida(p)}>
                  Importar esta plantilla
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <ModalImportar plantilla={elegida} onClose={() => setElegida(null)} />
    </>
  )
}
