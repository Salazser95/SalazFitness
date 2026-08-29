"""
Parseo de tickets de supermercado (texto plano o pegado desde Markdown).

El problema real: el usuario fotografia o transcribe el ticket de la compra y
lo pega en el chat para que la app sepa que ha comprado y por cuanto. Ese
texto no tiene una estructura fija -- cambia de supermercado a supermercado,
de castellano a catalan, y a veces llega ya "formateado" en Markdown porque
viene de una transcripcion -- asi que el parser tiene que ser tolerante: una
linea rara no debe tirar el ticket entero, solo dejar un aviso y seguir.

Deliberadamente sin dependencias de Django ni de wger (solo stdlib) para que
se pueda testear con `python -m unittest` sin levantar el proyecto entero,
igual que `frescura.py`.
"""

from __future__ import annotations

import datetime
import re
import unicodedata
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation


@dataclass
class LineaTicket:
    """Un producto o servicio dentro del ticket."""

    name: str
    #: Numero de unidades sueltas; None si la linea va por peso o volumen.
    units: Decimal | None
    #: Cantidad: nº de uds, o kg, o litros.
    amount: Decimal
    unit: str
    #: Precio por unidad / por kg / por litro; None si el ticket no lo trae.
    unit_price: Decimal | None
    total: Decimal


@dataclass
class TicketParseado:
    """Resultado de parsear un ticket entero."""

    supermarket: str
    date: datetime.date | None
    lines: list[LineaTicket] = field(default_factory=list)
    #: El TOTAL impreso en el ticket (no la suma calculada de las lineas).
    total: Decimal | None = None
    warnings: list[str] = field(default_factory=list)


# --------------------------------------------------------------- supermercados

# Nombre a buscar (sin tildes, mayusculas) -> nombre "bonito" a devolver.
_SUPERMERCADOS: dict[str, str] = {
    'MERCADONA': 'Mercadona',
    'BONPREU': 'Bonpreu',
    'ESCLAT': 'Esclat',
    'CONSUM': 'Consum',
    'CARREFOUR': 'Carrefour',
    'LIDL': 'Lidl',
    'DIA': 'Dia',
    'ALDI': 'Aldi',
    'CAPRABO': 'Caprabo',
    'EROSKI': 'Eroski',
    'ALCAMPO': 'Alcampo',
    'SUPERCOR': 'Supercor',
    'CONDIS': 'Condis',
    'SORLI': 'Sorli',
}

# Cuantas lineas iniciales del ticket se miran para reconocer al supermercado.
_LINEAS_CABECERA = 10


def _sin_tildes(texto: str) -> str:
    """Texto en mayusculas y sin diacriticos, para comparar sin depender del acento."""
    descompuesto = unicodedata.normalize('NFKD', texto or '')
    sin_marcas = ''.join(c for c in descompuesto if not unicodedata.combining(c))
    return sin_marcas.upper()


def _detectar_supermercado(lineas: list[str]) -> str:
    """Busca el nombre del supermercado en las primeras lineas del ticket."""
    for linea in lineas[:_LINEAS_CABECERA]:
        normalizada = _sin_tildes(linea)
        for clave, bonito in _SUPERMERCADOS.items():
            if clave in normalizada:
                return bonito
    return ''


# --------------------------------------------------------------------- fechas

# DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, y las mismas con año de 2 cifras.
_RE_FECHA = re.compile(r'\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})\b')


def _detectar_fecha(texto: str) -> datetime.date | None:
    """Primera fecha DD/MM/YYYY (o variantes) que aparece en el texto."""
    m = _RE_FECHA.search(texto)
    if not m:
        return None
    dia, mes, anyo = m.groups()
    if len(anyo) == 2:
        anyo = f'20{anyo}'
    try:
        return datetime.date(int(anyo), int(mes), int(dia))
    except ValueError:
        return None


# ------------------------------------------------------------------ numeros

def _a_decimal(texto: str) -> Decimal | None:
    """
    Convierte un numero con formato espanol ('1.234,56') a Decimal.

    Quita puntos de millares y cambia la coma decimal por punto. Si el numero
    no lleva coma se asume que el punto (si lo hay) ya es decimal, por si
    algun ticket viene con formato anglosajon suelto.
    """
    limpio = texto.strip()
    if not limpio:
        return None
    if ',' in limpio:
        limpio = limpio.replace('.', '').replace(',', '.')
    try:
        return Decimal(limpio)
    except InvalidOperation:
        return None


# ------------------------------------------------------------------ markdown

_RE_CERCA_CODIGO = re.compile(r'^\s*```')
_RE_FILA_SEPARADORA_MD = re.compile(r'^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$')


def _limpiar_markdown(texto: str) -> str:
    """
    Quita el envoltorio Markdown mas habitual sin tocar el contenido.

    El usuario pega la transcripcion tal cual la genera su herramienta, y esa
    herramienta suele meter el ticket en una tabla o en un bloque de codigo.
    Aqui solo se desmonta el envoltorio -- no se reinterpreta el contenido.
    """
    lineas_salida: list[str] = []
    for linea in texto.splitlines():
        if _RE_CERCA_CODIGO.match(linea):
            continue  # cerca de apertura/cierre de bloque de codigo, no contenido
        lineas_salida.append(linea)

    resultado: list[str] = []
    for linea in lineas_salida:
        sin_espacios = linea.strip()
        if '|' in sin_espacios:
            if _RE_FILA_SEPARADORA_MD.match(sin_espacios):
                continue  # fila separadora de tabla markdown (|---|---|)
            celdas = sin_espacios.split('|')
            # Una tabla markdown bien formada empieza y acaba con '|': las
            # celdas de los extremos quedan vacias y hay que descartarlas.
            if celdas and celdas[0].strip() == '':
                celdas = celdas[1:]
            if celdas and celdas[-1].strip() == '':
                celdas = celdas[:-1]
            linea = '  '.join(c.strip() for c in celdas)

        # Encabezados '#', negrita '**' y vinetas al principio de linea.
        linea = re.sub(r'^\s*#+\s*', '', linea)
        linea = linea.replace('**', '')
        linea = re.sub(r'^\s*[*\-]\s+', '', linea)

        resultado.append(linea)
    return '\n'.join(resultado)


# ------------------------------------------------------------- lineas a ignorar

# Cualquier aparicion de una de estas cadenas (en la linea normalizada, sin
# tildes y en mayusculas) descarta la linea como "no es un producto".
_MARCADORES_IGNORAR = [
    'NIF', 'CIF', 'TELEFONO', 'TELEFON', 'FACTURA SIMPLIFICADA', 'TOTAL',
    'IMPORT ', 'IVA', 'BASE', 'CUOTA', 'QUOTA', 'TARJETA', 'TARGETA',
    'EFECTIVO', 'EFECTIU', 'CAMBIO', 'CANVI', 'ENTREGA', 'LLIURAT',
    'DESCRIPCION', 'DESCRIPCIO', 'P. UNIT', 'IMPORTE', 'GRACIAS', 'GRACIES',
    'OP:', 'S.A.', 'C/', 'AV.', 'WWW.', 'ATENCION', 'ATENCIO', 'CAJA',
    'CAIXA', 'TERMINAL', 'AUTORIZACION', 'AUTORITZACIO',
]

_RE_SOLO_SEPARADOR = re.compile(r'^\s*[-=*]{2,}\s*$')
_RE_CP_CIUDAD = re.compile(r'^\s*\d{5}\s+[A-Za-zÀ-ÿ .\'-]+\s*$')
_RE_HAY_LETRAS = re.compile(r'[A-Za-zÀ-ÿ]')

# 'TOTAL' o 'IMPORT' seguido de lo que sea, con el ultimo numero de la linea
# como importe. Usa la linea ya sin tildes/mayusculas para reconocer el inicio.
_RE_ULTIMO_NUMERO = re.compile(r'(\d[\d.,]*)\s*$')


def _es_linea_total(normalizada: str) -> bool:
    # La cabecera real de Mercadona imprime el TOTAL con sangria (y a veces
    # con espacios/tabuladores de sobra al final), asi que hay que comparar
    # sobre la linea ya despojada de espacios, no sobre la linea tal cual.
    recortada = normalizada.strip()
    return recortada.startswith('TOTAL') or recortada == 'IMPORT'


def _contiene_marcador(normalizada: str, marcador: str) -> bool:
    """
    True si `marcador` aparece como token suelto, no como parte de otra palabra.

    Con un simple `in` de subcadenas 'IVA' aparece dentro de 'OLIVA' y
    'ACEITE OLIVA V.E.' se descartaba como si fuera la fila de impuestos.
    Aqui se exige que ni antes ni despues del marcador haya otra letra o
    digito pegados (los signos de puntuacion del propio marcador, como en
    'S.A.' o 'C/', ya sirven de limite).
    """
    patron = re.escape(marcador.rstrip())
    return re.search(rf'(?<![A-Z0-9]){patron}(?![A-Z0-9])', normalizada) is not None


def _debe_ignorarse(normalizada: str, original: str) -> bool:
    if not original.strip():
        return True
    if _RE_SOLO_SEPARADOR.match(original):
        return True
    if _RE_CP_CIUDAD.match(original):
        return True
    if not _RE_HAY_LETRAS.search(original):
        return True  # solo numeros y simbolos (p.ej. una fila de IVA): no hay nombre de producto
    for marcador in _MARCADORES_IGNORAR:
        if _contiene_marcador(normalizada, marcador):
            return True
    return False


# ---------------------------------------------------------------- patrones de linea

# 1) unidades + nombre + precio unitario + importe.
_RE_UNIDADES_PRECIO_IMPORTE = re.compile(r'^\s*(\d+)\s+(.+?)\s+(\d[\d.,]*)\s+(\d[\d.,]*)\s*$')
# 2) unidades + nombre + importe (sin precio unitario).
_RE_UNIDADES_IMPORTE = re.compile(r'^\s*(\d+)\s+(.+?)\s+(\d[\d.,]*)\s*$')
# 3) producto a peso: nombre + importe, sin unidades. Pendiente de la linea de peso.
_RE_NOMBRE_IMPORTE = re.compile(r'^\s*(.+?)\s+(\d[\d.,]*)\s*$')
# 4) continuacion de peso/volumen sobre la linea anterior.
_UNIDADES_PESO = r'kg|g|l|ml|kilo|kilos|litro|litros'
_RE_PESO_CONTINUACION = re.compile(
    rf'^\s*(\d[\d.,]*)\s*({_UNIDADES_PESO})\s+(\d[\d.,]*)\s*(?:EUR|€|E)?\s*/\s*({_UNIDADES_PESO})\s*$',
    re.IGNORECASE,
)

_NORMALIZAR_UNIDAD_PESO = {
    'kg': 'kg', 'kilo': 'kg', 'kilos': 'kg',
    'g': 'g',
    'l': 'l', 'litro': 'l', 'litros': 'l',
    'ml': 'ml',
}


def _normalizar_unidad(unidad: str) -> str:
    return _NORMALIZAR_UNIDAD_PESO.get(unidad.lower(), unidad.lower())


def _procesar_linea_producto(
    linea: str,
    lineas_ticket: list[LineaTicket],
    warnings: list[str],
) -> None:
    """Intenta interpretar `linea` como producto y, si lo consigue, la anade a `lineas_ticket`."""
    m = _RE_PESO_CONTINUACION.match(linea)
    if m:
        if not lineas_ticket:
            warnings.append(f"Linea de peso sin producto anterior al que aplicar: '{linea.strip()}'.")
            return
        cantidad = _a_decimal(m.group(1))
        precio = _a_decimal(m.group(3))
        if cantidad is None or precio is None:
            warnings.append(f"No se ha podido leer el peso/precio de la linea: '{linea.strip()}'.")
            return
        anterior = lineas_ticket[-1]
        anterior.amount = cantidad
        anterior.unit = _normalizar_unidad(m.group(2))
        anterior.unit_price = precio
        return

    m = _RE_UNIDADES_PRECIO_IMPORTE.match(linea)
    if m:
        units = _a_decimal(m.group(1))
        precio = _a_decimal(m.group(3))
        total = _a_decimal(m.group(4))
        if units is None or total is None:
            warnings.append(f"No se ha podido leer la linea: '{linea.strip()}'.")
            return
        lineas_ticket.append(LineaTicket(
            name=m.group(2).strip(),
            units=units,
            amount=units,
            unit='unit',
            unit_price=precio,
            total=total,
        ))
        return

    m = _RE_UNIDADES_IMPORTE.match(linea)
    if m:
        units = _a_decimal(m.group(1))
        total = _a_decimal(m.group(3))
        if units is None or total is None:
            warnings.append(f"No se ha podido leer la linea: '{linea.strip()}'.")
            return
        lineas_ticket.append(LineaTicket(
            name=m.group(2).strip(),
            units=units,
            amount=units,
            unit='unit',
            unit_price=None,
            total=total,
        ))
        return

    m = _RE_NOMBRE_IMPORTE.match(linea)
    if m:
        total = _a_decimal(m.group(2))
        if total is None:
            warnings.append(f"No se ha podido leer la linea: '{linea.strip()}'.")
            return
        # Sin unidades ni peso todavia: la linea siguiente (si es de peso) lo
        # completara sobre esta misma entrada.
        lineas_ticket.append(LineaTicket(
            name=m.group(1).strip(),
            units=None,
            amount=Decimal('1'),
            unit='unit',
            unit_price=None,
            total=total,
        ))
        return

    if re.search(r'\d', linea):
        # Solo avisamos si la linea PARECIA un producto (traia algun numero) y
        # no se ha podido interpretar. Una frase de prosa sin cifras nunca es
        # una linea de producto, asi que se descarta en silencio: avisar de
        # eso es ruido puro para quien revisa el ticket en la app.
        warnings.append(f"Linea no reconocida, se ignora: '{linea.strip()}'.")


# --------------------------------------------------------------------- parseo

def parsear_ticket(texto: str) -> TicketParseado:
    """
    Parsea el texto de un ticket de supermercado (castellano o catalan).

    Tolerante a proposito: una linea que no se entiende no rompe el parseo,
    solo se apunta como warning y se sigue con el resto. Con texto vacio
    devuelve un ticket vacio con warnings, nunca lanza.
    """
    warnings: list[str] = []

    if not texto or not texto.strip():
        return TicketParseado(
            supermarket='',
            date=None,
            lines=[],
            total=None,
            warnings=['El texto del ticket esta vacio.'],
        )

    limpio = _limpiar_markdown(texto)
    todas_lineas = limpio.splitlines()

    supermercado = _detectar_supermercado(todas_lineas)
    if not supermercado:
        warnings.append('No se ha reconocido el supermercado.')

    fecha = _detectar_fecha(limpio)
    if fecha is None:
        warnings.append('No se ha encontrado una fecha en el ticket.')

    lineas_ticket: list[LineaTicket] = []
    total_ticket: Decimal | None = None

    for linea in todas_lineas:
        if not linea.strip():
            continue
        normalizada = _sin_tildes(linea)

        # El total hay que extraerlo ANTES de descartar la linea, porque la
        # propia linea del total esta en la lista de marcadores a ignorar.
        if total_ticket is None and _es_linea_total(normalizada):
            m = _RE_ULTIMO_NUMERO.search(linea.strip())
            if m:
                total_ticket = _a_decimal(m.group(1))
            continue

        if _debe_ignorarse(normalizada, linea):
            continue

        _procesar_linea_producto(linea, lineas_ticket, warnings)

    if total_ticket is not None and lineas_ticket:
        suma = sum((l.total for l in lineas_ticket), Decimal('0'))
        if abs(suma - total_ticket) > Decimal('0.02'):
            warnings.append(
                f'El total del ticket ({total_ticket}) no cuadra con la suma de las lineas ({suma}).'
            )

    return TicketParseado(
        supermarket=supermercado,
        date=fecha,
        lines=lineas_ticket,
        total=total_ticket,
        warnings=warnings,
    )


# ------------------------------------------------------------------ serializacion

def _decimal_a_str_dinero(valor: Decimal | None) -> str | None:
    """
    Importes (unit_price, total) a texto: 2 decimales fijos, salvo que el
    propio valor ya traiga mas precision (p.ej. un precio por kg a 3
    decimales), en cuyo caso se conserva tal cual para no perder informacion.
    """
    if valor is None:
        return None
    exponente = valor.as_tuple().exponent
    if isinstance(exponente, int) and exponente < -2:
        return str(valor)
    return str(valor.quantize(Decimal('0.01')))


def _decimal_a_str_cantidad(valor: Decimal | None) -> str | None:
    """
    Cantidades (units, amount) a texto: se respeta la precision tal cual viene
    del ticket -- '2' para unidades sueltas, '0.760' para un peso a 3
    decimales -- sin rellenar con ceros que el ticket no traia.
    """
    if valor is None:
        return None
    return str(valor)


def a_json(ticket: TicketParseado) -> dict:
    """Serializa un TicketParseado a un dict JSON-able (ver docstring del contrato)."""
    return {
        'supermarket': ticket.supermarket,
        'date': ticket.date.isoformat() if ticket.date else None,
        'total': _decimal_a_str_dinero(ticket.total),
        'lines': [
            {
                'name': linea.name,
                'units': _decimal_a_str_cantidad(linea.units),
                'amount': _decimal_a_str_cantidad(linea.amount),
                'unit': linea.unit,
                'unit_price': _decimal_a_str_dinero(linea.unit_price),
                'total': _decimal_a_str_dinero(linea.total),
            }
            for linea in ticket.lines
        ],
        'warnings': list(ticket.warnings),
    }
