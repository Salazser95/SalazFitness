import { UtensilsCrossed } from 'lucide-react'

/**
 * Marcador decorativo para una receta sin foto (`receta.image === null`).
 * El contrato de Recipe (ver tipos.ts) no tiene un campo de categoria de
 * comida, asi que no hay zona que resaltar como en ExerciseIllustration de
 * entreno/: es el icono Lucide UtensilsCrossed sobre el mismo fondo de
 * "malla" tenue del dashboard (ver docs/DESIGN-SYSTEM.md, seccion 4
 * Efectos: gradiente radial rgba(198,241,53,0.06) arriba-izquierda y
 * rgba(34,211,238,0.05) abajo-derecha).
 */
export function RecetaIlustracion({
  className = 'aspect-square',
  iconSize = 40,
}: {
  className?: string
  iconSize?: number
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center rounded-[14px] border border-border ${className}`}
      style={{
        background:
          'radial-gradient(circle at 20% 20%, rgba(198,241,53,0.06) 0%, transparent 55%), ' +
          'radial-gradient(circle at 80% 80%, rgba(34,211,238,0.05) 0%, transparent 55%), ' +
          'var(--color-surface-2)',
      }}
    >
      <UtensilsCrossed size={iconSize} strokeWidth={1.75} className="text-fg-subtle" />
    </div>
  )
}
