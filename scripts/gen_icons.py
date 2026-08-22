"""Genera los iconos de la PWA de SalazFitness.

Marca: rayo de energia en lima electrica sobre grafito, dentro de un cuadrado
redondeado. Colores del sistema de diseno (docs/DESIGN-SYSTEM.md).
"""

import sys
from PIL import Image, ImageDraw

BG = (10, 14, 26, 255)        # --color-bg
LIME = (198, 241, 53, 255)    # --color-primary
CYAN = (34, 211, 238, 255)    # --color-accent


def bolt_points(size):
    """Rayo estilizado, normalizado a un lienzo de 100x100 y escalado."""
    pts = [
        (58, 8), (30, 52), (46, 52), (40, 92), (70, 44), (53, 44),
    ]
    k = size / 100
    return [(x * k, y * k) for x, y in pts]


def make_icon(size, path, rounded=True):
    # 4x para dibujar y luego reducir: bordes suaves sin antialias manual.
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, s - 1, s - 1], fill=BG)

    # Barra de acento en la base, como una linea de telemetria
    d.rectangle(
        [int(s * 0.18), int(s * 0.80), int(s * 0.82), int(s * 0.835)],
        fill=CYAN,
    )
    d.polygon(bolt_points(s), fill=LIME)

    img.resize((size, size), Image.LANCZOS).save(path, "PNG", optimize=True)
    print("  {} -> {}x{}".format(path, size, size))


def main():
    make_icon(192, "icon-192.png")
    make_icon(512, "icon-512.png")
    # maskable necesita margen de seguridad: el fondo llega al borde
    make_icon(512, "icon-512-maskable.png", rounded=False)
    make_icon(180, "apple-touch-icon.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
