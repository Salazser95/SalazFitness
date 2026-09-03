/**
 * Ticket: foto + transcripcion de un ticket de compra -> analisis -> revision
 * -> confirmacion. Al confirmar, el backend crea una Purchase real que ya
 * alimenta Compras, Despensa, Resumen y Hogar (ver useConfirmarTicket en
 * datos.ts) -- esta pantalla solo orquesta esos tres pasos, no vuelve a
 * calcular nada de compra por su cuenta.
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileWarning,
  Paperclip,
  Receipt as ReceiptIcon,
  RotateCcw,
  ScanLine,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { Button, Card, ConfirmModal, EmptyState, ErrorState, SectionLabel, SkeletonList, Thumbnail } from '../../components/ui'
import { mensajeDeError } from '../../lib/api'
import { eur, shortDate } from '../../lib/format'
import {
  useAnalizarTicket,
  useConfirmarTicket,
  useEliminarTicket,
  useHousehold,
  useReceipt,
  useReceipts,
  useSubirTicket,
  useTranscribirTicket,
} from './datos'
import type { Receipt } from './tipos'

/**
 * Texto de `docs/tickets-prueba/mercadona-es.md`, tal cual, para que se
 * pueda probar el analisis sin escribir nada a mano.
 */
export const TICKET_EJEMPLO: string =
  "*** TICKET DE PRUEBA - DATOS FICTICIOS ***\n            MERCADONA, S.A.             \n             C/ EXEMPLE, 12             \n         00000 CIUDAD DE PRUEBA         \n          TELEFONO: 900000000           \n            NIF: X-00000000             \n----------------------------------------\n19/08/2026 13:45     OP: 0000001\nFACTURA SIMPLIFICADA: 0000-000-000000\n----------------------------------------\n  Descripcion             P.Unit  Importe\n----------------------------------------\n2 LECHE ENTERA 1L           0,89     1,78\n1 PAN DE MOLDE                       1,45\n1 ACEITE OLIVA V.E.         7,80     7,80\n3 YOGUR NATURAL             0,45     1,35\n  PLATANO                            2,28\n    0,760 kg      3,00 EUR/kg\n  TOMATE RAMA                        1,74\n    0,580 kg      3,00 EUR/kg\n1 PECHUGA POLLO                      2,70\n    0,450 kg      6,00 EUR/kg\n----------------------------------------\n  TOTAL (EUR)                       19,10\n  TARJETA BANCARIA                  19,10\n----------------------------------------\nIVA         BASE     CUOTA\n4%          8,27      0,33\n10%         9,55      0,95\n----------------------------------------\n         GRACIAS POR SU VISITA          \n     (TICKET FICTICIO - NO VALIDO)      \n*** TICKET DE PRUEBA - DATOS FICTICIOS ***"

const ETIQUETA_UNIDAD: Record<string, string> = { unit: 'ud', kg: 'kg', g: 'g', l: 'l', ml: 'ml' }

function etiquetaUnidad(unit: string): string {
  return ETIQUETA_UNIDAD[unit] ?? unit
}

const ESTADO_ESTILO: Record<Receipt['status'], { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente de analizar', clase: 'border-border bg-surface-2 text-fg-muted' },
  analizado: { texto: 'Analizado', clase: 'border-accent/40 bg-accent/10 text-accent' },
  confirmado: { texto: 'Confirmado', clase: 'border-success/40 bg-success/10 text-success' },
  error: { texto: 'Con error', clase: 'border-danger/40 bg-danger/10 text-danger' },
}

function InsigniaEstado({ status }: { status: Receipt['status'] }) {
  const { texto, clase } = ESTADO_ESTILO[status]
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${clase}`}>
      {texto}
    </span>
  )
}

// ================================================================
// Paso 1 -- subir
// ================================================================

function SubirTicketCard({ householdId, onSubido }: { householdId: number; onSubido: (id: number) => void }) {
  const subir = useSubirTicket()
  const analizar = useAnalizarTicket()
  const [imagen, setImagen] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [markdown, setMarkdown] = useState('')
  const inputCamaraRef = useRef<HTMLInputElement>(null)
  const inputArchivoRef = useRef<HTMLInputElement>(null)

  // La miniatura es un blob local: hay que liberarlo al cambiar de foto o al
  // desmontar, o cada foto elegida se queda en memoria para siempre.
  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa)
    }
  }, [previa])

  function elegirImagen(file: File | null) {
    setPrevia((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior)
      return file ? URL.createObjectURL(file) : null
    })
    setImagen(file)
  }

  function onFotoElegida(e: ChangeEvent<HTMLInputElement>) {
    elegirImagen(e.target.files?.[0] ?? null)
    // Sin esto, volver a elegir el mismo fichero (por ejemplo tras quitarlo)
    // no dispara onChange la segunda vez, y parece que no ha pasado nada.
    e.target.value = ''
  }

  function subirTicket() {
    if (!householdId) return
    const texto = markdown.trim()
    subir.mutate(
      { household: householdId, image: imagen, markdown: texto || undefined },
      {
        onSuccess: (ticket) => {
          onSubido(ticket.id)
          elegirImagen(null)
          setMarkdown('')
          // Si ya hay texto en el momento de subir, se analiza de seguido:
          // no tiene sentido obligar a un segundo toque para el caso normal.
          // Si solo se subio la foto (sin texto todavia), el ticket se queda
          // 'pendiente' y se analiza mas tarde desde el panel de revision.
          if (texto) analizar.mutate({ id: ticket.id })
        },
      },
    )
  }

  return (
    <Card className="space-y-3">
      <SectionLabel>Subir ticket</SectionLabel>

      <div className="space-y-2">
        <p className="block text-sm font-medium text-fg-muted">Foto del ticket</p>

        {previa ? (
          <div className="relative">
            <Thumbnail src={previa} alt="Foto elegida del ticket" className="aspect-video" />
            <button
              type="button"
              onClick={() => elegirImagen(null)}
              aria-label="Quitar foto"
              className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-fg-muted shadow-sm transition-colors hover:bg-surface hover:text-danger"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => inputCamaraRef.current?.click()}
          >
            <Camera size={16} aria-hidden="true" />
            Hacer foto
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => inputArchivoRef.current?.click()}
          >
            <Paperclip size={16} aria-hidden="true" />
            Adjuntar archivo
          </Button>
        </div>
        {/* Dos inputs a proposito: uno fuerza la camara (capture), el otro
            abre el selector normal (galeria/archivos) sin restringirlo -- un
            input compartido con capture solo deja hacer fotos nuevas. */}
        <input
          ref={inputCamaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFotoElegida}
          className="hidden"
          aria-label="Hacer foto del ticket"
        />
        <input
          ref={inputArchivoRef}
          type="file"
          accept="image/*,.heic,.heif"
          onChange={onFotoElegida}
          className="hidden"
          aria-label="Adjuntar foto del ticket desde un archivo"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label className="block text-sm font-medium text-fg-muted" htmlFor="ticket-texto">
            Texto del ticket
          </label>
          <button
            type="button"
            onClick={() => setMarkdown(TICKET_EJEMPLO)}
            className="shrink-0 text-xs font-medium text-primary transition-colors hover:underline"
          >
            Usar ticket de ejemplo
          </button>
        </div>
        <textarea
          id="ticket-texto"
          rows={8}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          placeholder={'2 LECHE ENTERA 1L   0,89   1,78\n1 PAN DE MOLDE              1,45\n...'}
          className="w-full rounded-[14px] border border-border bg-surface-2 px-4 py-3 font-mono text-xs text-fg placeholder:text-fg-subtle transition-colors focus:border-primary"
        />
      </div>

      <p className="text-xs text-fg-subtle">
        Si subes una foto, el texto se transcribe solo en cuanto se suba (podrás revisarlo y corregirlo
        antes de analizar). También puedes escribirlo o pegarlo aquí tú mismo, línea por línea, tal y
        como aparece impreso. La foto siempre se guarda como justificante de la compra.
      </p>

      <Button full disabled={(!imagen && !markdown.trim()) || subir.isPending} onClick={subirTicket}>
        <Upload size={18} aria-hidden="true" />
        {subir.isPending ? 'Subiendo...' : 'Subir ticket'}
      </Button>
      {subir.isError ? (
        <p className="text-sm text-danger">{mensajeDeError(subir.error, 'No se pudo subir el ticket.')}</p>
      ) : null}
    </Card>
  )
}

// ================================================================
// Paso 2 y 3 -- revisar y confirmar
// ================================================================

/**
 * El detalle propiamente dicho, ya con el ticket cargado. Se remonta (ver
 * `key` en DetalleTicket, mas abajo) cada vez que cambia `updated_at`: es lo
 * que mantiene el textarea de abajo sembrado con el markdown del servidor
 * sin recurrir a un efecto que lo resincronice por detras mientras el
 * usuario escribe (el mismo problema que evita `empezarEdicion` en
 * DespensaPage.tsx, solo que aqui el "modo edicion" es la pantalla entera).
 */
function DetalleTicketCargado({ ticket, onEliminado }: { ticket: Receipt; onEliminado: () => void }) {
  const analizar = useAnalizarTicket()
  const confirmar = useConfirmarTicket()
  const eliminar = useEliminarTicket()
  const transcribir = useTranscribirTicket()
  const [markdown, setMarkdown] = useState(ticket.markdown)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  const lineas = ticket.parsed.lines ?? []
  const avisos = ticket.parsed.warnings ?? []

  // Un solo intento automatico por ticket recien subido: si llega con foto y
  // sin texto todavia, se transcribe sola. Un solo disparo aunque React monte
  // el efecto dos veces en modo estricto -- transcribir llama a Claude y
  // cuesta dinero de verdad, no es gratis reintentarlo solo. Este componente
  // se remonta con `key={ticket.updated_at}` (ver DetalleTicket mas abajo),
  // asi que cada intento de verdad nuevo (foto distinta, ticket distinto)
  // ya llega con un ref limpio sin necesidad de resincronizarlo a mano.
  const disparadoRef = useRef(false)
  useEffect(() => {
    if (disparadoRef.current) return
    if (ticket.status !== 'pendiente' || !ticket.image || ticket.markdown.trim()) return
    disparadoRef.current = true
    transcribir.mutate({ id: ticket.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onEliminarConfirmado() {
    eliminar.mutate({ id: ticket.id, household: ticket.household }, { onSuccess: onEliminado })
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <SectionLabel>Ticket seleccionado</SectionLabel>
          <InsigniaEstado status={ticket.status} />
        </div>
        <button
          type="button"
          aria-label="Eliminar ticket"
          onClick={() => setConfirmarBorrado(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-fg-subtle transition-colors hover:bg-surface-2 hover:text-danger"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>

      {ticket.image ? <Thumbnail src={ticket.image} alt="Foto del ticket" className="aspect-video" /> : null}

      {transcribir.isPending ? (
        <p className="flex items-center gap-2 rounded-[14px] border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
          <ScanLine size={16} className="shrink-0 animate-pulse" aria-hidden="true" />
          Transcribiendo el ticket...
        </p>
      ) : null}

      {transcribir.isError ? (
        <div className="space-y-2 rounded-[14px] border border-warning/30 bg-warning/10 p-3">
          <p className="flex items-start gap-2 text-sm text-warning">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {mensajeDeError(transcribir.error, 'No se pudo transcribir la foto automáticamente.')} Puedes
            escribir o pegar el texto abajo, o volver a intentarlo.
          </p>
          <Button variant="ghost" size="sm" onClick={() => transcribir.mutate({ id: ticket.id })}>
            <ScanLine size={16} aria-hidden="true" />
            Reintentar transcripción automática
          </Button>
        </div>
      ) : null}

      {/* Paso 3: confirmado -- ya no hay nada que revisar, solo el enlace a lo que se creo. */}
      {ticket.status === 'confirmado' ? (
        <div className="space-y-2 rounded-[14px] border border-success/30 bg-success/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 size={18} aria-hidden="true" />
            Ticket volcado en la compra
          </p>
          <p className="text-sm text-fg-muted">
            Se ha creado la compra a partir de este ticket, y ya se ha actualizado la Despensa (y la
            Lista, si alguna línea coincidía con lo comprado).
          </p>
          {ticket.purchase ? (
            <Link
              to={`/compra/compras/${ticket.purchase}`}
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              Ver la compra creada
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Ticket en error: el motivo, en rojo, y el texto se deja abajo para corregir. */}
      {ticket.status === 'error' ? (
        <p className="flex items-start gap-2 rounded-[14px] border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {ticket.error || 'No se pudo analizar el ticket.'}
        </p>
      ) : null}

      {/* Paso 2: analizado -- cabecera, lineas y avisos. */}
      {ticket.status === 'analizado' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-display text-lg text-fg">{ticket.supermarket || 'Supermercado sin identificar'}</p>
            {ticket.date ? <p className="text-sm text-fg-muted">{shortDate(ticket.date)}</p> : null}
            <p className="tnum ml-auto font-display text-2xl text-violet">{eur(ticket.total)}</p>
          </div>

          {avisos.length > 0 ? (
            <div className="space-y-1.5 rounded-[14px] border border-warning/30 bg-warning/10 p-3">
              {avisos.map((aviso, i) => (
                <p key={i} className="flex items-start gap-2 text-xs text-warning">
                  <FileWarning size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {aviso}
                </p>
              ))}
            </div>
          ) : null}

          <ul className="space-y-2">
            {lineas.map((linea, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{linea.name}</p>
                  <p className="tnum text-xs text-fg-subtle">
                    {linea.units ? `${linea.units} ud` : `${linea.amount} ${etiquetaUnidad(linea.unit)}`}
                    {linea.unit_price ? ` · ${eur(linea.unit_price)}/${etiquetaUnidad(linea.unit)}` : ''}
                  </p>
                </div>
                <p className="tnum shrink-0 font-medium text-fg">{eur(linea.total)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* El texto sigue editable mientras no este confirmado: es el arreglo cuando
          la transcripcion ha leido mal una linea, o el analisis inicial cuando
          el ticket se subio solo con la foto. */}
      {ticket.status !== 'confirmado' ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-fg-muted" htmlFor="ticket-markdown-edicion">
            Texto del ticket
          </label>
          <textarea
            id="ticket-markdown-edicion"
            rows={8}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="w-full rounded-[14px] border border-border bg-surface-2 px-4 py-3 font-mono text-xs text-fg transition-colors focus:border-primary"
          />
          <Button
            variant="secondary"
            full
            disabled={!markdown.trim() || analizar.isPending}
            onClick={() => analizar.mutate({ id: ticket.id, markdown })}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {analizar.isPending
              ? 'Analizando...'
              : ticket.status === 'pendiente'
                ? 'Analizar ticket'
                : 'Volver a analizar'}
          </Button>
          {analizar.isError ? (
            <p className="text-sm text-danger">{mensajeDeError(analizar.error, 'No se pudo analizar el ticket.')}</p>
          ) : null}
        </div>
      ) : null}

      {ticket.status === 'analizado' ? (
        <Button full disabled={confirmar.isPending} onClick={() => confirmar.mutate({ id: ticket.id })}>
          {confirmar.isPending ? 'Confirmando...' : 'Confirmar y añadir a la compra'}
        </Button>
      ) : null}
      {confirmar.isError ? (
        <p className="text-sm text-danger">{mensajeDeError(confirmar.error, 'No se pudo confirmar el ticket.')}</p>
      ) : null}

      <ConfirmModal
        open={confirmarBorrado}
        onClose={() => setConfirmarBorrado(false)}
        onConfirm={onEliminarConfirmado}
        title="Eliminar ticket"
        description="Se eliminará este ticket. La compra que ya se hubiera creado a partir de él no se ve afectada."
      />
    </Card>
  )
}

function DetalleTicket({ id, onEliminado }: { id: number; onEliminado: () => void }) {
  const ticket = useReceipt(id)

  if (ticket.isLoading) return <SkeletonList rows={3} height="h-16" />
  if (ticket.isError || !ticket.data) return <ErrorState onRetry={() => ticket.refetch()} />

  return <DetalleTicketCargado key={ticket.data.updated_at} ticket={ticket.data} onEliminado={onEliminado} />
}

// ================================================================
// Lista de tickets del hogar
// ================================================================

function ListaTickets({
  tickets,
  seleccionado,
  onSeleccionar,
}: {
  tickets: Receipt[]
  seleccionado: number | null
  onSeleccionar: (id: number) => void
}) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={ReceiptIcon}
        title="Sin tickets todavía"
        description="Sube la foto y el texto de un ticket arriba para empezar."
      />
    )
  }

  return (
    <ul className="space-y-2">
      {tickets.map((t) => (
        <li key={t.id}>
          <button type="button" onClick={() => onSeleccionar(t.id)} className="block w-full text-left">
            <Card
              className={`transition-colors hover:bg-surface-2 ${seleccionado === t.id ? 'border-primary' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{t.supermarket || 'Sin analizar todavía'}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2">
                    {t.date ? <span className="text-xs text-fg-subtle">{shortDate(t.date)}</span> : null}
                    <InsigniaEstado status={t.status} />
                  </p>
                </div>
                <p className="tnum shrink-0 font-medium text-fg">{eur(t.total)}</p>
              </div>
            </Card>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ================================================================
// Pantalla
// ================================================================

export default function TicketPage() {
  const household = useHousehold()
  const householdId = household.data?.id ?? 0
  const tickets = useReceipts(householdId)
  const [seleccionado, setSeleccionado] = useState<number | null>(null)

  if (household.isLoading || tickets.isLoading) return <SkeletonList rows={3} height="h-20" />
  if (household.isError || tickets.isError || !household.data) {
    return (
      <ErrorState
        onRetry={() => {
          household.refetch()
          tickets.refetch()
        }}
      />
    )
  }

  const lista = tickets.data ?? []

  return (
    <div className="animate-rise space-y-4">
      <SubirTicketCard householdId={householdId} onSubido={setSeleccionado} />

      {seleccionado !== null ? (
        <DetalleTicket id={seleccionado} onEliminado={() => setSeleccionado(null)} />
      ) : null}

      <div>
        <SectionLabel>Tickets del hogar</SectionLabel>
        <ListaTickets tickets={lista} seleccionado={seleccionado} onSeleccionar={setSeleccionado} />
      </div>
    </div>
  )
}
