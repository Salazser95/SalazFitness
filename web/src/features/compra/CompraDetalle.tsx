import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Copy, Pencil, Store, Trash2, User, Users } from 'lucide-react'

import { Button, Card, ConfirmModal, ErrorState, SectionLabel, SkeletonList, StatCard } from '../../components/ui'
import { eur, num, shortDate } from '../../lib/format'
import { centimosAEur, costeDiarioPorPersona, eurosACentimos, precioPorUnidadTexto, sumarCentimos } from './calculo'
import {
  useActualizarLineaCompra,
  useDuplicarCompra,
  useEliminarCompra,
  usePurchase,
  usePurchaseBreakdown,
  usePurchaseItems,
} from './datos'
import { Casilla } from './ListaPage'
import type { PurchaseItem } from './tipos'

export default function CompraDetalle() {
  const navigate = useNavigate()
  const { id: idParam } = useParams<{ id: string }>()
  const id = Number(idParam) || 0

  const compra = usePurchase(id)
  const lineas = usePurchaseItems(id)
  const breakdown = usePurchaseBreakdown(id)
  const eliminar = useEliminarCompra()
  const duplicar = useDuplicarCompra()
  const actualizarLinea = useActualizarLineaCompra()

  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  function onToggleComprado(item: PurchaseItem) {
    actualizarLinea.mutate({ id: item.id, purchase: id, cambios: { purchased: !item.purchased } })
  }

  const cargando = compra.isLoading || lineas.isLoading || breakdown.isLoading
  const error = compra.isError || lineas.isError || breakdown.isError

  if (cargando) return <SkeletonList rows={5} height="h-16" />
  if (error || !compra.data || !breakdown.data) {
    return (
      <ErrorState
        onRetry={() => {
          compra.refetch()
          lineas.refetch()
          breakdown.refetch()
        }}
      />
    )
  }

  // Nombre por miembro sacado del propio desglose: ya trae {member, name},
  // asi que no hace falta pedir el household aparte.
  const nombrePorMiembro = new Map(breakdown.data.cost_per_person.map((p) => [p.member, p.name]))

  const listaLineas: PurchaseItem[] = lineas.data ?? []
  const comprados = listaLineas.filter((l) => l.purchased)
  const totalCompradoCentimos = sumarCentimos(comprados.map((l) => eurosACentimos(l.price)))
  const totalCompraCentimos = eurosACentimos(breakdown.data.total)

  const costeDiaCentimos = eurosACentimos(breakdown.data.cost_per_day)
  const semanal = centimosAEur(costeDiaCentimos * 7)
  const quincenal = centimosAEur(costeDiaCentimos * 14)
  const mensual = centimosAEur(costeDiaCentimos * 30)

  function onDuplicar() {
    duplicar.mutate(id, { onSuccess: (nueva) => navigate(`/compra/compras/${nueva.id}`) })
  }

  function onEliminar() {
    if (!compra.data) return
    eliminar.mutate(
      { id, household: compra.data.household },
      { onSuccess: () => navigate('/compra/compras') },
    )
  }

  return (
    <div className="animate-rise space-y-5">
      <div className="space-y-3">
        <Link
          to="/compra/compras"
          className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Volver a compras
        </Link>

        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/compra/compras/${id}/editar`)}>
            <Pencil size={16} aria-hidden="true" />
            Editar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onDuplicar}
            disabled={duplicar.isPending}
            aria-label="Repetir esta compra"
          >
            <Copy size={16} aria-hidden="true" />
            {duplicar.isPending ? 'Repitiendo...' : 'Repetir'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmarBorrado(true)} disabled={eliminar.isPending}>
            <Trash2 size={16} aria-hidden="true" />
            Eliminar
          </Button>
        </div>

        {duplicar.isError ? <p className="text-sm text-danger">No se pudo repetir la compra.</p> : null}
        {eliminar.isError ? <p className="text-sm text-danger">No se pudo eliminar la compra.</p> : null}
      </div>

      <Card>
        <p className="font-display text-2xl text-fg">{compra.data.description}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
          <span className="flex items-center gap-1">
            <CalendarDays size={14} aria-hidden="true" />
            {shortDate(compra.data.date)}
          </span>
          <span className="flex items-center gap-1">
            <Store size={14} aria-hidden="true" />
            {compra.data.supermarket}
          </span>
          <span>{compra.data.covers_days} días</span>
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Comprado" value={`${comprados.length} de ${listaLineas.length}`} accent="primary" />
        <StatCard label="Total" value={eur(breakdown.data.total)} accent="violet" />
      </div>
      <Card className="flex items-center justify-between">
        <span className="text-sm text-fg-muted">Comprado vs total</span>
        <span className="tnum text-sm font-medium text-fg">
          {centimosAEur(totalCompradoCentimos)} de {centimosAEur(totalCompraCentimos)}
        </span>
      </Card>

      <div>
        <SectionLabel>Líneas</SectionLabel>
        <ul className="space-y-2">
          {listaLineas.map((linea) => {
            const marcado = linea.purchased
            const precioPorUnidad = precioPorUnidadTexto(linea.price, linea.amount, linea.unit)
            return (
              <li key={linea.id}>
                <Card className={`flex items-center gap-3 transition-opacity duration-150 ${marcado ? 'opacity-60' : ''}`}>
                  <Casilla
                    marcado={marcado}
                    ariaLabel={`Marcar ${linea.name} como comprado`}
                    onToggle={() => onToggleComprado(linea)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-fg ${marcado ? 'line-through' : ''}`}>{linea.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                      <span>
                        {linea.amount} {linea.unit}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          linea.is_shared ? 'bg-accent/15 text-accent' : 'bg-violet/15 text-violet'
                        }`}
                      >
                        {linea.is_shared ? (
                          <Users size={12} aria-hidden="true" />
                        ) : (
                          <User size={12} aria-hidden="true" />
                        )}
                        {linea.is_shared ? 'Compartido' : (nombrePorMiembro.get(linea.member ?? -1) ?? 'Individual')}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum font-medium text-fg">{eur(linea.price)}</p>
                    {precioPorUnidad ? <p className="tnum mt-0.5 text-xs text-fg-subtle">{precioPorUnidad}</p> : null}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-fg-subtle">
          Para añadir, editar o quitar líneas, usa "Editar" arriba.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Coste por día" value={eur(breakdown.data.cost_per_day)} accent="violet" />
        <StatCard label="Líneas" value={String(listaLineas.length)} accent="violet" />
      </div>

      <Card>
        <SectionLabel>Coste por persona</SectionLabel>
        <ul className="space-y-2">
          {breakdown.data.cost_per_person.map((p) => (
            <li key={p.member} className="flex items-center justify-between text-sm">
              <span className="text-fg">
                {p.name} <span className="text-fg-subtle">({num(p.share)}%)</span>
              </span>
              <span className="text-right">
                <span className="tnum block font-medium text-fg">{eur(p.amount)}</span>
                {/* La cifra que de verdad sirve para decidir: lo que cuesta al dia a cada persona */}
                <span className="tnum block text-xs text-fg-muted">
                  {centimosAEur(
                    costeDiarioPorPersona(eurosACentimos(p.amount), compra.data.covers_days),
                  )}
                  {' al día'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionLabel>Proyección de este ritmo de gasto</SectionLabel>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-fg-muted">Semanal</p>
            <p className="tnum mt-1 font-display text-xl text-fg">{semanal}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-fg-muted">Quincenal</p>
            <p className="tnum mt-1 font-display text-xl text-fg">{quincenal}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-fg-muted">Mensual</p>
            <p className="tnum mt-1 font-display text-xl text-fg">{mensual}</p>
          </div>
        </div>
      </Card>

      <ConfirmModal
        open={confirmarBorrado}
        onClose={() => setConfirmarBorrado(false)}
        onConfirm={onEliminar}
        title="Eliminar compra"
        description="Se borrarán también todas sus líneas. Esta acción no se puede deshacer."
      />
    </div>
  )
}
