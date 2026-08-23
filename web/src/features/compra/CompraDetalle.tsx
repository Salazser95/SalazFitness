import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Store, User, Users } from 'lucide-react'

import { Card, ErrorState, SectionLabel, SkeletonList, StatCard } from '../../components/ui'
import { eur, num, shortDate } from '../../lib/format'
import { centimosAEur, costeDiarioPorPersona, eurosACentimos } from './calculo'
import { usePurchase, usePurchaseBreakdown, usePurchaseItems } from './datos'

export default function CompraDetalle() {
  const { id: idParam } = useParams<{ id: string }>()
  const id = Number(idParam) || 0

  const compra = usePurchase(id)
  const lineas = usePurchaseItems(id)
  const breakdown = usePurchaseBreakdown(id)

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

  const costeDiaCentimos = eurosACentimos(breakdown.data.cost_per_day)
  const semanal = centimosAEur(costeDiaCentimos * 7)
  const quincenal = centimosAEur(costeDiaCentimos * 14)
  const mensual = centimosAEur(costeDiaCentimos * 30)

  return (
    <div className="animate-rise space-y-5">
      <Link
        to="/compra/compras"
        className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a compras
      </Link>

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
          <span>{compra.data.covers_days} dias</span>
        </p>
      </Card>

      <div>
        <SectionLabel>Lineas</SectionLabel>
        <ul className="space-y-2">
          {(lineas.data ?? []).map((linea) => (
            <li key={linea.id}>
              <Card className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-fg">{linea.name}</p>
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
                <p className="tnum shrink-0 font-medium text-fg">{eur(linea.price)}</p>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total" value={eur(breakdown.data.total)} accent="violet" />
        <StatCard label="Coste por dia" value={eur(breakdown.data.cost_per_day)} accent="violet" />
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
                  {' al dia'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionLabel>Proyeccion de este ritmo de gasto</SectionLabel>
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
    </div>
  )
}
