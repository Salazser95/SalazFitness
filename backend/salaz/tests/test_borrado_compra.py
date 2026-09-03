"""
Borrar una lista de la compra entera, y quitar un producto de todas sus
tandas de una vez sin depender de comparar nombres (ver group_key en
ShoppingListItem y salaz/generador_lista.py).
"""

import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status

from salaz.generador_lista import productos_del_plan
from salaz.models import Household, ShoppingList, ShoppingListItem
from salaz.tests.test_api import SalazApiTestCase, make_ingredient
from wger.nutrition.models import Meal, MealItem, NutritionPlan


class BorrarListaTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='borra1', password='pw')
        self.otro = User.objects.create_user(username='borra2', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa')
        self.otro_household = Household.objects.create(owner=self.otro, name='Casa ajena')
        self.lista = ShoppingList.objects.create(
            household=self.household,
            name='Lista de prueba',
            start_date='2026-09-01',
            end_date='2026-09-12',
            days=12,
        )
        ShoppingListItem.objects.create(
            shopping_list=self.lista, name='Arroz', amount=Decimal('500'), unit='g'
        )
        ShoppingListItem.objects.create(
            shopping_list=self.lista, name='Aceite', amount=Decimal('250'), unit='g'
        )
        self.client.force_authenticate(user=self.user)

    def test_borrar_la_lista_borra_tambien_sus_lineas(self):
        # DELETE de ShoppingList cascada a sus ShoppingListItem (FK on_delete
        # CASCADE): no debe quedar ninguna linea huerfana en la base.
        lista_id = self.lista.id
        respuesta = self.client.delete(f'/api/v2/salaz/shopping-list/{lista_id}/')
        self.assertEqual(respuesta.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ShoppingList.objects.filter(id=lista_id).exists())
        self.assertEqual(ShoppingListItem.objects.filter(shopping_list_id=lista_id).count(), 0)

    def test_no_se_puede_borrar_la_lista_de_otro_hogar(self):
        ajena = ShoppingList.objects.create(
            household=self.otro_household,
            name='Ajena',
            start_date='2026-09-01',
            end_date='2026-09-12',
        )
        respuesta = self.client.delete(f'/api/v2/salaz/shopping-list/{ajena.id}/')
        # get_queryset filtra por household__owner: para este usuario esa fila
        # no "existe", asi que DRF responde 404, no 403 (no delata que existe).
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(ShoppingList.objects.filter(id=ajena.id).exists())


class QuitarProductoDeTodasLasTandasTests(SalazApiTestCase):
    """
    Usa el mismo generador que produccion (productos_del_plan + generar_lista
    via el endpoint from-nutrition) para que las pruebas cubran group_key tal
    como sale de verdad, no un escenario fabricado a mano.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='quitar1', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa')
        self.plan = NutritionPlan.objects.create(user=self.user, description='Prueba')
        self.moras = make_ingredient(name='Moras')
        self.arroz = make_ingredient(name='Arroz')

        desayuno = Meal.objects.create(plan=self.plan, order=1, name='Desayuno')
        MealItem.objects.create(meal=desayuno, ingredient=self.moras, amount=Decimal('50'))
        MealItem.objects.create(meal=desayuno, ingredient=self.arroz, amount=Decimal('100'))

        self.client.force_authenticate(user=self.user)
        respuesta = self.client.post(
            '/api/v2/salaz/shopping-list/from-nutrition/',
            {
                'household': self.household.id,
                'start_date': '2026-09-01',
                'days': 12,
                'include_produce': False,
            },
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.lista_id = respuesta.data['id']

    def _lineas(self, nombre):
        return list(
            ShoppingListItem.objects.filter(shopping_list_id=self.lista_id, name=nombre)
        )

    def test_las_tandas_de_un_producto_comparten_group_key(self):
        # Las moras (3 dias de vida) salen en 4 tandas en un periodo de 12.
        moras = self._lineas('Moras')
        self.assertEqual(len(moras), 4)
        claves = {i.group_key for i in moras}
        self.assertEqual(len(claves), 1, 'las 4 tandas de moras deben compartir un solo group_key')

    def test_productos_distintos_no_comparten_group_key(self):
        moras = self._lineas('Moras')[0]
        arroz = self._lineas('Arroz')[0]
        self.assertNotEqual(moras.group_key, arroz.group_key)

    def test_quitar_por_grupo_borra_las_cuatro_tandas_de_una_vez(self):
        moras = self._lineas('Moras')
        clave = moras[0].group_key
        self.assertEqual(len(moras), 4)

        respuesta = self.client.delete(f'/api/v2/salaz/shopping-list-item/by-group/{clave}/')
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        self.assertEqual(respuesta.data['deleted'], 4)
        self.assertEqual(len(self._lineas('Moras')), 0)
        # Un producto distinto con el mismo... no, aqui comprobamos que no se
        # ha tocado nada mas: el arroz sigue entero.
        self.assertEqual(len(self._lineas('Arroz')), 1)

    def test_quitar_por_grupo_inexistente_da_404(self):
        respuesta = self.client.delete(
            '/api/v2/salaz/shopping-list-item/by-group/00000000-0000-0000-0000-000000000000/'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)

    def test_quitar_por_grupo_no_toca_lineas_de_otro_hogar(self):
        """
        Aunque el group_key de otro hogar se pudiera adivinar (es un uuid4,
        en la practica no), get_queryset esta filtrado por
        shopping_list__household__owner: la fila de otro usuario nunca entra
        en el `filter(group_key=...)` de la vista, asi que el 404 aqui no es
        un accidente de que el uuid no coincida, es que la vista ni la ve.
        """
        otro = User.objects.create_user(username='ajeno', password='pw')
        otro_hogar = Household.objects.create(owner=otro, name='Otra casa')
        otra_lista = ShoppingList.objects.create(
            household=otro_hogar, name='Otra', start_date='2026-09-01', end_date='2026-09-12'
        )
        ajena = ShoppingListItem.objects.create(
            shopping_list=otra_lista, name='Cafe', amount=Decimal('200'), unit='g'
        )

        respuesta = self.client.delete(
            f'/api/v2/salaz/shopping-list-item/by-group/{ajena.group_key}/'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(ShoppingListItem.objects.filter(id=ajena.id).exists())


class GroupKeyManualTests(SalazApiTestCase):
    """Lineas creadas a mano (no por el generador) nacen con su propio grupo."""

    def setUp(self):
        self.user = User.objects.create_user(username='manual1', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa')
        self.lista = ShoppingList.objects.create(
            household=self.household, name='Manual', start_date='2026-09-01', end_date='2026-09-12'
        )
        self.client.force_authenticate(user=self.user)

    def test_dos_lineas_manuales_con_el_mismo_nombre_no_comparten_grupo(self):
        """
        Esto es justo lo que el agrupado por nombre en el cliente NO
        garantizaba: dos lineas de texto libre con el mismo nombre en la
        misma lista son productos independientes salvo que el backend diga
        lo contrario (compartiendo group_key a proposito, como hace el
        generador con las tandas).
        """
        r1 = self.client.post(
            '/api/v2/salaz/shopping-list-item/',
            {'shopping_list': self.lista.id, 'name': 'Miel', 'amount': '1', 'unit': 'unit'},
            format='json',
        )
        r2 = self.client.post(
            '/api/v2/salaz/shopping-list-item/',
            {'shopping_list': self.lista.id, 'name': 'Miel', 'amount': '1', 'unit': 'unit'},
            format='json',
        )
        self.assertEqual(r1.status_code, status.HTTP_201_CREATED, r1.data)
        self.assertEqual(r2.status_code, status.HTTP_201_CREATED, r2.data)
        self.assertNotEqual(r1.data['group_key'], r2.data['group_key'])

        # Borrar el grupo de la primera no debe tocar la segunda.
        respuesta = self.client.delete(
            f"/api/v2/salaz/shopping-list-item/by-group/{r1.data['group_key']}/"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data['deleted'], 1)
        self.assertTrue(ShoppingListItem.objects.filter(id=r2.data['id']).exists())

    def test_group_key_no_se_puede_forzar_desde_el_cliente(self):
        # Es de solo lectura: aceptar un group_key del cliente permitiria
        # fusionar (o robar el borrado de) productos que no tienen relacion.
        respuesta = self.client.post(
            '/api/v2/salaz/shopping-list-item/',
            {
                'shopping_list': self.lista.id,
                'name': 'Sal',
                'amount': '1',
                'unit': 'unit',
                'group_key': 'lo-que-sea',
            },
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertNotEqual(respuesta.data['group_key'], 'lo-que-sea')
