"""
Transcripcion de la foto de un ticket a texto, via la API de vision de Claude.

Proveedor enchufable, tal y como lo dejaba anticipado la nota de
ReceiptViewSet en api/views.py: esto solo rellena `Receipt.markdown` a partir
de la foto ya subida. El resto de la cadena (tickets.parsear_ticket(),
revisar, confirmar) no sabe ni le importa de donde ha salido ese texto -- por
eso este modulo no toca nada fuera de si mismo, y por eso es facil de quitar
o sustituir por otro proveedor el dia de manana.

Aislado de Django a proposito, igual que tickets.py: la unica dependencia
externa es el SDK oficial `anthropic`.
"""

from __future__ import annotations

import base64
import mimetypes
import os

import anthropic


class TranscripcionNoDisponible(Exception):
    """No hay ANTHROPIC_API_KEY configurada, o la clave no es valida."""


class TranscripcionFallida(Exception):
    """La llamada a Claude ha fallado, o no ha devuelto texto util."""


_TIPOS_SOPORTADOS = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}

# El formato de linea tiene que casar con lo que tickets.py sabe interpretar
# (ver sus _RE_UNIDADES_PRECIO_IMPORTE / _RE_UNIDADES_IMPORTE / _RE_NOMBRE_IMPORTE
# / _RE_PESO_CONTINUACION): se le pide a Claude que transcriba, no que
# reformatee a su manera.
_PROMPT = """Transcribe este ticket de supermercado a texto plano, linea por linea, tal \
y como aparece impreso. No traduzcas ni corrijas nada, ni siquiera erratas: copia \
los nombres de producto exactamente como estan escritos en la foto.

Usa este formato de linea (los numeros con coma decimal, como en un ticket espanol):

- Producto con unidades, precio unitario e importe: "2 PAN DE MOLDE 1,50 3,00"
- Producto con unidades e importe, sin precio unitario: "3 YOGUR NATURAL 2,10"
- Producto a peso: dos lineas seguidas, el nombre y el importe primero, y justo \
debajo el peso con su precio por kg o litro, por ejemplo:
  "TOMATE PERA 1,85"
  "0,760 kg 2,50 EUR/kg"
- Incluye tambien, cada una en su propia linea y donde aparezcan en el ticket: el \
nombre del supermercado, la fecha en formato DD/MM/AAAA, y la linea del TOTAL con \
su importe.

No inventes ninguna linea que no veas en la foto. No anadas explicaciones, \
encabezados ni Markdown: devuelve solo las lineas transcritas, una por linea."""


def transcribir_ticket(imagen_bytes: bytes, nombre_archivo: str) -> str:
    """
    Manda la foto del ticket a Claude y devuelve el texto transcrito.

    Ese texto es exactamente lo que el usuario habria pegado a mano: queda
    en `Receipt.markdown` para que lo revise (y corrija si hace falta) antes
    de llamar a /analizar/, nunca se analiza aqui directamente.
    """
    api_key = os.environ.get('ANTHROPIC_API_KEY', '').strip()
    if not api_key:
        raise TranscripcionNoDisponible('No hay ANTHROPIC_API_KEY configurada en el servidor.')

    media_type = mimetypes.guess_type(nombre_archivo)[0] or 'image/jpeg'
    if media_type not in _TIPOS_SOPORTADOS:
        media_type = 'image/jpeg'
    imagen_b64 = base64.standard_b64encode(imagen_bytes).decode('ascii')

    client = anthropic.Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model='claude-opus-5',
            max_tokens=4096,
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'source': {'type': 'base64', 'media_type': media_type, 'data': imagen_b64},
                    },
                    {'type': 'text', 'text': _PROMPT},
                ],
            }],
        )
    except anthropic.AuthenticationError as exc:
        raise TranscripcionNoDisponible('La clave de Claude configurada no es valida.') from exc
    except anthropic.APIStatusError as exc:
        raise TranscripcionFallida(f'Claude no ha podido procesar la foto ({exc.status_code}).') from exc
    except anthropic.APIConnectionError as exc:
        raise TranscripcionFallida('No se ha podido contactar con Claude.') from exc

    texto = '\n'.join(bloque.text for bloque in response.content if bloque.type == 'text').strip()
    if not texto:
        raise TranscripcionFallida('Claude no ha devuelto ningun texto para esta foto.')
    return texto
