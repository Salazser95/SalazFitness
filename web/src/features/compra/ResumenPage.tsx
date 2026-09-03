import { useMemo } from 'react'
import { CalendarDays, Users } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, ErrorState, HeroStat, Pill, SectionLabel, SkeletonList } from '../../components/ui'
import { eur } from '../../lib/format'
import { costeDiarioPorPersona, eurosACentimos } from './calculo'
import { useCosteMedioPorComida, useGastoSemanal, useHousehold, useHouseholdSummary } from './datos'

// Paleta oficial de graficas, en este orden fijo (ver docs/DESIGN-SYSTEM.md
// "Colores de graficas"). Es la unica excepcion documentada al "nunca hex
// suelto": Recharts pinta en SVG y necesita el valor resuelto, no la
// variable CSS.
const COLORES_GRAFICA = ['#C6F135', '#22D3EE', '#A78BFA', '#FBBF24', '#F87171', '#34D399']

const DIAS_VENTANA = 30

function formatSemana(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export default function ResumenPage() {
  const household = useHousehold()
  const householdId = household.data?.id ?? 0
  const resumen = useHouseholdSummary(householdId, DIAS_VENTANA)
  const semanal = useGastoSemanal(householdId)
  const costeComida = useCosteMedioPorComida(householdId)

  const numPersonas = household.data?.members.length ?? 0

  const cargando = household.isLoading || resumen.isLoading
  const error = household.isError || resumen.isError

  const costePorPersonaCentimos = useMemo(() => {
    if (!resumen.data || numPersonas === 0) return 0
    return eurosACentimos(resumen.data.total) / numPersonas
  }, [resumen.data, numPersonas])

  const datosBarras = useMemo(
    () =>
      (semanal.data ?? []).map((s) => ({
        semana: formatSemana(s.semana),
        total: s.totalCentimos / 100,
      })),
    [semanal.data],
  )

  const datosTarta = useMemo(() => {
    if (!resumen.data) return []
    const totalCentimos = eurosACentimos(resumen.data.total)
    return resumen.data.per_person.map((p) => {
      const centimos = eurosACentimos(p.amount)
      return {
        name: p.name,
        value: centimos / 100,
        porcentaje: totalCentimos > 0 ? Math.round((centimos / totalCentimos) * 1000) / 10 : 0,
      }
    })
  }, [resumen.data])

  if (cargando) {
    return (
      <div className="space-y-5">
        <SkeletonList rows={1} height="h-40" />
        <SkeletonList rows={1} height="h-24" />
        <SkeletonList rows={2} height="h-64" />
      </div>
    )
  }
  if (error || !resumen.data) return <ErrorState onRetry={() => resumen.refetch()} />

  const ultimaSemana = datosBarras.at(-1)

  return (
    <div className="animate-rise space-y-5">
      <Card className="p-5">
        <HeroStat
          label={`Gasto · últimos ${DIAS_VENTANA} días`}
          value={eur(resumen.data.total)}
          accent="violet"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill icon={Users}>{numPersonas} personas</Pill>
          <Pill icon={CalendarDays}>{eur(resumen.data.daily)} / día</Pill>
          <Pill>{eur(resumen.data.weekly)} / semana</Pill>
        </div>
      </Card>

      <Card className="p-0">
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="px-3 py-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Por persona
            </p>
            <p className="mt-1 font-display text-2xl tnum text-fg lg:text-3xl">
              {eur(costePorPersonaCentimos / 100)}
            </p>
          </div>
          <div className="px-3 py-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Al día / persona
            </p>
            <p className="mt-1 font-display text-2xl tnum text-fg lg:text-3xl">
              {eur(costeDiarioPorPersona(costePorPersonaCentimos, DIAS_VENTANA) / 100)}
            </p>
          </div>
          <div className="px-3 py-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Por comida
            </p>
            <p className="mt-1 font-display text-2xl tnum text-fg lg:text-3xl">
              {costeComida.data ? eur(costeComida.data / 100) : eur(0)}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Evolución del gasto por semana</SectionLabel>
          {ultimaSemana ? (
            <span className="tnum text-sm text-fg-muted">
              Última semana: {eur(ultimaSemana.total)}
            </span>
          ) : null}
        </div>
        {datosBarras.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">Todavía no hay compras suficientes.</p>
        ) : (
          <div className="h-56 w-full lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosBarras} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="semana"
                  tick={{ fill: 'var(--color-fg-subtle)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--color-fg-subtle)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v: number) => eur(v).replace(/,00\s?€/, '€')}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-surface-3)' }}
                  contentStyle={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    fontSize: 13,
                  }}
                  formatter={(v) => [eur(Number(v)), 'Gasto']}
                />
                <Bar dataKey="total" fill={COLORES_GRAFICA[2]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>Reparto por persona (últimos {DIAS_VENTANA} días)</SectionLabel>
        {datosTarta.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">Todavía no hay gasto que repartir.</p>
        ) : (
          <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-center lg:gap-6">
            <div className="relative mx-auto h-48 w-48 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={datosTarta} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {datosTarta.map((_, i) => (
                      <Cell key={i} fill={COLORES_GRAFICA[i % COLORES_GRAFICA.length]} stroke="var(--color-surface)" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      fontSize: 13,
                    }}
                    formatter={(v) => [eur(Number(v)), 'Gasto']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-display text-2xl tnum leading-none text-fg">{eur(resumen.data.total)}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-fg-muted">total</p>
              </div>
            </div>
            <ul className="mt-4 w-full space-y-2.5 lg:mt-0">
              {datosTarta.map((d, i) => (
                <li key={d.name} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-fg">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: COLORES_GRAFICA[i % COLORES_GRAFICA.length] }}
                        aria-hidden="true"
                      />
                      {d.name}
                    </span>
                    <span className="tnum text-fg-muted">
                      {eur(d.value)} · {d.porcentaje.toLocaleString('es-ES')}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${d.porcentaje}%`,
                        background: COLORES_GRAFICA[i % COLORES_GRAFICA.length],
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  )
}
