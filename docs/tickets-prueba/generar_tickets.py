#!/usr/bin/env python3
"""
Genera tickets de compra FICTICIOS (imagenes PNG) para probar el analisis
de tickets de la app SalazFitness.

IMPORTANTE: estos tickets son de PRUEBA. No representan documentos reales
de ningun comercio. El NIF, la direccion, el telefono y los numeros de
factura/operacion son inventados a proposito (ver README.md de esta
carpeta para mas detalle).

Uso:
    python3 docs/tickets-prueba/generar_tickets.py

Requiere Pillow (PIL). No usa tesseract ni ningun motor de OCR.
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Localizacion de una fuente monoespaciada del sistema
# ---------------------------------------------------------------------------

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeMono.ttf",
]

FONT_SIZE = 16


def _buscar_fuente_con_fc_list() -> str | None:
    """Intenta localizar una fuente monoespaciada usando fc-list."""
    try:
        import subprocess

        salida = subprocess.run(
            ["fc-list"], capture_output=True, text=True, timeout=5
        ).stdout
        for linea in salida.splitlines():
            if "mono" in linea.lower():
                ruta = linea.split(":")[0].strip()
                if ruta.lower().endswith(".ttf") and os.path.isfile(ruta):
                    return ruta
    except Exception:
        pass
    return None


def cargar_fuente(tamano: int = FONT_SIZE) -> ImageFont.FreeTypeFont:
    """Carga una fuente monoespaciada. Si no encuentra ninguna, usa la
    fuente por defecto de PIL para que el script nunca reviente."""
    candidatos = list(FONT_CANDIDATES)

    encontrada = _buscar_fuente_con_fc_list()
    if encontrada:
        candidatos.insert(0, encontrada)

    for ruta in candidatos:
        if os.path.isfile(ruta):
            try:
                return ImageFont.truetype(ruta, tamano)
            except Exception:
                continue

    print("AVISO: no se encontro ninguna fuente monoespaciada, "
          "se usara la fuente por defecto de PIL.", file=sys.stderr)
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# Contenido de los tickets (mismos productos/precios en ES y CA)
# ---------------------------------------------------------------------------

# cada item: (cantidad, descripcion, precio_unitario, importe, linea_peso)
# linea_peso es None salvo en los productos vendidos a peso.

ITEMS_ES = [
    ("2", "LECHE ENTERA 1L", "0,89", "1,78", None),
    ("1", "PAN DE MOLDE", "", "1,45", None),
    ("1", "ACEITE OLIVA V.E.", "7,80", "7,80", None),
    ("3", "YOGUR NATURAL", "0,45", "1,35", None),
    ("", "PLATANO", "", "2,28", "0,760 kg      3,00 EUR/kg"),
    ("", "TOMATE RAMA", "", "1,74", "0,580 kg      3,00 EUR/kg"),
    ("1", "PECHUGA POLLO", "", "2,70", "0,450 kg      6,00 EUR/kg"),
]

ITEMS_CA = [
    ("2", "LLET SENCERA 1L", "0,89", "1,78", None),
    ("1", "PA DE MOTLLE", "", "1,45", None),
    ("1", "OLI OLIVA V.E.", "7,80", "7,80", None),
    ("3", "IOGURT NATURAL", "0,45", "1,35", None),
    ("", "PLATAN", "", "2,28", "0,760 kg      3,00 EUR/kg"),
    ("", "TOMAQUET RAMA", "", "1,74", "0,580 kg      3,00 EUR/kg"),
    ("1", "PIT DE POLLASTRE", "", "2,70", "0,450 kg      6,00 EUR/kg"),
]

# desglose de IVA (inventado pero aritmeticamente coherente con el total)
# 4%  -> leche, pan, yogur, platano, tomate  (8,60 EUR con IVA incluido)
# 10% -> aceite, pechuga de pollo            (10,50 EUR con IVA incluido)
IVA_FILAS = [
    ("4%", "8,27", "0,33"),
    ("10%", "9,55", "0,95"),
]

TOTAL = "19,10"

ANCHO_DESC = 22  # ancho de la columna de descripcion
ANCHO_NUM = 8    # ancho de las columnas numericas
SEPARADOR = "-" * 40


def _fila_item(cantidad: str, desc: str, unit: str, importe: str) -> str:
    prefijo = f"{cantidad:<1} " if cantidad else "  "
    return (
        prefijo
        + f"{desc:<{ANCHO_DESC}}"
        + f"{unit:>{ANCHO_NUM}}"
        + " "
        + f"{importe:>{ANCHO_NUM}}"
    )


def construir_ticket_es() -> list[str]:
    lineas = []
    lineas.append("*** TICKET DE PRUEBA - DATOS FICTICIOS ***")
    lineas.append("MERCADONA, S.A.".center(40))
    lineas.append("C/ EXEMPLE, 12".center(40))
    lineas.append("00000 CIUDAD DE PRUEBA".center(40))
    lineas.append("TELEFONO: 900000000".center(40))
    lineas.append("NIF: X-00000000".center(40))
    lineas.append(SEPARADOR)
    lineas.append("19/08/2026 13:45     OP: 0000001")
    lineas.append("FACTURA SIMPLIFICADA: 0000-000-000000")
    lineas.append(SEPARADOR)
    lineas.append(_fila_item("", "Descripcion", "P.Unit", "Importe"))
    lineas.append(SEPARADOR)
    for cantidad, desc, unit, importe, peso in ITEMS_ES:
        lineas.append(_fila_item(cantidad, desc, unit, importe))
        if peso:
            lineas.append("    " + peso)
    lineas.append(SEPARADOR)
    lineas.append(_fila_item("", "TOTAL (EUR)", "", TOTAL))
    lineas.append(_fila_item("", "TARJETA BANCARIA", "", TOTAL))
    lineas.append(SEPARADOR)
    lineas.append(f"{'IVA':<6}{'BASE':>10}{'CUOTA':>10}")
    for tipo, base, cuota in IVA_FILAS:
        lineas.append(f"{tipo:<6}{base:>10}{cuota:>10}")
    lineas.append(SEPARADOR)
    lineas.append("GRACIAS POR SU VISITA".center(40))
    lineas.append("(TICKET FICTICIO - NO VALIDO)".center(40))
    lineas.append("*** TICKET DE PRUEBA - DATOS FICTICIOS ***")
    return lineas


def construir_ticket_ca() -> list[str]:
    lineas = []
    lineas.append("*** TIQUET DE PROVA - DADES FICTICIES ***")
    lineas.append("MERCADONA, S.A.".center(40))
    lineas.append("C/ EXEMPLE, 12".center(40))
    lineas.append("00000 CIUTAT DE PROVA".center(40))
    lineas.append("TELEFON: 900000000".center(40))
    lineas.append("NIF: X-00000000".center(40))
    lineas.append(SEPARADOR)
    lineas.append("19/08/2026 13:45     OP: 0000001")
    lineas.append("FACTURA SIMPLIFICADA: 0000-000-000000")
    lineas.append(SEPARADOR)
    lineas.append(_fila_item("", "Descripcio", "P.Unit", "Import"))
    lineas.append(SEPARADOR)
    for cantidad, desc, unit, importe, peso in ITEMS_CA:
        lineas.append(_fila_item(cantidad, desc, unit, importe))
        if peso:
            lineas.append("    " + peso)
    lineas.append(SEPARADOR)
    lineas.append(_fila_item("", "TOTAL (EUR)", "", TOTAL))
    lineas.append(_fila_item("", "TARGETA BANCARIA", "", TOTAL))
    lineas.append(SEPARADOR)
    lineas.append(f"{'IVA':<6}{'BASE':>10}{'QUOTA':>10}")
    for tipo, base, cuota in IVA_FILAS:
        lineas.append(f"{tipo:<6}{base:>10}{cuota:>10}")
    lineas.append(SEPARADOR)
    lineas.append("GRACIES PER LA SEVA VISITA".center(40))
    lineas.append("(TIQUET FICTICI - NO VALID)".center(40))
    lineas.append("*** TIQUET DE PROVA - DADES FICTICIES ***")
    return lineas


# ---------------------------------------------------------------------------
# Renderizado a imagen PNG
# ---------------------------------------------------------------------------

ANCHO_IMG = 640
MARGEN = 30
INTERLINEADO = 1.45
COLOR_FONDO = (250, 248, 242)  # blanco hueso
COLOR_TEXTO = (20, 20, 20)


def renderizar_ticket(lineas: list[str], ruta_salida: str) -> tuple[int, int]:
    fuente = cargar_fuente(FONT_SIZE)

    # altura de linea aproximada a partir de la metrica de la fuente
    bbox = fuente.getbbox("Ag")
    alto_linea = int((bbox[3] - bbox[1]) * INTERLINEADO) + 4
    alto_linea = max(alto_linea, FONT_SIZE + 6)

    alto_img = MARGEN * 2 + alto_linea * len(lineas)

    img = Image.new("RGB", (ANCHO_IMG, alto_img), COLOR_FONDO)
    draw = ImageDraw.Draw(img)

    y = MARGEN
    for linea in lineas:
        draw.text((MARGEN, y), linea, font=fuente, fill=COLOR_TEXTO)
        y += alto_linea

    img.save(ruta_salida)
    return img.size


def main() -> None:
    carpeta = os.path.dirname(os.path.abspath(__file__))

    ticket_es = construir_ticket_es()
    ticket_ca = construir_ticket_ca()

    ruta_es = os.path.join(carpeta, "mercadona-es.png")
    ruta_ca = os.path.join(carpeta, "mercadona-ca.png")

    tam_es = renderizar_ticket(ticket_es, ruta_es)
    tam_ca = renderizar_ticket(ticket_ca, ruta_ca)

    print(f"Generado: {ruta_es} ({tam_es[0]}x{tam_es[1]})")
    print(f"Generado: {ruta_ca} ({tam_ca[0]}x{tam_ca[1]})")

    print("\n--- Contenido de texto: mercadona-es.png ---")
    print("\n".join(ticket_es))
    print("\n--- Contenido de texto: mercadona-ca.png ---")
    print("\n".join(ticket_ca))


if __name__ == "__main__":
    main()
