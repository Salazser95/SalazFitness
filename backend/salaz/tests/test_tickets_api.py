"""
El ticket de la compra, de punta a punta: subir -> analizar -> confirmar, y
que al confirmar aparezca de verdad en Compras, en la Despensa y en la Lista.

Las pruebas del parser en si (que lee bien un ticket en castellano o en
catalan) estan en test_tickets.py: aqui solo se comprueba el camino completo
por la API y que confirmar no duplique nada.
"""

import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status

from salaz.models import (
    Household,
    PantryItem,
    Purchase,
    PurchaseItem,
    Receipt,
    ShoppingList,
    ShoppingListItem,
)
from salaz.tests.test_api import SalazApiTestCase

# El mismo ticket ficticio que se genera en docs/tickets-prueba/ (ver el
# README de ahi). Se copia aqui a proposito en vez de leer el fichero: una
# prueba no deberia romperse porque alguien regenere una imagen de ejemplo.
TICKET_MERCADONA_ES = """
*** TICKET DE PRUEBA - DATOS FICTICIOS ***
            MERCADONA, S.A.
             C/ EXEMPLE, 12
         00000 CIUDAD DE PRUEBA
          TELEFONO: 900000000
            NIF: X-00000000
----------------------------------------
19/08/2026 13:45     OP: 0000001
FACTURA SIMPLIFICADA: 0000-000-000000
----------------------------------------
  Descripcion             P.Unit  Importe
----------------------------------------
2 LECHE ENTERA 1L           0,89     1,78
1 PAN DE MOLDE                       1,45
1 ACEITE OLIVA V.E.         7,80     7,80
3 YOGUR NATURAL             0,45     1,35
  PLATANO                            2,28
    0,760 kg      3,00 EUR/kg
  TOMATE RAMA                        1,74
    0,580 kg      3,00 EUR/kg
1 PECHUGA POLLO                      2,70
    0,450 kg      6,00 EUR/kg
----------------------------------------
  TOTAL (EUR)                       19,10
  TARJETA BANCARIA                  19,10
----------------------------------------
IVA         BASE     CUOTA
4%          8,27      0,33
10%         9,55      0,95
----------------------------------------
         GRACIAS POR SU VISITA
     (TICKET FICTICIO - NO VALIDO)
*** TICKET DE PRUEBA - DATOS FICTICIOS ***
"""


class TicketApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='nuria', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Nuria')
        self.client.force_authenticate(user=self.user)

    # ------------------------------------------------------------- utilidades

    def _crear(self, markdown=TICKET_MERCADONA_ES):
        respuesta = self.client.post(
            '/api/v2/salaz/receipt/',
            {'household': self.household.id, 'markdown': markdown},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        return respuesta.data['id']

    def _analizar(self, receipt_id, markdown=None):
        cuerpo = {} if markdown is None else {'markdown': markdown}
        return self.client.post(f'/api/v2/salaz/receipt/{receipt_id}/analizar/', cuerpo, format='json')

    def _confirmar(self, receipt_id):
        return self.client.post(f'/api/v2/salaz/receipt/{receipt_id}/confirmar/', {}, format='json')

    # ------------------------------------------------------------------ subir

    def test_crear_ticket_empieza_pendiente(self):
        respuesta = self.client.post(
            '/api/v2/salaz/receipt/',
            {'household': self.household.id, 'markdown': TICKET_MERCADONA_ES},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertEqual(respuesta.data['status'], Receipt.PENDIENTE)
        self.assertIsNone(respuesta.data['purchase'])

    def test_no_se_puede_subir_un_ticket_al_hogar_de_otro(self):
        otro = User.objects.create_user(username='otro-ticket', password='pw')
        hogar_ajeno = Household.objects.create(owner=otro, name='Casa Ajena')
        respuesta = self.client.post(
            '/api/v2/salaz/receipt/',
            {'household': hogar_ajeno.id, 'markdown': TICKET_MERCADONA_ES},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Receipt.objects.filter(household=hogar_ajeno).exists())

    def test_crear_ticket_exige_hogar(self):
        respuesta = self.client.post(
            '/api/v2/salaz/receipt/', {'markdown': TICKET_MERCADONA_ES}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_otro_usuario_no_ve_el_ticket_ajeno(self):
        receipt_id = self._crear()
        otro = User.objects.create_user(username='fisgon', password='pw')
        self.client.force_authenticate(user=otro)
        self.assertEqual(
            self.client.get(f'/api/v2/salaz/receipt/{receipt_id}/').status_code,
            status.HTTP_404_NOT_FOUND,
        )

    # --------------------------------------------------------------- analizar

    def test_analizar_extrae_cabecera_y_lineas(self):
        receipt_id = self._crear()
        respuesta = self._analizar(receipt_id)
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        self.assertEqual(respuesta.data['status'], Receipt.ANALIZADO)
        self.assertEqual(respuesta.data['supermarket'], 'Mercadona')
        self.assertEqual(respuesta.data['date'], '2026-08-19')
        self.assertEqual(Decimal(respuesta.data['total']), Decimal('19.10'))
        self.assertEqual(len(respuesta.data['parsed']['lines']), 7)

    def test_analizar_reconoce_el_peso_de_la_fruta(self):
        receipt_id = self._crear()
        respuesta = self._analizar(receipt_id)
        por_nombre = {l['name']: l for l in respuesta.data['parsed']['lines']}
        platano = por_nombre['PLATANO']
        self.assertEqual(platano['unit'], 'kg')
        self.assertEqual(Decimal(platano['amount']), Decimal('0.760'))
        self.assertEqual(Decimal(platano['unit_price']), Decimal('3.00'))
        self.assertEqual(Decimal(platano['total']), Decimal('2.28'))

    def test_analizar_admite_corregir_el_texto_en_la_misma_llamada(self):
        receipt_id = self._crear(markdown='texto que no es un ticket')
        respuesta = self._analizar(receipt_id, markdown=TICKET_MERCADONA_ES)
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        self.assertEqual(respuesta.data['status'], Receipt.ANALIZADO)
        self.assertEqual(respuesta.data['supermarket'], 'Mercadona')

    def test_analizar_sin_texto_da_error_util(self):
        receipt_id = self._crear(markdown='')
        respuesta = self._analizar(receipt_id)
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(respuesta.data['status'], Receipt.ERROR)
        self.assertTrue(respuesta.data['error'])

    # -------------------------------------------------------------- confirmar

    def test_no_se_puede_confirmar_sin_analizar(self):
        receipt_id = self._crear()
        respuesta = self._confirmar(receipt_id)
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Purchase.objects.filter(household=self.household).exists())

    def test_confirmar_crea_la_compra_con_todas_sus_lineas(self):
        receipt_id = self._crear()
        self._analizar(receipt_id)
        respuesta = self._confirmar(receipt_id)
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertEqual(respuesta.data['status'], Receipt.CONFIRMADO)

        compra = Purchase.objects.get(household=self.household)
        self.assertEqual(compra.date, datetime.date(2026, 8, 19))
        self.assertEqual(compra.supermarket, 'Mercadona')
        self.assertEqual(compra.items.count(), 7)
        # El total de la compra tiene que cuadrar con el del ticket.
        self.assertEqual(compra.total_cost, Decimal('19.10'))

    def test_confirmar_llena_la_despensa(self):
        receipt_id = self._crear()
        self._analizar(receipt_id)
        self._confirmar(receipt_id)

        despensa = {p.name: p for p in PantryItem.objects.filter(household=self.household)}
        self.assertEqual(len(despensa), 7)
        # Lo que va por unidades entra como unidades...
        self.assertEqual(despensa['LECHE ENTERA 1L'].unit, 'unit')
        self.assertEqual(despensa['LECHE ENTERA 1L'].amount, Decimal('2.00'))
        # ...y lo que va a peso entra en kg, no en unidades.
        self.assertEqual(despensa['PLATANO'].unit, 'kg')
        self.assertEqual(despensa['PLATANO'].amount, Decimal('0.76'))

    def test_confirmar_dos_veces_no_duplica_la_compra(self):
        receipt_id = self._crear()
        self._analizar(receipt_id)
        primera = self._confirmar(receipt_id)
        segunda = self._confirmar(receipt_id)

        self.assertEqual(segunda.status_code, status.HTTP_200_OK, segunda.data)
        self.assertEqual(segunda.data['purchase'], primera.data['purchase'])
        self.assertEqual(Purchase.objects.filter(household=self.household).count(), 1)
        self.assertEqual(PurchaseItem.objects.filter(purchase__household=self.household).count(), 7)
        # Y sobre todo: la despensa no se ha llenado dos veces.
        self.assertEqual(
            PantryItem.objects.get(household=self.household, name='LECHE ENTERA 1L').amount,
            Decimal('2.00'),
        )

    def test_no_se_puede_reanalizar_un_ticket_ya_confirmado(self):
        receipt_id = self._crear()
        self._analizar(receipt_id)
        self._confirmar(receipt_id)
        respuesta = self._analizar(receipt_id)
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------- enlace con la Lista

    def test_confirmar_marca_lo_que_estaba_en_la_lista_de_la_compra(self):
        lista = ShoppingList.objects.create(
            household=self.household, name='Lista de la semana',
            start_date=datetime.date(2026, 8, 19), end_date=datetime.date(2026, 8, 26),
        )
        en_la_lista = ShoppingListItem.objects.create(
            shopping_list=lista, name='Platano', amount=Decimal('1'), unit='kg',
            estimated_price=Decimal('3.00'),
        )
        fuera_de_la_lista = ShoppingListItem.objects.create(
            shopping_list=lista, name='Cafe molido', amount=Decimal('1'), unit='unit',
            estimated_price=Decimal('4.00'),
        )

        receipt_id = self._crear()
        self._analizar(receipt_id)
        self._confirmar(receipt_id)

        en_la_lista.refresh_from_db()
        fuera_de_la_lista.refresh_from_db()
        # 'PLATANO' del ticket casa con 'Platano' de la lista (nombre
        # normalizado, sin tildes ni mayusculas).
        self.assertTrue(en_la_lista.purchased)
        # Lo que no venia en el ticket sigue pendiente.
        self.assertFalse(fuera_de_la_lista.purchased)

    def test_marcar_desde_la_lista_no_crea_una_segunda_compra(self):
        """
        La linea de la lista que ya cubre el ticket queda enlazada a la
        PurchaseItem del ticket. Esa es la pieza que evita que el camino del
        ciclo 6 (_sincronizar_compra_real) cree una compra aparte por lo
        mismo, duplicando el gasto y la despensa.
        """
        lista = ShoppingList.objects.create(
            household=self.household, name='Lista de la semana',
            start_date=datetime.date(2026, 8, 19), end_date=datetime.date(2026, 8, 26),
        )
        item = ShoppingListItem.objects.create(
            shopping_list=lista, name='Platano', amount=Decimal('1'), unit='kg',
            estimated_price=Decimal('3.00'),
        )

        receipt_id = self._crear()
        self._analizar(receipt_id)
        self._confirmar(receipt_id)

        item.refresh_from_db()
        self.assertTrue(item.purchased)
        self.assertEqual(Purchase.objects.filter(household=self.household).count(), 1)
        # La linea de la compra que cubre ese producto apunta a la de la lista.
        linea = PurchaseItem.objects.get(shopping_list_item=item)
        self.assertEqual(linea.name, 'PLATANO')

    def test_sin_lista_activa_el_ticket_se_confirma_igual(self):
        receipt_id = self._crear()
        self._analizar(receipt_id)
        respuesta = self._confirmar(receipt_id)
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertEqual(Purchase.objects.filter(household=self.household).count(), 1)

    # ----------------------------------------------- Resumen / Hogar / borrado

    def test_la_compra_del_ticket_cuenta_en_el_resumen_del_hogar(self):
        receipt_id = self._crear()
        self._analizar(receipt_id)
        self._confirmar(receipt_id)

        respuesta = self.client.get(f'/api/v2/salaz/household/{self.household.id}/summary/?days=3650')
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        self.assertEqual(Decimal(respuesta.data['total']), Decimal('19.10'))

    def test_borrar_el_ticket_no_borra_la_compra_ya_confirmada(self):
        receipt_id = self._crear()
        self._analizar(receipt_id)
        self._confirmar(receipt_id)
        compra_id = Receipt.objects.get(pk=receipt_id).purchase_id

        respuesta = self.client.delete(f'/api/v2/salaz/receipt/{receipt_id}/')
        self.assertEqual(respuesta.status_code, status.HTTP_204_NO_CONTENT)
        # La compra es un dato de gasto ya real: quitar el justificante no lo
        # deshace (para eso se borra la compra desde Compras).
        self.assertTrue(Purchase.objects.filter(pk=compra_id).exists())
