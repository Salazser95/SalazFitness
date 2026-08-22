import { TrendingDown, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

// ---------------------------------------------------------------- Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type Size = 'sm' | 'md' | 'lg'

const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-[14px] font-semibold ' +
  'transition-colors duration-150 select-none disabled:opacity-40 disabled:cursor-not-allowed'

const btnVariants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-dim glow-primary',
  accent: 'bg-accent text-on-accent hover:brightness-110',
  secondary: 'bg-surface-2 text-fg border border-border hover:bg-surface-3',
  ghost: 'bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
}

// Altura mínima de 48px en md y lg, para que el área táctil sea accesible.
const btnSizes: Record<Size, string> = {
  sm: 'h-10 px-3 text-sm',
  md: 'h-12 px-5 text-base',
  lg: 'h-14 px-6 text-lg',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  full?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ Card

export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  return (
    <Tag className={`rounded-[20px] border border-border bg-surface p-4 ${className}`}>
      {children}
    </Tag>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </p>
  )
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <h1 className="font-display text-3xl">{children}</h1>
      {right}
    </div>
  )
}

// -------------------------------------------------------------- StatCard

type StatProps = {
  label: string
  value: ReactNode
  unit?: string
  // Variación respecto al periodo anterior. Positivo sube, negativo baja.
  delta?: number | null
  // Para peso corporal en déficit bajar es bueno, así que invierte el color.
  invertDelta?: boolean
  accent?: 'primary' | 'accent' | 'violet'
}

const statAccents = {
  primary: 'text-primary',
  accent: 'text-accent',
  violet: 'text-violet',
}

export function StatCard({
  label,
  value,
  unit,
  delta = null,
  invertDelta = false,
  accent = 'primary',
}: StatProps) {
  const up = delta !== null && delta > 0
  const good = invertDelta ? !up : up
  const Icon = up ? TrendingUp : TrendingDown

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</p>
      <p className={`mt-1 font-display text-5xl leading-none tnum ${statAccents[accent]}`}>
        {value}
        {unit ? <span className="ml-1 text-2xl text-fg-muted">{unit}</span> : null}
      </p>
      {delta !== null && delta !== 0 ? (
        <p
          className={`mt-2 flex items-center gap-1 text-sm tnum ${good ? 'text-success' : 'text-danger'}`}
        >
          <Icon size={16} aria-hidden="true" />
          {up ? '+' : ''}
          {delta}
        </p>
      ) : null}
    </Card>
  )
}

// ----------------------------------------------------------------- Field

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  error?: string | null
}

const inputClass =
  'h-12 w-full rounded-[14px] border border-border bg-surface-2 px-4 text-fg ' +
  'placeholder:text-fg-subtle transition-colors focus:border-primary tnum'

export function Field({ label, hint, error, id, className = '', ...rest }: FieldProps) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className={className}>
      {/* La etiqueta siempre visible: nunca usar solo el placeholder */}
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-fg-muted">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
        className={`${inputClass} ${error ? 'border-danger' : ''}`}
        {...rest}
      />
      {/* El error va pegado al campo, no al principio del formulario */}
      {error ? (
        <p id={`${inputId}-err`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- Estados

// Esqueleto del mismo tamaño que el contenido real, para no provocar saltos.
export function Skeleton({ className = 'h-20' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function SkeletonList({ rows = 3, height = 'h-20' }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={height} />
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border px-6 py-12 text-center">
      <Icon size={32} className="text-fg-subtle" aria-hidden="true" />
      <p className="mt-3 font-display text-xl text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-xs text-sm text-fg-muted">{description}</p> : null}
      {action ? (
        <Button className="mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[20px] border border-danger/30 bg-danger/10 p-4">
      <p className="text-sm text-danger">{message ?? 'Algo ha fallado al cargar los datos.'}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}
