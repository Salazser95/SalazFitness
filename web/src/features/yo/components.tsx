import type { ReactNode, SelectHTMLAttributes } from 'react'

/**
 * Piezas de UI propias de "Yo" que no existen en components/ui/index.tsx
 * (ese fichero es de solo lectura para este feature). Siguen el mismo
 * lenguaje visual: radios, colores y tipografia del sistema de diseno.
 */

// ------------------------------------------------------------- SelectField

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hint?: ReactNode
}

const selectClass =
  'h-12 w-full rounded-[14px] border border-border bg-surface-2 px-4 text-fg ' +
  'transition-colors focus:border-primary'

export function SelectField({
  label,
  hint,
  id,
  className = '',
  children,
  ...rest
}: SelectFieldProps) {
  const selectId = id ?? `s-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className={className}>
      <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-fg-muted">
        {label}
      </label>
      <select id={selectId} className={selectClass} {...rest}>
        {children}
      </select>
      {hint ? <p className="mt-1.5 text-sm text-fg-subtle">{hint}</p> : null}
    </div>
  )
}

// ------------------------------------------------------------------ Tabs

export type TabId = 'perfil' | 'progreso' | 'medidas'

const TABS: { id: TabId; label: string }[] = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'progreso', label: 'Progreso' },
  { id: 'medidas', label: 'Medidas' },
]

export function TabBar({ activa, onChange }: { activa: TabId; onChange: (t: TabId) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Secciones de Yo"
      className="mb-5 flex gap-2 rounded-[14px] border border-border bg-surface p-1"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          role="tab"
          type="button"
          aria-selected={activa === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className={`h-11 flex-1 rounded-[10px] text-sm font-semibold transition-colors duration-150 ${
            activa === t.id ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------ Progreso

/**
 * Barra de progreso hacia el objetivo. El relleno anima con `transform:
 * scaleX`, nunca con `width`, tal y como exige docs/DESIGN-SYSTEM.md.
 */
export function BarraProgreso({ porcentaje, etiqueta }: { porcentaje: number; etiqueta: string }) {
  const clamped = Math.max(0, Math.min(100, porcentaje))
  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={etiqueta}
        className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out"
          style={{ transform: `scaleX(${clamped / 100})` }}
        />
      </div>
      <p className="mt-1.5 text-sm text-fg-muted tnum">{etiqueta}</p>
    </div>
  )
}
