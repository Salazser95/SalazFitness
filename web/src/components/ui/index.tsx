import { TrendingDown, TrendingUp, X } from 'lucide-react'

import { urlApi } from '../../lib/config'
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useEffect, useRef } from 'react'

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

// ------------------------------------------------------------------ Modal

// Overlay generico: confirmaciones, formularios cortos, o el Lightbox de abajo.
// Atrapa Escape para cerrar y bloquea el scroll del fondo mientras esta abierto.
export function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full max-w-lg overflow-auto rounded-[20px] border border-border bg-surface p-5 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="font-display text-xl text-fg">{title}</h2> : <span />}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Eliminar',
  danger = true,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

// --------------------------------------------------------------- Lightbox

// Miniatura que ocupa su sitio normal en el layout. Solo se ve a tamano
// completo si el usuario la pulsa: nunca se maximiza sola.
export function Thumbnail({
  src,
  alt,
  className = 'aspect-square',
}: {
  src: string
  alt: string
  className?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Django devuelve la foto como ruta relativa (/media/...) cuando la sirve un
  // nginx por delante. En el navegador eso funciona; en el APK y en la app de
  // iPhone hay que ponerle delante el servidor, igual que a la API.
  const url = urlApi(src)

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={`group relative block w-full overflow-hidden rounded-[14px] border border-border bg-surface-2 ${className}`}
        aria-label={`Ampliar: ${alt}`}
      >
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </button>

      {/* <dialog> nativo: foco atrapado y Escape para cerrar sin JS extra */}
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close()
        }}
        className="m-auto max-h-[90vh] max-w-[92vw] overflow-hidden rounded-[20px] border border-border bg-surface p-0 backdrop:bg-black/80"
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Cerrar"
            className="glass absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <img src={url} alt={alt} className="block max-h-[90vh] max-w-[92vw] object-contain" />
        </div>
      </dialog>
    </>
  )
}
