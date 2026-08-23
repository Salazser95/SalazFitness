import { NavLink, Route, Routes } from 'react-router-dom'

import { PageTitle } from '../../components/ui'
import DiarioPage from './DiarioPage'
import BuscarPage from './BuscarPage'
import PlanPage from './PlanPage'

const PESTANAS = [
  { to: '/nutricion', label: 'Diario', fin: true },
  { to: '/nutricion/buscar', label: 'Buscar', fin: false },
  { to: '/nutricion/plan', label: 'Objetivos', fin: false },
] as const

function Pestanas() {
  return (
    <nav
      aria-label="Secciones de nutricion"
      className="mb-5 flex gap-1 overflow-x-auto rounded-[14px] border border-border bg-surface p-1"
    >
      {PESTANAS.map((p) => (
        <NavLink
          key={p.to}
          to={p.to}
          end={p.fin}
          className={({ isActive }) =>
            [
              'flex-1 whitespace-nowrap rounded-[10px] px-3 py-2 text-center text-sm font-medium transition-colors duration-150',
              isActive ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg',
            ].join(' ')
          }
        >
          {p.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function NutricionPage() {
  return (
    <>
      <PageTitle>Nutricion</PageTitle>
      <Pestanas />
      <Routes>
        <Route index element={<DiarioPage />} />
        <Route path="buscar" element={<BuscarPage />} />
        <Route path="plan" element={<PlanPage />} />
      </Routes>
    </>
  )
}
