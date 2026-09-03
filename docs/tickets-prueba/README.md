# Tickets de prueba para el analisis de tickets de compra

Esta carpeta contiene tickets de compra **ficticios**, generados
artificialmente, para probar de extremo a extremo el flujo de "sube la
foto de un ticket y comprueba que se analiza bien" de la app SalazFitness.

**Ninguno de estos ficheros es un documento real.** No proceden de ningun
comercio, no representan una compra real y no deben usarse como
justificante de nada. Se han generado con el script `generar_tickets.py`
de esta misma carpeta, dibujando texto sobre una imagen en blanco con
Pillow (PIL) — no son fotografias ni escaneos.

Para dejarlo inequivocamente claro, cada ticket ficticio incluye:

- La linea `*** TICKET DE PRUEBA - DATOS FICTICIOS ***` (o su equivalente
  en catalan `*** TIQUET DE PROVA - DADES FICTICIES ***`) arriba y abajo
  del todo.
- Un NIF claramente inventado: `NIF: X-00000000`.
- Una direccion inventada: `C/ EXEMPLE, 12` / `00000 CIUDAD DE PRUEBA`.
- Telefono, numero de operacion y numero de factura simplificada de
  relleno (`900000000`, `OP: 0000001`, `0000-000-000000`).

## Ficheros

| Fichero | Contenido |
|---|---|
| `mercadona-es.png` | Imagen del ticket ficticio en castellano. |
| `mercadona-es.md` | Transcripcion en Markdown de `mercadona-es.png` (simula lo que produciria el analisis de la foto). |
| `mercadona-ca.png` | Imagen del ticket ficticio en catalan (mismos productos y precios que el de castellano). |
| `mercadona-ca.md` | Transcripcion en Markdown de `mercadona-ca.png`. |
| `generar_tickets.py` | Script Python (con Pillow) que genera los dos PNG. Permite regenerarlos si hace falta ajustar algo. |

## Contenido de la compra (igual en ambos idiomas)

Fecha del ticket: 19/08/2026 13:45

| Producto | Importe |
|---|---:|
| 2x Leche entera 1L | 1,78 € |
| Pan de molde | 1,45 € |
| Aceite de oliva V.E. | 7,80 € |
| 3x Yogur natural | 1,35 € |
| Platano (0,760 kg) | 2,28 € |
| Tomate rama (0,580 kg) | 1,74 € |
| Pechuga de pollo (0,450 kg) | 2,70 € |
| **TOTAL** | **19,10 €** |

Los mismos productos y el mismo total aparecen en la version catalana,
para poder comparar facilmente el resultado del analisis en ambos
idiomas (nombres de producto distintos, mismos precios e importes).

## Como usarlos para probar

1. Descarga `mercadona-es.png` (o `mercadona-ca.png`) a tu movil o PC,
   tal y como harias con una foto real de un ticket.
2. Subela desde la app como si fuera la foto de un ticket de compra.
3. Comprueba que el analisis extrae correctamente:
   - La fecha (19/08/2026 13:45).
   - Cada linea de producto con su cantidad/peso, precio unitario (si
     aplica) e importe.
   - El total (19,10 €).
4. Usa `mercadona-es.md` / `mercadona-ca.md` como "respuesta esperada"
   para comparar contra lo que devuelve el analisis: contienen la misma
   transcripcion de texto que lleva la imagen correspondiente.

## Regenerar las imagenes

Si necesitas volver a generar los PNG (por ejemplo tras tocar el
script), ejecuta desde la raiz del repo:

```bash
python3 docs/tickets-prueba/generar_tickets.py
```

El script:

- Usa Pillow (PIL) para dibujar el texto sobre un fondo tipo ticket
  (blanco hueso, texto negro, tipografia monoespaciada).
- Busca una fuente monoespaciada del sistema (por ejemplo
  `DejaVuSansMono.ttf`); si no la encuentra en las rutas habituales,
  intenta localizarla con `fc-list` y, en ultimo caso, usa la fuente por
  defecto de PIL para no fallar.
- No usa tesseract ni ningun motor de OCR: solo genera las imagenes, no
  las analiza.
- Es idempotente: se puede ejecutar tantas veces como se quiera y
  siempre sobrescribe los mismos dos ficheros PNG con el mismo
  contenido.
- Ademas de generar los PNG, imprime por pantalla el texto exacto que
  dibuja en cada ticket (util para comparar con los `.md` de esta
  carpeta).
