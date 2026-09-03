import { TrendingDown, TrendingUp, Undo2, X } from 'lucide-react'
import { createPortal } from 'react-dom'

import { urlApi } from '../../lib/config'
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'

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

// ------------------------------------------------------------------- Pill

type Tono = 'neutral' | 'primary' | 'accent' | 'violet' | 'success' | 'warning' | 'danger'

const pillTonos: Record<Tono, string> = {
  neutral: 'text-fg-muted',
  primary: 'text-primary',
  accent: 'text-accent',
  violet: 'text-violet',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

/**
 * Insignia pequeña con icono opcional, para todo lo que sea informacion
 * secundaria junto a un numero protagonista (ver HeroStat). Antes cada
 * pantalla reinventaba esta misma fila a mano (SesionPage, EstadoCompra,
 * RutinasListaPage, DayNavigator...); esto es el sitio unico.
 */
export function Pill({
  icon: Icon,
  tone = 'neutral',
  children,
  className = '',
}: {
  icon?: LucideIcon
  tone?: Tono
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-xs font-medium ${pillTonos[tone]} ${className}`}
    >
      {Icon ? <Icon size={13} aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

// --------------------------------------------------------------- HeroStat

const heroAccents: Record<'primary' | 'accent' | 'violet' | 'fg', string> = {
  primary: 'text-primary',
  accent: 'text-accent',
  violet: 'text-violet',
  fg: 'text-fg',
}

/**
 * El numero protagonista de una pantalla (duracion, peso, gasto del mes...).
 * A proposito NO envuelve en Card: quien lo usa lo compone dentro de su
 * propia Card junto a pills, barras o un grafico (ver RutinasListaPage,
 * ResumenPage, YoPage, DiarioPage).
 */
export function HeroStat({
  label,
  value,
  unit,
  sub,
  accent = 'primary',
  className = '',
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  accent?: 'primary' | 'accent' | 'violet' | 'fg'
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</p>
      <p className={`font-display text-5xl leading-none tnum lg:text-6xl ${heroAccents[accent]}`}>
        {value}
        {unit ? <span className="ml-1 text-2xl text-fg-muted">{unit}</span> : null}
      </p>
      {sub ? <div className="mt-2">{sub}</div> : null}
    </div>
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
// -------------------------------------------------------- comportamiento comun

// Que se considera "enfocable" para el atrapado de foco (Tab/Shift+Tab) de
// cualquier superposicion modal.
const SELECTOR_ENFOCABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Comportamiento compartido de cualquier superposicion modal: atrapa el foco
 * dentro mientras esta abierta (Tab no se escapa al fondo de la pagina),
 * cierra con Escape, y al cerrar devuelve el foco a quien la abrio (el boton
 * de la papelera, el "+"...), que es lo que se espera de un dialogo
 * accesible y lo que pide un lector de pantalla para no perderse.
 */
function useComportamientoModal(
  abierto: boolean,
  onClose: () => void,
  contenedorRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!abierto) return
    const disparador = document.activeElement as HTMLElement | null

    // Foco inicial al primer elemento enfocable del dialogo. Con
    // requestAnimationFrame porque el contenido (children) puede no estar
    // pintado todavia en el primer efecto tras abrir.
    const marco = requestAnimationFrame(() => {
      const contenedor = contenedorRef.current
      const primero = contenedor?.querySelector<HTMLElement>(SELECTOR_ENFOCABLE)
      ;(primero ?? contenedor)?.focus()
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const contenedor = contenedorRef.current
      if (!contenedor) return
      const enfocables = Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE))
      if (enfocables.length === 0) return
      const primero = enfocables[0]!
      const ultimo = enfocables[enfocables.length - 1]!
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(marco)
      document.removeEventListener('keydown', onKeyDown)
      disparador?.focus?.()
    }
  }, [abierto, onClose, contenedorRef])
}

// Contador a nivel de modulo: si por lo que sea hay dos superposiciones
// abiertas a la vez, la segunda no debe deshacer el bloqueo que puso la
// primera al cerrarse ella antes. Solo se libera el scroll cuando ya no
// queda ninguna abierta.
let bloqueosDeScrollActivos = 0
let scrollGuardado = 0

/**
 * Bloquea el scroll del fondo mientras una superposicion esta abierta.
 *
 * `overflow: hidden` en el body NO basta en iOS Safari: el fondo se sigue
 * pudiendo arrastrar, y el "rebote" del scroll (bounce) puede desplazar los
 * propios elementos `fixed` de la pagina (la barra de navegacion inferior,
 * el propio modal). El patron que si funciona: fijar el body en su sitio
 * con `position: fixed` y un `top` negativo igual al scroll que tenia, y
 * deshacerlo devolviendo el scroll a su sitio al cerrar.
 */
function useBloqueoDeScroll(activo: boolean) {
  useEffect(() => {
    if (!activo) return
    bloqueosDeScrollActivos += 1
    if (bloqueosDeScrollActivos === 1) {
      scrollGuardado = window.scrollY
      const estilo = document.body.style
      estilo.position = 'fixed'
      estilo.top = `-${scrollGuardado}px`
      estilo.left = '0'
      estilo.right = '0'
      estilo.overflow = 'hidden'
    }
    return () => {
      bloqueosDeScrollActivos -= 1
      if (bloqueosDeScrollActivos === 0) {
        const estilo = document.body.style
        estilo.position = ''
        estilo.top = ''
        estilo.left = ''
        estilo.right = ''
        estilo.overflow = ''
        window.scrollTo(0, scrollGuardado)
      }
    }
  }, [activo])
}

/**
 * El fondo oscuro y el centrado que comparten Modal y el lightbox de
 * Thumbnail. Aqui vive todo lo delicado de iOS Safari (ver la nota de
 * `.superposicion-modal` en theme.css) y lo de accesibilidad (foco, Escape,
 * bloqueo de scroll): los dos consumidores solo aportan su propia tarjeta.
 *
 * Se renderiza con un portal a `document.body` a proposito: si el modal
 * viviera dentro del arbol normal de la pagina, un antepasado con su propio
 * `transform`, `filter` o `contain` (la app usa `backdrop-filter` en `.glass`,
 * por ejemplo) crearia un nuevo contexto de apilamiento y un nuevo bloque
 * de referencia para `position: fixed`, y el modal dejaria de posicionarse
 * contra la ventana de verdad. El portal lo evita de raiz.
 */
/**
 * `abajo` es para hojas que suben desde el borde inferior (ver HojaAlimento
 * en BuscarPage.tsx): sin el relleno de `superposicion-modal` (que separa
 * de los cuatro bordes, pensado para un dialogo centrado) y con la propia
 * hoja pegada abajo del todo, pero conservando el resto de la pila: portal,
 * bloqueo de scroll y foco/Escape, que es lo que de verdad evita que un
 * antepasado con `transform`/`filter` (o el scroll del fondo) descoloque la
 * hoja mientras esta abierta.
 */
export function Superposicion({
  abierto,
  onClose,
  etiqueta,
  children,
  alineacion = 'centro',
}: {
  abierto: boolean
  onClose: () => void
  etiqueta?: string
  children: ReactNode
  alineacion?: 'centro' | 'abajo'
}) {
  const contenedorRef = useRef<HTMLDivElement>(null)
  useComportamientoModal(abierto, onClose, contenedorRef)
  useBloqueoDeScroll(abierto)

  if (!abierto) return null

  const claseAlineacion =
    alineacion === 'abajo' ? 'superposicion-abajo items-end' : 'superposicion-modal items-center'

  return createPortal(
    <div
      // z-[100]: por encima de la barra de navegacion inferior fija de
      // App.tsx (z-50). Sin esto, en iOS un modal que ya cayera detras de
      // esa barra por el problema del viewport ademas quedaria por debajo
      // suyo en la pila: doble motivo para no verse.
      className={`fixed inset-0 z-[100] flex justify-center bg-black/70 ${claseAlineacion}`}
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
      onClick={onClose}
    >
      <div ref={contenedorRef} onClick={(e) => e.stopPropagation()} className="contents">
        {children}
      </div>
    </div>,
    document.body,
  )
}

// -------------------------------------------------------------------- Modal

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className = '',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /**
   * Fila de acciones que se queda siempre visible, fuera del area que hace
   * scroll (la usa ConfirmModal). Los demas modales, con formularios mas
   * largos, siguen con sus botones dentro de `children`: una vez el
   * dialogo entero cabe de verdad en la pantalla (que es lo que arregla
   * Superposicion), llegar a ellos con scroll es el comportamiento normal
   * de cualquier formulario largo, dentro o fuera de un modal.
   */
  footer?: ReactNode
  className?: string
}) {
  return (
    <Superposicion abierto={open} onClose={onClose} etiqueta={title}>
      <div
        className={`flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-[20px] border border-border bg-surface p-5 ${className}`}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
          {title ? <h2 className="font-display text-xl text-fg">{title}</h2> : <span />}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {/* min-h-0: sin esto, un hijo flex no encoge por debajo de su
            contenido y overflow-y-auto no llega a activarse nunca. Es el
            motivo mas comun de que un "scroll interno" en flexbox no haga
            nada. */}
        <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="mt-5 shrink-0">{footer}</div> : null}
      </div>
    </Superposicion>
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
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
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
      }
    >
      {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
    </Modal>
  )
}

// ----------------------------------------------------------------- UndoBar

/**
 * Aviso flotante tras un borrado sin confirmar, con un boton para
 * deshacerlo. Portal a document.body (mismo motivo que Modal): que ningun
 * ancestro con transform/filter lo encajone o lo tape.
 */
export function UndoBar({
  visible,
  etiqueta,
  onDeshacer,
  deshaciendo,
}: {
  visible: boolean
  etiqueta: string | null
  onDeshacer: () => void
  deshaciendo: boolean
}) {
  if (!visible || !etiqueta) return null
  return createPortal(
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-full border border-border bg-surface-3 px-4 py-2.5 shadow-lg lg:bottom-6"
    >
      <span className="min-w-0 truncate text-sm text-fg">{etiqueta}</span>
      <button
        type="button"
        onClick={onDeshacer}
        disabled={deshaciendo}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-primary-dim disabled:opacity-50"
      >
        <Undo2 size={15} aria-hidden="true" />
        {deshaciendo ? 'Deshaciendo...' : 'Deshacer'}
      </button>
    </div>,
    document.body,
  )
}

// --------------------------------------------------------------- Lightbox

// Miniatura que ocupa su sitio normal en el layout. Solo se ve a tamano
// completo si el usuario la pulsa: nunca se maximiza sola.
//
// El lightbox reutiliza Superposicion en vez de un <dialog> nativo (que
// tenia esta pantalla antes): el centrado de <dialog> lo decide la hoja de
// estilos del propio navegador con el mismo mecanismo (position: fixed +
// inset) que provoca el problema de viewport en iOS Safari, y no hay forma
// de comprobar aqui, sin un dispositivo o un simulador WebKit a mano, que
// una version concreta de Safari lo tenga arreglado. Con Superposicion se
// prueba una sola vez y sirve para los dos casos.
export function Thumbnail({
  src,
  alt,
  className = 'aspect-square',
}: {
  src: string
  alt: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  // Django devuelve la foto como ruta relativa (/media/...) cuando la sirve un
  // nginx por delante. En el navegador eso funciona; en el APK y en la app de
  // iPhone hay que ponerle delante el servidor, igual que a la API.
  const url = urlApi(src)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
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

      <Superposicion abierto={abierto} onClose={() => setAbierto(false)} etiqueta={alt}>
        <div className="relative max-h-full max-w-full overflow-hidden rounded-[20px] border border-border bg-surface">
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar"
            className="glass absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <img
            src={url}
            alt={alt}
            className="block max-h-[calc(100dvh-2rem)] max-w-[92vw] object-contain"
          />
        </div>
      </Superposicion>
    </>
  )
}
