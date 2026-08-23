import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Plus, ShoppingBag, Store } from 'lucide-react'

import { Button, Card, EmptyState, ErrorState, SectionLabel, SkeletonList } from '../../components/ui'
import { eur, shortDate } from '../../lib/format'
import { usePurchasesConTotal, useHousehold } from './datos'

export default function ComprasPage() {
  const navigate = useNavigate()
  const household = useHousehold()
  const householdId = household.data?.id ?? 0
  const compras = usePurchasesConTotal(householdId)

  return (
    <div className="animate-rise space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Historial de compras</SectionLabel>
        <Button size="sm" onClick={() => navigate('/compra/compras/nueva')}>
          <Plus size={16} aria-hidden="true" />
          Nueva compra
        </Button>
      </div>

      {household.isLoading || compras.isLoading ? (
        <SkeletonList rows={4} height="h-20" />
      ) : household.isError || compras.isError ? (
        <ErrorState onRetry={() => compras.refetch()} />
      ) : (compras.data ?? []).length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Sin compras todavia"
          description="Registra tu primera compra para ver el desglose de coste."
          action={{ label: 'Nueva compra', onClick: () => navigate('/compra/compras/nueva') }}
        />
      ) : (
        <ul className="space-y-3">
          {(compras.data ?? []).map(({ compra, totalCentimos }) => (
            <li key={compra.id}>
              <Link to={`/compra/compras/${compra.id}`}>
                <Card className="transition-colors hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg text-fg">{compra.description}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
                        <span className="flex items-center gap-1">
                          <CalendarDays size={14} aria-hidden="true" />
                          {shortDate(compra.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Store size={14} aria-hidden="true" />
                          {compra.supermarket}
                        </span>
                        <span>{compra.covers_days} dias</span>
                      </p>
                    </div>
                    <p className="tnum shrink-0 font-display text-2xl text-violet">{eur(totalCentimos / 100)}</p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
