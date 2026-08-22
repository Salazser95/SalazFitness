# SalazFitness — Sistema de diseño

**Dirección:** "Neón sobre grafito". Atlético-técnico, oscuro, con acentos de
lima eléctrica y cian. Futurista de verdad, pero sin adornos que estorben: la
pantalla de gimnasio tiene que leerse de un vistazo, con el móvil sudado y a un
metro de distancia.

Referencias mentales: paneles de telemetría deportiva, HUD, Whoop y Strava en
modo oscuro pero más contrastado y con los números mucho más grandes.

## 1. Color

Se define como variables CSS en `web/src/styles/theme.css` y se expone a
Tailwind v4 con `@theme`. **Nunca usar hex sueltos en los componentes.**

### Base (modo oscuro, es el único modo)

| Token | Valor | Uso |
|---|---|---|
| `--color-bg` | `#0A0E1A` | Fondo de la app |
| `--color-surface` | `#121828` | Tarjetas |
| `--color-surface-2` | `#1A2234` | Tarjetas elevadas, inputs |
| `--color-surface-3` | `#232D42` | Hover, estados activos |
| `--color-border` | `rgba(255,255,255,0.08)` | Bordes por defecto |
| `--color-border-strong` | `rgba(255,255,255,0.16)` | Separadores marcados |
| `--color-fg` | `#F1F5F9` | Texto principal |
| `--color-fg-muted` | `#94A3B8` | Texto secundario |
| `--color-fg-subtle` | `#64748B` | Texto terciario, deshabilitado |

### Acentos

| Token | Valor | Uso |
|---|---|---|
| `--color-primary` | `#C6F135` | Lima eléctrica. Acción principal, marca, series completadas |
| `--color-primary-dim` | `#A5CC2A` | Hover del primario |
| `--color-on-primary` | `#0A0E1A` | Texto sobre lima |
| `--color-accent` | `#22D3EE` | Cian. Datos, gráficas, enlaces, nutrición |
| `--color-on-accent` | `#0A0E1A` | Texto sobre cian |
| `--color-violet` | `#A78BFA` | Tercera serie de datos, compra y coste |
| `--color-success` | `#34D399` | Confirmaciones, récord conseguido |
| `--color-warning` | `#FBBF24` | Avisos, presupuesto al límite |
| `--color-danger` | `#F87171` | Errores, borrar, presupuesto excedido |

### Contraste verificado sobre `#0A0E1A`

- `#F1F5F9` da 16.4:1 (texto principal, AAA)
- `#94A3B8` da 7.4:1 (texto secundario, AAA)
- `#64748B` da 4.0:1, así que **solo para texto de 18px o más, o elementos no textuales**
- `#C6F135` da 14.9:1
- `#22D3EE` da 10.5:1

`--color-on-primary` sobre `--color-primary` da 14.9:1.

### Colores de gráficas, en este orden

`#C6F135`, `#22D3EE`, `#A78BFA`, `#FBBF24`, `#F87171`, `#34D399`

Nunca depender solo del color: toda serie lleva etiqueta o leyenda.

## 2. Tipografía

**Barlow Condensed** para titulares y números grandes. Condensada significa
deportiva, y permite números enormes sin romper el layout.
**Barlow** para el cuerpo.

```
https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap
```

Con fallback siempre: `'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif`.

| Rol | Fuente | Tamaño | Peso | Tracking |
|---|---|---|---|---|
| Cifra gigante (peso, kcal) | Barlow Condensed | 56-72px | 700 | -0.02em |
| Título de pantalla | Barlow Condensed | 28px | 700 | -0.01em |
| Título de tarjeta | Barlow Condensed | 20px | 600 | 0 |
| Etiqueta de sección | Barlow | 12px | 600 | 0.08em, mayúsculas |
| Cuerpo | Barlow | 16px | 400 | 0 |
| Secundario | Barlow | 14px | 400 | 0 |
| Micro | Barlow | 12px | 500 | 0.02em |

Nunca por debajo de 12px. Interlineado de cuerpo 1.5.
Los números llevan `font-variant-numeric: tabular-nums` para que no bailen al
actualizarse.

## 3. Espaciado y forma

Escala de 4px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

| Token | Valor |
|---|---|
| `--radius-sm` | 8px |
| `--radius` | 14px |
| `--radius-lg` | 20px |
| `--radius-full` | 999px |

Tarjetas: `--radius-lg`, fondo `--color-surface`, borde de 1px `--color-border`.

## 4. Efectos

**Glass sutil** en las barras fijas, superior e inferior:
`background: rgba(10,14,26,0.72)` con `backdrop-filter: blur(16px)` y un borde
de 1px.

**Glow del primario**, solo en la acción principal de cada pantalla:
`box-shadow: 0 0 0 1px rgba(198,241,53,0.3), 0 8px 24px -8px rgba(198,241,53,0.4)`.

**Malla de fondo** muy tenue, solo en el dashboard: gradiente radial de
`rgba(198,241,53,0.06)` arriba a la izquierda y `rgba(34,211,238,0.05)` abajo a
la derecha.

Prohibido: sombras negras duras, degradados de más de dos paradas, y blur en
elementos que se desplazan porque mata el rendimiento en móvil.

## 5. Movimiento

| Situación | Duración | Curva |
|---|---|---|
| Hover, cambio de color | 150ms | `ease-out` |
| Entrada de elemento | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Cambio de pantalla | 250ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Serie completada | 400ms | `cubic-bezier(0.34, 1.56, 0.64, 1)`, con rebote |
| Salida | 180ms | `ease-in` |

Escalonado de listas: 40ms por elemento, con un máximo de 8 elementos.

**Obligatorio** respetar `prefers-reduced-motion: reduce`: sin transformaciones,
solo opacidad, y duraciones a 0.01ms.

Animar únicamente `opacity` y `transform`. Nunca `width`, `height`, `top` ni
`left`.

## 6. Componentes

### Navegación

- **Móvil:** barra inferior fija, **cinco destinos como máximo**: Hoy, Entreno,
  Nutrición, Compra, Yo. Iconos SVG de Lucide más la etiqueta de texto, siempre
  visible.
- **Escritorio, a partir de 1024px:** barra lateral de 240px, mismo orden.
- Respetar `env(safe-area-inset-bottom)` para el iPhone con notch.

### Botones

- Altura mínima de 48px, área táctil mínima de 44x44px, 8px de separación entre
  ellos.
- Primario: fondo lima, texto grafito, con glow.
- Secundario: fondo `--color-surface-2`, borde, texto claro.
- Fantasma: sin fondo, texto `--color-fg-muted`.
- Peligro: texto `--color-danger` sobre `rgba(248,113,113,0.1)`.
- Todos con `cursor-pointer` y anillo de foco visible:
  `outline: 2px solid var(--color-primary)` con `outline-offset: 2px`.

### Tarjeta de estadística

Etiqueta pequeña en mayúsculas arriba, cifra gigante en Barlow Condensed, y
delta debajo con flecha y color. Verde si sube, rojo si baja, siempre con el
signo, nunca solo el color.

### Fila de serie

Es la pantalla más importante de la aplicación. Pensada para usarse con una mano
y sin mirar mucho:

- Número de serie a la izquierda, dentro de un círculo.
- Peso y repeticiones como campos grandes y tocables, con `inputmode="decimal"`.
- Botón de completar a la derecha, de 56x56px, que se rellena de lima con
  rebote.
- Serie ya completada: fondo `rgba(198,241,53,0.08)` y el número tachado.

### Estados vacíos

Icono de línea, una frase corta y un único botón de acción. Nunca una pantalla
en blanco.

### Carga

Esqueletos del mismo tamaño que el contenido real, para evitar saltos de layout.
Nunca un spinner centrado a pantalla completa.

## 7. Iconos

**Lucide React** exclusivamente. Nunca emojis como iconos.
Tamaño de 20px en navegación y botones, 16px en línea con texto, y 1.75px de
trazo.
Todo icono decorativo lleva `aria-hidden="true"`.
Todo botón que solo tenga icono lleva `aria-label`.

## 8. Checklist antes de dar por buena una pantalla

- [ ] Contraste de texto de 4.5:1 como mínimo
- [ ] Objetivos táctiles de 44x44px o más, con 8px de separación
- [ ] Foco de teclado visible en todo lo interactivo
- [ ] `prefers-reduced-motion` respetado
- [ ] Sin scroll horizontal a 375px de ancho
- [ ] Estados de carga, vacío y error resueltos
- [ ] Iconos SVG, nunca emojis
- [ ] Números con `tabular-nums`
- [ ] Safe areas respetadas en iOS
