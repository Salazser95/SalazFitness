"""
Pruebas del parser de tickets de supermercado.

Usan `unittest.TestCase` a proposito, no `django.test.TestCase`: `tickets` no
importa nada de Django ni toca la base de datos (igual que `frescura`), asi
que estas pruebas se pueden ejecutar sin levantar wger, con `python -m
unittest`. El corredor de Django las recoge igual.
"""

import datetime
import unittest
from decimal import Decimal
from pathlib import Path

from salaz import tickets

# backend/salaz/tests/test_tickets.py -> repo_root/docs/tickets-prueba/*.md
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DOCS_TICKETS_PRUEBA = _REPO_ROOT / 'docs' / 'tickets-prueba'

TICKET_MERCADONA_ES = """\
MERCADONA, S.A.
C/ EXEMPLE, 12
46001 VALENCIA
TELEFONO: 963000000
NIF: A-46103834
19/08/2026 13:45   OP: 1234567
FACTURA SIMPLIFICADA: 1234-567-890123

Descripcion                P. Unit  Importe
2 LECHE ENTERA                0,89     1,78
1 PAN DE MOLDE                         1,45
1 ACEITE OLIVA V.E.           7,80     7,80
  PLATANO                              2,28
  0,760 kg      3,00 EUR/kg
  TOMATE RAMA                          1,74
  0,580 kg      3,00 EUR/kg

TOTAL (EUR)                           15,05
TARJETA BANCARIA                      15,05
IVA        BASE      CUOTA
4%         8,50       0,34
10%        3,20       0,32
"""

TICKET_MERCADONA_CA = """\
MERCADONA, S.A.
C/ EXEMPLE, 12
46001 VALENCIA
TELEFON: 963000000
NIF: A-46103834
19/08/2026 13:45   OP: 1234567
FACTURA SIMPLIFICADA: 1234-567-890123

Descripcio                 P. Unit  Import
2 LLET SENCERA                0,89     1,78
1 PA DE MOTLLE                         1,45
1 OLI OLIVA V.E.               7,80     7,80
  PLATAN                                2,28
  0,760 kg      3,00 EUR/kg
  TOMAQUET RAMA                        1,74
  0,580 kg      3,00 EUR/kg

TOTAL (EUR)                           15,05
TARGETA BANCARIA                      15,05
IVA        BASE      CUOTA
4%         8,50       0,34
10%        3,20       0,32
"""


class TestTicketMercadonaCompleto(unittest.TestCase):
    """Ticket completo, castellano y catalan, deben dar el mismo resultado numerico."""

    def test_supermercado_fecha_y_total(self):
        t = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        self.assertEqual(t.supermarket, 'Mercadona')
        self.assertEqual(t.date, datetime.date(2026, 8, 19))
        self.assertEqual(t.total, Decimal('15.05'))

    def test_numero_de_lineas_de_producto(self):
        t = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        # LECHE, PAN, ACEITE, PLATANO, TOMATE = 5 productos (las de peso son
        # continuacion, no lineas nuevas).
        self.assertEqual(len(t.lines), 5)

    def test_linea_leche_completa(self):
        t = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        leche = t.lines[0]
        self.assertEqual(leche.name, 'LECHE ENTERA')
        self.assertEqual(leche.units, Decimal('2'))
        self.assertEqual(leche.amount, Decimal('2'))
        self.assertEqual(leche.unit, 'unit')
        self.assertEqual(leche.unit_price, Decimal('0.89'))
        self.assertEqual(leche.total, Decimal('1.78'))

    def test_linea_pan_sin_precio_unitario(self):
        t = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        pan = t.lines[1]
        self.assertEqual(pan.name, 'PAN DE MOLDE')
        self.assertEqual(pan.units, Decimal('1'))
        self.assertIsNone(pan.unit_price)
        self.assertEqual(pan.total, Decimal('1.45'))

    def test_linea_producto_a_peso_platano(self):
        t = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        platano = t.lines[3]
        self.assertEqual(platano.name, 'PLATANO')
        self.assertIsNone(platano.units)
        self.assertEqual(platano.amount, Decimal('0.760'))
        self.assertEqual(platano.unit, 'kg')
        self.assertEqual(platano.unit_price, Decimal('3.00'))
        self.assertEqual(platano.total, Decimal('2.28'))

    def test_ticket_catalan_da_los_mismos_valores(self):
        es = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        ca = tickets.parsear_ticket(TICKET_MERCADONA_CA)
        self.assertEqual(ca.supermarket, es.supermarket)
        self.assertEqual(ca.date, es.date)
        self.assertEqual(ca.total, es.total)
        self.assertEqual(len(ca.lines), len(es.lines))
        for linea_ca, linea_es in zip(ca.lines, es.lines):
            self.assertEqual(linea_ca.units, linea_es.units)
            self.assertEqual(linea_ca.amount, linea_es.amount)
            self.assertEqual(linea_ca.unit, linea_es.unit)
            self.assertEqual(linea_ca.unit_price, linea_es.unit_price)
            self.assertEqual(linea_ca.total, linea_es.total)

    def test_total_cuadra_con_la_suma_de_lineas_sin_warning(self):
        t = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        mensajes = ' '.join(t.warnings)
        self.assertNotIn('no cuadra', mensajes)


class TestPatronesDeLinea(unittest.TestCase):
    def test_unidades_precio_unitario_e_importe(self):
        t = tickets.parsear_ticket('MERCADONA\n01/01/2026\n3 YOGUR NATURAL   1,20   3,60\n')
        self.assertEqual(len(t.lines), 1)
        linea = t.lines[0]
        self.assertEqual(linea.units, Decimal('3'))
        self.assertEqual(linea.unit_price, Decimal('1.20'))
        self.assertEqual(linea.total, Decimal('3.60'))

    def test_unidades_e_importe_sin_precio_unitario(self):
        t = tickets.parsear_ticket('MERCADONA\n01/01/2026\n2 HUEVOS L   2,50\n')
        linea = t.lines[0]
        self.assertEqual(linea.units, Decimal('2'))
        self.assertIsNone(linea.unit_price)
        self.assertEqual(linea.total, Decimal('2.50'))

    def test_producto_a_peso_con_continuacion_en_litros(self):
        texto = 'MERCADONA\n01/01/2026\nACEITE GIRASOL GRANEL   2,10\n1,500 l   1,40 EUR/l\n'
        t = tickets.parsear_ticket(texto)
        self.assertEqual(len(t.lines), 1)
        linea = t.lines[0]
        self.assertIsNone(linea.units)
        self.assertEqual(linea.amount, Decimal('1.500'))
        self.assertEqual(linea.unit, 'l')
        self.assertEqual(linea.unit_price, Decimal('1.40'))
        self.assertEqual(linea.total, Decimal('2.10'))

    def test_normaliza_kilos_a_kg(self):
        texto = 'MERCADONA\n01/01/2026\nPATATA   1,50\n0,500 kilos   3,00 EUR/kilo\n'
        t = tickets.parsear_ticket(texto)
        self.assertEqual(t.lines[0].unit, 'kg')

    def test_normaliza_litros_a_l(self):
        texto = 'MERCADONA\n01/01/2026\nLECHE GRANEL   1,00\n1,000 litros   1,00 EUR/litro\n'
        t = tickets.parsear_ticket(texto)
        self.assertEqual(t.lines[0].unit, 'l')

    def test_coma_decimal_y_separador_de_miles(self):
        t = tickets.parsear_ticket('MERCADONA\n01/01/2026\n1 LOTE REGALO   1.234,56\n')
        self.assertEqual(t.lines[0].total, Decimal('1234.56'))


class TestLineasIgnoradas(unittest.TestCase):
    def test_ignora_cabecera_direccion_telefono_y_nif(self):
        t = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        nombres = [l.name for l in t.lines]
        self.assertNotIn('MERCADONA, S.A.', nombres)
        for nombre in nombres:
            self.assertNotIn('NIF', nombre)
            self.assertNotIn('TELEFONO', nombre)

    def test_ignora_iva_y_tarjeta(self):
        t = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        nombres = [l.name for l in t.lines]
        self.assertNotIn('TARJETA BANCARIA', nombres)
        # Ojo: 'ACEITE OLIVA V.E.' SI debe quedar como producto -- 'OLIVA'
        # contiene 'IVA' como subcadena pero no es la fila de impuestos.
        self.assertIn('ACEITE OLIVA V.E.', nombres)
        self.assertFalse(any(n in ('IVA', 'BASE', 'CUOTA') for n in nombres))

    def test_extrae_el_total_antes_de_descartar_su_linea(self):
        t = tickets.parsear_ticket(TICKET_MERCADONA_ES)
        self.assertEqual(t.total, Decimal('15.05'))
        nombres = [l.name for l in t.lines]
        self.assertFalse(any('TOTAL' in n for n in nombres))

    def test_linea_de_peso_sin_producto_anterior_da_warning_y_no_revienta(self):
        t = tickets.parsear_ticket('MERCADONA\n01/01/2026\n0,500 kg   2,00 EUR/kg\n')
        self.assertEqual(t.lines, [])
        self.assertTrue(any('anterior' in w for w in t.warnings))

    def test_total_que_no_cuadra_da_warning_pero_no_falla(self):
        texto = 'MERCADONA\n01/01/2026\n1 PAN   1,00\nTOTAL (EUR)   99,00\n'
        t = tickets.parsear_ticket(texto)
        self.assertEqual(t.total, Decimal('99.00'))
        self.assertEqual(len(t.lines), 1)
        self.assertTrue(any('no cuadra' in w for w in t.warnings))


class TestFechas(unittest.TestCase):
    def test_formato_con_barras(self):
        t = tickets.parsear_ticket('MERCADONA\n05/03/2026\n')
        self.assertEqual(t.date, datetime.date(2026, 3, 5))

    def test_formato_con_guiones(self):
        t = tickets.parsear_ticket('MERCADONA\n05-03-2026\n')
        self.assertEqual(t.date, datetime.date(2026, 3, 5))

    def test_formato_con_puntos(self):
        t = tickets.parsear_ticket('MERCADONA\n05.03.2026\n')
        self.assertEqual(t.date, datetime.date(2026, 3, 5))

    def test_anyo_de_dos_cifras(self):
        t = tickets.parsear_ticket('MERCADONA\n05/03/26\n')
        self.assertEqual(t.date, datetime.date(2026, 3, 5))

    def test_sin_fecha_da_none_y_warning(self):
        t = tickets.parsear_ticket('MERCADONA\nsin fecha aqui\n')
        self.assertIsNone(t.date)
        self.assertTrue(any('fecha' in w for w in t.warnings))


class TestSupermercado(unittest.TestCase):
    def test_no_reconocido_da_vacio_y_warning(self):
        t = tickets.parsear_ticket('SUPER DESCONOCIDO S.L.\n01/01/2026\n1 PAN   1,00\n')
        self.assertEqual(t.supermarket, '')
        self.assertTrue(any('supermercado' in w for w in t.warnings))

    def test_reconoce_varios_supermercados(self):
        self.assertEqual(tickets.parsear_ticket('CARREFOUR\n01/01/2026\n').supermarket, 'Carrefour')
        self.assertEqual(tickets.parsear_ticket('LIDL\n01/01/2026\n').supermarket, 'Lidl')
        self.assertEqual(tickets.parsear_ticket('CONSUM\n01/01/2026\n').supermarket, 'Consum')
        self.assertEqual(tickets.parsear_ticket('BONPREU\n01/01/2026\n').supermarket, 'Bonpreu')


class TestMarkdown(unittest.TestCase):
    def test_entrada_vacia_no_revienta(self):
        t = tickets.parsear_ticket('')
        self.assertEqual(t.supermarket, '')
        self.assertIsNone(t.date)
        self.assertEqual(t.lines, [])
        self.assertIsNone(t.total)
        self.assertTrue(t.warnings)

    def test_solo_espacios_no_revienta(self):
        t = tickets.parsear_ticket('   \n   \n')
        self.assertEqual(t.lines, [])

    def test_tabla_markdown_se_parsea_igual(self):
        texto = (
            'MERCADONA\n'
            '19/08/2026\n'
            '| 2 | LECHE ENTERA | 0,89 | 1,78 |\n'
            '|---|---|---|---|\n'
        )
        t = tickets.parsear_ticket(texto)
        self.assertEqual(len(t.lines), 1)
        linea = t.lines[0]
        self.assertEqual(linea.name, 'LECHE ENTERA')
        self.assertEqual(linea.total, Decimal('1.78'))

    def test_cercas_de_codigo_se_parsean_igual(self):
        texto = '```\nMERCADONA\n19/08/2026\n2 LECHE ENTERA   0,89   1,78\n```\n'
        t = tickets.parsear_ticket(texto)
        self.assertEqual(t.supermarket, 'Mercadona')
        self.assertEqual(len(t.lines), 1)
        self.assertEqual(t.lines[0].total, Decimal('1.78'))

    def test_encabezados_y_negrita_no_estorban(self):
        texto = '# MERCADONA\n**19/08/2026**\n- 2 LECHE ENTERA   0,89   1,78\n'
        t = tickets.parsear_ticket(texto)
        self.assertEqual(t.supermarket, 'Mercadona')
        self.assertEqual(len(t.lines), 1)


class TestAJson(unittest.TestCase):
    def test_forma_exacta_del_dict(self):
        # La linea de cabecera con ", S.A." se descarta como cabecera (marcador
        # 'S.A.'), asi que no deja ningun warning de "linea no reconocida".
        texto = 'MERCADONA, S.A.\n19/08/2026\n2 LECHE ENTERA   0,89   1,78\nTOTAL (EUR)   1,78\n'
        t = tickets.parsear_ticket(texto)
        resultado = tickets.a_json(t)
        self.assertEqual(resultado, {
            'supermarket': 'Mercadona',
            'date': '2026-08-19',
            'total': '1.78',
            'lines': [{
                'name': 'LECHE ENTERA',
                'units': '2',
                'amount': '2',
                'unit': 'unit',
                'unit_price': '0.89',
                'total': '1.78',
            }],
            'warnings': [],
        })

    def test_none_se_serializa_como_null_python(self):
        t = tickets.parsear_ticket('')
        resultado = tickets.a_json(t)
        self.assertIsNone(resultado['date'])
        self.assertIsNone(resultado['total'])
        self.assertEqual(resultado['supermarket'], '')
        self.assertEqual(resultado['lines'], [])
        self.assertTrue(resultado['warnings'])

    def test_amount_de_peso_lleva_tres_decimales(self):
        texto = 'MERCADONA\n01/01/2026\nPLATANO   2,28\n0,760 kg   3,00 EUR/kg\n'
        t = tickets.parsear_ticket(texto)
        resultado = tickets.a_json(t)
        linea = resultado['lines'][0]
        self.assertEqual(linea['amount'], '0.760')
        self.assertIsNone(linea['units'])
        self.assertEqual(linea['unit'], 'kg')


class TestTotalIndentado(unittest.TestCase):
    """
    Regresion: el ticket real de Mercadona imprime el TOTAL con sangria
    (espacios delante), y la deteccion comparaba la linea sin haberle quitado
    esos espacios primero, asi que 'TOTAL'.startswith fallaba y el total se
    perdia entero.
    """

    def test_total_con_espacios_delante_se_detecta(self):
        t = tickets.parsear_ticket('MERCADONA\n01/01/2026\n1 PAN   1,00\n  TOTAL (EUR)                       19,10\n')
        self.assertEqual(t.total, Decimal('19.10'))

    def test_total_sin_espacios_delante_sigue_funcionando(self):
        t = tickets.parsear_ticket('MERCADONA\n01/01/2026\n1 PAN   1,00\nTOTAL (EUR)   19,10\n')
        self.assertEqual(t.total, Decimal('19.10'))

    def test_total_solo_la_palabra_total(self):
        t = tickets.parsear_ticket('MERCADONA\n01/01/2026\n1 PAN   1,00\nTOTAL   19,10\n')
        self.assertEqual(t.total, Decimal('19.10'))

    def test_total_con_eur_abreviado(self):
        t = tickets.parsear_ticket('MERCADONA\n01/01/2026\n1 PAN   1,00\nTOTAL (E)  19,10\n')
        self.assertEqual(t.total, Decimal('19.10'))

    def test_total_catalan_indentado_igual_que_castellano(self):
        # El ticket catalan real (docs/tickets-prueba/mercadona-ca.md) imprime
        # el TOTAL con la misma sangria que el castellano.
        t = tickets.parsear_ticket('MERCADONA\n01/01/2026\n1 PA   1,00\n  TOTAL (EUR)                       19,10\n')
        self.assertEqual(t.total, Decimal('19.10'))


class TestLineasSinDigitosNoAvisan(unittest.TestCase):
    """
    Regresion: una linea de prosa del Markdown (sin ningun numero) no puede
    ser nunca una linea de producto mal interpretada -- avisar de eso es
    ruido puro para quien revisa el ticket en la app. Solo debe avisarse
    cuando la linea SI trae algun digito y aun asi no se ha podido leer.
    """

    def test_prosa_sin_digitos_se_ignora_en_silencio(self):
        texto = (
            'MERCADONA, S.A.\n'
            '19/08/2026\n'
            'Transcripcion textual de un ticket, tal y como la produciria el\n'
            'analisis de una foto de ticket.\n'
            '1 PAN   1,00\n'
        )
        t = tickets.parsear_ticket(texto)
        self.assertEqual(len(t.lines), 1)
        for w in t.warnings:
            self.assertNotIn('Transcripcion', w)
            self.assertNotIn('analisis', w)

    def test_linea_con_digitos_no_interpretable_si_avisa(self):
        # Con un digito de por medio la linea SI parecia un producto, asi que
        # si no se consigue leer debe seguir avisando (no es ruido, es una
        # linea que de verdad se ha perdido).
        texto = 'MERCADONA\n19/08/2026\n0,760 xx   3,00 EUR/xx\n'
        t = tickets.parsear_ticket(texto)
        self.assertTrue(any('no reconocida' in w or 'anterior' in w for w in t.warnings))


class TestTicketRealDelRepo(unittest.TestCase):
    """
    Los tickets ficticios de docs/tickets-prueba/ son el fixture de
    integracion real -- Markdown con cerca de codigo, prosa de cabecera,
    separadores '---' y el TOTAL indentado tal y como lo imprime Mercadona.
    """

    def _parsear_fichero(self, nombre: str) -> tickets.TicketParseado:
        ruta = _DOCS_TICKETS_PRUEBA / nombre
        if not ruta.exists():
            self.skipTest(f'No esta el fixture {ruta} en este checkout.')
        return tickets.parsear_ticket(ruta.read_text(encoding='utf-8'))

    def test_mercadona_es_total_y_numero_de_lineas(self):
        t = self._parsear_fichero('mercadona-es.md')
        self.assertEqual(t.total, Decimal('19.10'))
        self.assertEqual(len(t.lines), 7)

    def test_mercadona_ca_total_y_numero_de_lineas(self):
        t = self._parsear_fichero('mercadona-ca.md')
        self.assertEqual(t.total, Decimal('19.10'))
        self.assertEqual(len(t.lines), 7)

    def test_mercadona_es_no_deja_warnings_de_prosa(self):
        t = self._parsear_fichero('mercadona-es.md')
        for w in t.warnings:
            self.assertNotIn('Transcripcion', w)
            self.assertNotIn('ficticio', w)


if __name__ == '__main__':
    unittest.main()
