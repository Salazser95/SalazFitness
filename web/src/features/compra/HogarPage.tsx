import { useEffect, useState } from 'react'
import { Scale } from 'lucide-react'

import { Button, Card, ErrorState, Field, SectionLabel, SkeletonList } from '../../components/ui'
import { num } from '../../lib/format'
import { repartirPartesIguales, sumaDeReparteBien } from './calculo'
import { useActualizarReparto, useHousehold } from './datos'

function aNumero(texto: string | undefined): number {
  return Number(String(texto ?? '0').replace(',', '.')) || 0
}

export default function HogarPage() {
  const household = useHousehold()
  const actualizar = useActualizarReparto()

  const [porcentajes, setPorcentajes] = useState<Record<number, string>>({})

  // Sincroniza el estado local con lo que llega del servidor, tanto en la
  // carga inicial como despues de guardar.
  useEffect(() => {
    if (!household.data) return
    setPorcentajes(Object.fromEntries(household.data.members.map((m) => [m.id, String(m.consumption_share)])))
  }, [household.data])

  const miembros = household.data?.members ?? []
  const valores = miembros.map((m) => aNumero(porcentajes[m.id]))
  const suma = valores.reduce((a, b) => a + b, 0)
  const sumaOk = miembros.length > 0 && sumaDeReparteBien(valores)

  function cambiarPorcentaje(id: number, valor: string) {
    setPorcentajes((prev) => ({ ...prev, [id]: valor }))
  }

  function repartirIguales() {
    const partes = repartirPartesIguales(miembros.length)
    setPorcentajes(Object.fromEntries(miembros.map((m, i) => [m.id, String(partes[i] ?? 0)])))
  }

  async function guardar() {
    if (!sumaOk) return
    await actualizar.mutateAsync(
      miembros.map((m) => ({ id: m.id, consumption_share: aNumero(porcentajes[m.id]) })),
    )
  }

  if (household.isLoading) return <SkeletonList rows={3} height="h-20" />
  if (household.isError || !household.data) return <ErrorState onRetry={() => household.refetch()} />

  return (
    <div className="animate-rise space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Reparto del hogar</SectionLabel>
        <Button size="sm" variant="secondary" onClick={repartirIguales} disabled={miembros.length === 0}>
          <Scale size={16} aria-hidden="true" />
          Partes iguales
        </Button>
      </div>

      <div className="space-y-3">
        {miembros.map((m) => (
          <Card key={m.id}>
            <Field
              label={m.name}
              inputMode="decimal"
              value={porcentajes[m.id] ?? ''}
              onChange={(e) => cambiarPorcentaje(m.id, e.target.value)}
              hint="Puntos porcentuales de consumo (0-100)"
            />
          </Card>
        ))}
      </div>

      <Card className={sumaOk ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10'}>
        <p className={`text-sm font-medium ${sumaOk ? 'text-success' : 'text-danger'}`}>
          Suma actual: {num(suma)}%{sumaOk ? '' : ' — tiene que sumar exactamente 100%'}
        </p>
      </Card>

      {actualizar.isError ? <p className="text-sm text-danger">No se pudo guardar el reparto.</p> : null}

      <Button full disabled={!sumaOk || actualizar.isPending} onClick={guardar}>
        {actualizar.isPending ? 'Guardando...' : 'Guardar reparto'}
      </Button>
    </div>
  )
}
