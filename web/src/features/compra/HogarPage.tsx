import { useEffect, useState } from 'react'
import { Link2, Scale, Trash2, UserPlus } from 'lucide-react'

import { Button, Card, ConfirmModal, ErrorState, Field, SectionLabel, SkeletonList } from '../../components/ui'
import { num } from '../../lib/format'
import { repartirPartesIguales, sumaDeReparteBien } from './calculo'
import {
  useActualizarReparto,
  useCrearMiembro,
  useEliminarMiembro,
  useHousehold,
  useVincularMiembro,
} from './datos'
import type { HouseholdMember } from './tipos'

function aNumero(texto: string | undefined): number {
  return Number(String(texto ?? '0').replace(',', '.')) || 0
}

/**
 * Una fila de miembro: el reparto de gasto de siempre, mas el estado de su
 * cuenta vinculada (quien la tiene ve y edita los mismos datos del hogar,
 * ver salaz/api/views.py _acceso_hogar). Vincular/desvincular es edicion in
 * situ, mismo patron que FilaComida (PlanPage.tsx) y FilaPeso (YoPage.tsx).
 */
function FilaMiembro({
  miembro,
  porcentaje,
  onCambiarPorcentaje,
  onGuardarVinculo,
  vinculando,
  onEliminar,
}: {
  miembro: HouseholdMember
  porcentaje: string
  onCambiarPorcentaje: (valor: string) => void
  onGuardarVinculo: (username: string) => void
  vinculando: boolean
  onEliminar: () => void
}) {
  const [editandoVinculo, setEditandoVinculo] = useState(false)
  const [username, setUsername] = useState('')

  function empezarEdicion() {
    setUsername(miembro.username ?? '')
    setEditandoVinculo(true)
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-end gap-2">
        <Field
          label={miembro.name}
          inputMode="decimal"
          value={porcentaje}
          onChange={(e) => onCambiarPorcentaje(e.target.value)}
          hint="Puntos porcentuales de consumo (0-100)"
          className="flex-1"
        />
        <button
          type="button"
          aria-label={`Eliminar a ${miembro.name} del hogar`}
          onClick={onEliminar}
          className="mb-1.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] text-fg-subtle hover:bg-surface-2 hover:text-danger"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>

      {editandoVinculo ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="usuario"
            aria-label={`Cuenta vinculada de ${miembro.name}`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-primary"
          />
          <Button
            size="sm"
            disabled={vinculando}
            onClick={() => {
              onGuardarVinculo(username.trim())
              setEditandoVinculo(false)
            }}
          >
            Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditandoVinculo(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={empezarEdicion}
          className="flex items-center gap-1.5 text-xs text-fg-subtle transition-colors duration-150 hover:text-fg"
        >
          <Link2 size={12} aria-hidden="true" />
          {miembro.username ? `Vinculado a @${miembro.username}` : 'Sin cuenta vinculada — toca para vincular'}
        </button>
      )}
    </Card>
  )
}

export default function HogarPage() {
  const household = useHousehold()
  const actualizar = useActualizarReparto()
  const eliminar = useEliminarMiembro()
  const crearMiembro = useCrearMiembro()
  const vincularMiembro = useVincularMiembro()

  const [porcentajes, setPorcentajes] = useState<Record<number, string>>({})
  const [aBorrar, setABorrar] = useState<HouseholdMember | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')

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

  function onEliminarMiembro() {
    if (!aBorrar) return
    eliminar.mutate(aBorrar.id)
  }

  function anadirMiembro() {
    const nombre = nombreNuevo.trim()
    if (!nombre || !household.data) return
    crearMiembro.mutate(
      { household: household.data.id, name: nombre },
      { onSuccess: () => setNombreNuevo('') },
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
          <FilaMiembro
            key={m.id}
            miembro={m}
            porcentaje={porcentajes[m.id] ?? ''}
            onCambiarPorcentaje={(valor) => cambiarPorcentaje(m.id, valor)}
            onGuardarVinculo={(username) => vincularMiembro.mutate({ id: m.id, link_username: username })}
            vinculando={vincularMiembro.isPending}
            onEliminar={() => setABorrar(m)}
          />
        ))}
      </div>

      <Card className="space-y-3">
        <SectionLabel>Añadir miembro</SectionLabel>
        <div className="flex items-end gap-2">
          <Field
            label="Nombre"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            className="flex-1"
          />
          <Button disabled={!nombreNuevo.trim() || crearMiembro.isPending} onClick={anadirMiembro}>
            <UserPlus size={18} aria-hidden="true" />
            {crearMiembro.isPending ? 'Añadiendo...' : 'Añadir'}
          </Button>
        </div>
        {crearMiembro.isError ? (
          <p className="text-sm text-danger">No se pudo añadir el miembro. Inténtalo de nuevo.</p>
        ) : null}
        <p className="text-xs text-fg-subtle">
          Un miembro nuevo empieza sin cuenta vinculada: solo cuenta para el reparto de gasto. Para que
          alguien vea y edite los mismos datos del hogar desde su propia cuenta, vincúlala tocando "Sin
          cuenta vinculada" bajo su nombre (tiene que haberse registrado antes en la app).
        </p>
      </Card>

      <Card className={sumaOk ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10'}>
        <p className={`text-sm font-medium ${sumaOk ? 'text-success' : 'text-danger'}`}>
          Suma actual: {num(suma)}%{sumaOk ? '' : ' — tiene que sumar exactamente 100%'}
        </p>
      </Card>

      {actualizar.isError ? <p className="text-sm text-danger">No se pudo guardar el reparto.</p> : null}
      {eliminar.isError ? <p className="text-sm text-danger">No se pudo eliminar el miembro.</p> : null}
      {vincularMiembro.isError ? (
        <p className="text-sm text-danger">No se pudo vincular la cuenta. Comprueba el nombre de usuario.</p>
      ) : null}

      <Button full disabled={!sumaOk || actualizar.isPending} onClick={guardar}>
        {actualizar.isPending ? 'Guardando...' : 'Guardar reparto'}
      </Button>

      <ConfirmModal
        open={aBorrar !== null}
        onClose={() => setABorrar(null)}
        onConfirm={onEliminarMiembro}
        title="Eliminar miembro del hogar"
        description={
          aBorrar
            ? `Se eliminará a ${aBorrar.name} y su reparto de gasto (${num(aBorrar.consumption_share)}%). Esta acción no se puede deshacer.`
            : undefined
        }
      />
    </div>
  )
}
