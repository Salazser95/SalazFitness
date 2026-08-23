import { Check } from 'lucide-react'

/**
 * Fila de serie. La pantalla mas importante de la app: se usa con una mano,
 * sudando, mirando poco. Ver "Fila de serie" en docs/DESIGN-SYSTEM.md.
 */

type SerieRowProps = {
  numero: number
  peso: string
  repeticiones: string
  rir?: string | null
  descansoSeg?: number | null
  completada: boolean
  onPesoChange: (v: string) => void
  onRepeticionesChange: (v: string) => void
  onCompletar: () => void
}

export function SerieRow({
  numero,
  peso,
  repeticiones,
  rir,
  descansoSeg,
  completada,
  onPesoChange,
  onRepeticionesChange,
  onCompletar,
}: SerieRowProps) {
  const detalle = [
    rir ? `RIR ${rir}` : null,
    descansoSeg ? `${descansoSeg}s descanso` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={`rounded-[20px] border border-border p-3 transition-colors duration-150 ${
        completada ? 'bg-primary/[0.08]' : 'bg-surface'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-display text-lg tnum ${
            completada
              ? 'border-primary/40 text-fg-subtle line-through'
              : 'border-border-strong text-fg'
          }`}
          aria-hidden="true"
        >
          {numero}
        </div>

        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
            Peso (kg)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={peso}
            onChange={(e) => onPesoChange(e.target.value)}
            disabled={completada}
            aria-label={`Peso de la serie ${numero}`}
            className="tnum h-14 w-full rounded-[14px] border border-border bg-surface-2 px-3 text-center text-2xl font-semibold text-fg focus:border-primary disabled:opacity-60"
          />
        </div>

        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
            Reps
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={repeticiones}
            onChange={(e) => onRepeticionesChange(e.target.value)}
            disabled={completada}
            aria-label={`Repeticiones de la serie ${numero}`}
            className="tnum h-14 w-full rounded-[14px] border border-border bg-surface-2 px-3 text-center text-2xl font-semibold text-fg focus:border-primary disabled:opacity-60"
          />
        </div>

        <button
          type="button"
          onClick={onCompletar}
          aria-label={completada ? `Serie ${numero} completada` : `Completar serie ${numero}`}
          aria-pressed={completada}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border transition-colors duration-150 ${
            completada
              ? 'animate-pop border-primary bg-primary text-on-primary'
              : 'border-border-strong bg-surface-2 text-fg-subtle hover:text-fg'
          }`}
        >
          <Check size={26} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      {detalle ? <p className="mt-2 pl-[52px] text-xs text-fg-subtle">{detalle}</p> : null}
    </div>
  )
}
