/**
 * Ilustracion decorativa de categoria de ejercicio, generada en SVG (sin
 * descargas externas, sin problema de derechos: dibujo propio).
 *
 * Se pinta cuando `useExerciseMedia` no encuentra ni video ni imagen real de
 * wger para el ejercicio (631 de 872 casos ahora mismo). NO pretende ser una
 * demostracion realista del movimiento (eso lo cubre el video/imagen real
 * cuando existe): es un icono de "esqueleto" tipo HUD/telemetria deportiva,
 * en la linea del sistema de diseno, con la zona muscular de la categoria
 * marcada en un color de acento.
 *
 * IDs de categoria verificados en docs/API-CONTRACT.md contra el servidor
 * real de esta instalacion (seccion "Categorias (ids reales de esta
 * instalacion)"): 8 Arms, 9 Legs, 10 Abs, 11 Chest, 12 Back, 13 Shoulders,
 * 14 Calves, 15 Cardio.
 */

import type { ReactNode } from 'react'

export const CATEGORIA_NOMBRE: Record<number, string> = {
  8: 'Brazos',
  9: 'Piernas',
  10: 'Abdomen',
  11: 'Pecho',
  12: 'Espalda',
  13: 'Hombros',
  14: 'Gemelos',
  15: 'Cardio',
}

// Paleta exacta del sistema de diseno para SVG (ver docs/DESIGN-SYSTEM.md).
const LIMA = '#C6F135'
const CIAN = '#22D3EE'
const VIOLETA = '#A78BFA'
const TRAZO = '#F1F5F9'

// Puntos del esqueleto base, compartidos por todas las categorias que
// marcan una zona sobre la figura humana (todas menos Cardio).
const HUESOS: [number, number, number, number][] = [
  [100, 44, 100, 54],
  [100, 54, 76, 58],
  [100, 54, 124, 58],
  [76, 58, 58, 92],
  [58, 92, 48, 128],
  [124, 58, 142, 92],
  [142, 92, 152, 128],
  [100, 54, 100, 112],
  [100, 112, 86, 114],
  [100, 112, 114, 114],
  [86, 114, 82, 152],
  [82, 152, 78, 188],
  [114, 114, 118, 152],
  [118, 152, 122, 188],
]

const ARTICULACIONES: [number, number][] = [
  [100, 54],
  [76, 58],
  [124, 58],
  [58, 92],
  [142, 92],
  [48, 128],
  [152, 128],
  [100, 112],
  [86, 114],
  [114, 114],
  [82, 152],
  [118, 152],
  [78, 188],
  [122, 188],
]

function Esqueleto() {
  return (
    <g fill="none" stroke={TRAZO} strokeOpacity={0.55} strokeWidth={2.5} strokeLinecap="round">
      <circle cx="100" cy="30" r="14" />
      {HUESOS.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      {ARTICULACIONES.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={3} fill={TRAZO} fillOpacity={0.55} stroke="none" />
      ))}
    </g>
  )
}

/** Zona muscular resaltada en color de acento, distinta por categoria. */
function zonaPorCategoria(category: number | null): ReactNode {
  switch (category) {
    case 11: // Pecho
      return (
        <g fill={LIMA} fillOpacity={0.18} stroke={LIMA} strokeWidth={3.5}>
          <circle cx="87" cy="72" r="11" />
          <circle cx="113" cy="72" r="11" />
        </g>
      )
    case 12: // Espalda
      return (
        <g fill="none" stroke={CIAN} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
          <line x1="100" y1="56" x2="100" y2="112" strokeWidth={5} />
          <path d="M100,62 Q79,80 86,110" />
          <path d="M100,62 Q121,80 114,110" />
        </g>
      )
    case 13: // Hombros
      return (
        <g fill={VIOLETA} fillOpacity={0.2} stroke={VIOLETA} strokeWidth={3.5}>
          <circle cx="76" cy="58" r="10" />
          <circle cx="124" cy="58" r="10" />
        </g>
      )
    case 8: // Brazos
      return (
        <>
          <g fill="none" stroke={LIMA} strokeWidth={5} strokeLinecap="round">
            <line x1="76" y1="58" x2="58" y2="92" />
            <line x1="58" y1="92" x2="48" y2="128" />
            <line x1="124" y1="58" x2="142" y2="92" />
            <line x1="142" y1="92" x2="152" y2="128" />
          </g>
          <g fill={LIMA} fillOpacity={0.28} stroke="none">
            <circle cx="58" cy="92" r="6" />
            <circle cx="142" cy="92" r="6" />
          </g>
        </>
      )
    case 10: // Abdomen
      return (
        <g stroke={CIAN} strokeWidth={4} strokeLinecap="round">
          <line x1="90" y1="72" x2="110" y2="72" />
          <line x1="90" y1="86" x2="110" y2="86" />
          <line x1="90" y1="100" x2="110" y2="100" />
        </g>
      )
    case 9: // Piernas
      return (
        <>
          <g fill="none" stroke={VIOLETA} strokeWidth={5} strokeLinecap="round">
            <line x1="86" y1="114" x2="82" y2="152" />
            <line x1="114" y1="114" x2="118" y2="152" />
          </g>
          <g fill={VIOLETA} fillOpacity={0.28} stroke="none">
            <circle cx="82" cy="152" r="6" />
            <circle cx="118" cy="152" r="6" />
          </g>
        </>
      )
    case 14: // Gemelos
      return (
        <>
          <g fill="none" stroke={LIMA} strokeWidth={5} strokeLinecap="round">
            <line x1="82" y1="152" x2="78" y2="188" />
            <line x1="118" y1="152" x2="122" y2="188" />
          </g>
          <g fill={LIMA} fillOpacity={0.28} stroke="none">
            <circle cx="78" cy="188" r="6" />
            <circle cx="122" cy="188" r="6" />
          </g>
        </>
      )
    default:
      return null
  }
}

/** Cardio no es una zona muscular: corazon con pulso, sin figura humana. */
function IlustracionCardio() {
  return (
    <g fill="none" stroke={CIAN} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M100,152 C58,120 38,90 38,64 C38,44 54,30 72,30 C87,30 97,39 100,52 C103,39 113,30 128,30 C146,30 162,44 162,64 C162,90 142,120 100,152 Z" />
      <path
        d="M52,80 L78,80 L88,58 L101,106 L112,80 L148,80"
        stroke={LIMA}
        strokeWidth={3.5}
      />
    </g>
  )
}

type Props = {
  /** Id de categoria del ejercicio (ver CATEGORIA_NOMBRE). null si aun no se conoce. */
  category: number | null
  className?: string
}

export function ExerciseIllustration({ category, className = '' }: Props) {
  const nombre = category !== null ? CATEGORIA_NOMBRE[category] : undefined

  return (
    <div
      role="img"
      aria-label={nombre ? `Ilustracion de categoria: ${nombre}` : 'Ilustracion decorativa de ejercicio'}
      className={`flex items-center justify-center rounded-[20px] border border-border bg-surface-2 ${className}`}
    >
      <svg viewBox="0 0 200 200" className="h-full max-h-[220px] w-auto" aria-hidden="true">
        {category === 15 ? <IlustracionCardio /> : <Esqueleto />}
        {category !== null && category !== 15 ? zonaPorCategoria(category) : null}
      </svg>
    </div>
  )
}
