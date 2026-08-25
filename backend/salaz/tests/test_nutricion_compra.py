"""
Pruebas del enlace entre Nutricion y Compra.

Cubren los dos sentidos:
  - los platos del plan -> la lista de la compra, repartida en tandas
  - la lista de la compra -> "esto ya esta comprado" en el diario

Se ejecutan contra el wger real, igual que test_api.py:

    python manage.py test salaz
"""

import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status

from salaz.generador_lista import anadir_cesta, generar_lista, productos_del_plan
from salaz.models import Household, IngredientPrice, ShoppingListItem
from salaz.tests.test_api import SalazApiTestCase, make_ingredient
from wger.nutrition.models import Meal, MealItem, NutritionPlan


class NutricionACompraTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='salaz1', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa')
        self.plan = NutritionPlan.objects.create(user=self.user, description='Volumen')

        self.pollo = make_ingredient(name='Pechuga de pollo')
        self.arroz = make_ingredient(name='Arroz blanco')
        self.moras = make_ingredient(name='Moras')
        self.yogur = make_ingredient(name='Yogur natural')

        self.desayuno = Meal.objects.create(plan=self.plan, order=1, name='Desayuno')
        self.comida = Meal.objects.create(plan=self.plan, order=2, name='Comida')
        self.cena = Meal.objects.create(plan=self.plan, order=3, name='Cena')

        MealItem.objects.create(meal=self.desayuno, ingredient=self.yogur, amount=Decimal('250'))
        MealItem.objects.create(meal=self.desayuno, ingredient=self.moras, amount=Decimal('50'))
        MealItem.objects.create(meal=self.comida, ingredient=self.pollo, amount=Decimal('200'))
        MealItem.objects.create(meal=self.comida, ingredient=self.arroz, amount=Decimal('100'))
        MealItem.objects.create(meal=self.cena, ingredient=self.pollo, amount=Decimal('150'))

        IngredientPrice.objects.create(
            ingredient=self.pollo,
            household=self.household,
            price=Decimal('6.50'),
            amount=Decimal('1'),
            unit=IngredientPrice.UNIT_KILOGRAM,
            date=datetime.date.today(),
            is_current=True,
        )
        self.client.force_authenticate(user=self.user)
        self.inicio = datetime.date(2026, 8, 26)

    # ------------------------------------------------- lectura del plan

    def test_un_alimento_en_dos_comidas_se_suma_en_una_linea(self):
        productos = {p.nombre: p for p in productos_del_plan(str(self.plan.pk))}
        self.assertEqual(len(productos), 4)
        self.assertEqual(productos['Pechuga de pollo'].gramos_dia, Decimal('350'))

    def test_el_origen_sigue_el_orden_del_plan(self):
        # Los MealItem se leen de una sola consulta sin `order_by`, asi que
        # llegan en el orden que quiera la base de datos. Sin ordenar
        # explicitamente, el pollo salia como "Cena, Comida".
        productos = {p.nombre: p for p in productos_del_plan(str(self.plan.pk))}
        self.assertEqual(productos['Pechuga de pollo'].origen, 'Comida, Cena')

    def test_la_cesta_no_duplica_lo_que_ya_esta_en_el_plan(self):
        productos = anadir_cesta(productos_del_plan(str(self.plan.pk)), fruta_roja=True)
        nombres = [p.nombre for p in productos]
        self.assertEqual(nombres.count('Moras'), 1)
        self.assertIn('Brocoli', nombres)

    def test_la_cesta_se_puede_pedir_sin_fruta_roja(self):
        productos = anadir_cesta([], fruta_roja=False)
        nombres = [p.nombre for p in productos]
        self.assertNotIn('Fresas', nombres)
        self.assertIn('Manzana', nombres)

    # -------------------------------------------------- reparto en tandas

    def _generar(self, days=12):
        return generar_lista(
            household=self.household,
            productos=productos_del_plan(str(self.plan.pk)),
            start_date=self.inicio,
            days=days,
            nombre=f'Compra de {days} dias',
            nutrition_plan=str(self.plan.pk),
        )

    def test_lo_que_aguanta_se_compra_una_vez_y_lo_fresco_se_reparte(self):
        lista = self._generar()
        por_nombre = {}
        for item in ShoppingListItem.objects.filter(shopping_list=lista):
            por_nombre.setdefault(item.name, []).append(item)

        self.assertEqual(len(por_nombre['Arroz blanco']), 1)
        self.assertEqual(por_nombre['Arroz blanco'][0].amount, Decimal('1200'))
        self.assertEqual(por_nombre['Arroz blanco'][0].category, 'despensa')

        # Las moras aguantan 3 dias: 12 / 3 = 4 compras pequenas.
        moras = por_nombre['Moras']
        self.assertEqual(len(moras), 4)
        self.assertEqual(
            sorted(i.buy_date for i in moras),
            [self.inicio + datetime.timedelta(days=d) for d in (0, 3, 6, 9)],
        )

    def test_las_tandas_suman_los_mismos_gramos_que_una_sola_linea(self):
        # 50 g/dia x 12 dias = 600 g, esten en una tanda o en cuatro. Es la
        # propiedad que hace que repartir no cambie lo que se come.
        lista = self._generar()
        moras = ShoppingListItem.objects.filter(shopping_list=lista, name='Moras')
        self.assertEqual(sum(i.amount for i in moras), Decimal('600'))

    def test_el_periodo_queda_cubierto_entero(self):
        lista = self._generar()
        self.assertEqual(lista.end_date, self.inicio + datetime.timedelta(days=11))
        for nombre in ('Moras', 'Arroz blanco', 'Pechuga de pollo'):
            lineas = ShoppingListItem.objects.filter(shopping_list=lista, name=nombre)
            self.assertEqual(sum(i.days_covered for i in lineas), 12, nombre)

    def test_el_precio_sale_del_precio_por_100g(self):
        # 6,50 EUR/kg -> 0,65 EUR/100 g. La primera tanda de pollo cubre 3
        # dias: 350 x 3 = 1050 g -> 6,825, que Decimal redondea a 6,82 con el
        # modo por defecto, el mismo que usa el resto del modulo.
        lista = self._generar()
        pollo = ShoppingListItem.objects.filter(
            shopping_list=lista, name='Pechuga de pollo'
        ).order_by('trip').first()
        self.assertEqual(pollo.estimated_price, Decimal('6.82'))

    def test_sin_precio_conocido_la_linea_no_se_inventa_uno(self):
        lista = self._generar()
        moras = ShoppingListItem.objects.filter(shopping_list=lista, name='Moras')
        self.assertTrue(all(i.estimated_price is None for i in moras))

    def test_el_resumen_de_tandas_cuenta_lo_comprado(self):
        lista = self._generar()
        self.assertEqual(len(lista.trips), 4)
        self.assertEqual(lista.trips[0]['buy_date'], self.inicio)
        self.assertFalse(lista.trips[0]['done'])

        ShoppingListItem.objects.filter(shopping_list=lista, trip=1).update(purchased=True)
        self.assertTrue(lista.trips[0]['done'])

    # -------------------------------------------------------- endpoints

    def test_from_nutrition_crea_la_lista(self):
        respuesta = self.client.post(
            '/api/v2/salaz/shopping-list/from-nutrition/',
            {'household': self.household.id, 'start_date': '2026-08-26', 'days': 12},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertEqual(respuesta.data['days'], 12)
        self.assertEqual(respuesta.data['nutrition_plan'], str(self.plan.pk))
        self.assertGreater(len(respuesta.data['trips']), 1)

    def test_from_nutrition_rechaza_el_hogar_de_otro(self):
        otro = User.objects.create_user(username='intruso', password='pw')
        self.client.force_authenticate(user=otro)
        respuesta = self.client.post(
            '/api/v2/salaz/shopping-list/from-nutrition/',
            {'household': self.household.id},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)

    def test_from_nutrition_valida_los_dias(self):
        for dias in (0, -1, 200):
            respuesta = self.client.post(
                '/api/v2/salaz/shopping-list/from-nutrition/',
                {'household': self.household.id, 'days': dias},
                format='json',
            )
            self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST, dias)

    def test_coverage_refleja_lo_ya_comprado(self):
        lista = self._generar()
        url = f'/api/v2/salaz/shopping-list/{lista.id}/coverage/'

        respuesta = self.client.get(url, {'date': self.inicio.isoformat()})
        estado = {m['name']: m['status'] for m in respuesta.data['meals']}
        self.assertEqual(estado['Desayuno'], 'pendiente')

        ShoppingListItem.objects.filter(shopping_list=lista, trip=1).update(purchased=True)

        respuesta = self.client.get(url, {'date': self.inicio.isoformat()})
        estado = {m['name']: m['status'] for m in respuesta.data['meals']}
        self.assertEqual(estado['Desayuno'], 'comprado')

        # El dia 5 lo cubre la segunda tanda de moras, que sigue sin comprar,
        # mientras que el yogur de la compra grande ya esta en casa.
        dia5 = (self.inicio + datetime.timedelta(days=5)).isoformat()
        respuesta = self.client.get(url, {'date': dia5})
        estado = {m['name']: m['status'] for m in respuesta.data['meals']}
        self.assertEqual(estado['Desayuno'], 'parcial')
