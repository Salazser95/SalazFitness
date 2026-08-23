import { NavLink, Route, Routes } from 'react-router-dom'

import { PageTitle } from '../../components/ui'
import ResumenPage from './ResumenPage'
import ComprasPage from './ComprasPage'
import CompraFormulario from './CompraFormulario'
import CompraDetalle from './CompraDetalle'
import ListaPage from './ListaPage'
import RecetasPage from './RecetasPage'
import RecetaDetalle from './RecetaDetalle'
import HogarPage from './HogarPage'

const PESTANAS = [
  { to: '/compra', label: 'Resumen', fin: true },
  { to: '/compra/compras', label: 'Compras', fin: false },
  { to: '/compra/lista', label: 'Lista', fin: false },
  { to: '/compra/recetas', label: 'Recetas', fin: false },
  { to: '/compra/hogar', label: 'Hogar', fin: false },
] as const

function Pestanas() {
  return (
    <nav
      aria-label="Secciones de compra"
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
              isActive ? 'bg-violet/15 text-violet' : 'text-fg-muted hover:text-fg',
            ].join(' ')
          }
        >
          {p.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function CompraPage() {
  return (
    <>
      <PageTitle>Compra</PageTitle>
      <Pestanas />
      <Routes>
        <Route path="/" element={<ResumenPage />} />
        <Route path="/compras" element={<ComprasPage />} />
        <Route path="/compras/nueva" element={<CompraFormulario />} />
        <Route path="/compras/:id" element={<CompraDetalle />} />
        <Route path="/lista" element={<ListaPage />} />
        <Route path="/recetas" element={<RecetasPage />} />
        <Route path="/recetas/:id" element={<RecetaDetalle />} />
        <Route path="/hogar" element={<HogarPage />} />
      </Routes>
    </>
  )
}
