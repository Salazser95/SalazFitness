"""
Pruebas de exportar_datos_usuario / importar_datos_usuario (ver
salaz/exportacion.py): exportar el contenido de una cuenta y volver a
montarlo para OTRA cuenta tiene que reproducir los datos, resolviendo cada
alimento por nombre en vez de copiar ids que en la cuenta destino podrian
significar otra cosa.

No cubre entreno (rutinas/dias/ejercicios) con una comprobacion de punto a
punto: montar una rutina de verdad necesita fixtures de wger (unidades de
repeticion/peso, un Exercise con su Translation) que esta suite no trae
todavia. Se comprueba en cambio que exportar/importar sin ninguna rutina no
rompe nada -- la cadena de entreno en si se apoya en los mismos endpoints
que ya prueba wger, y en salaz/tests/test_reprogramacion_entreno.py para la
parte propia (WorkoutReschedule/WorkoutDaySkip).

    python manage.py test salaz.tests.test_exportacion
"""

import datetime
from decimal import Decimal

from django.contrib.auth.models import User

from salaz.exportacion import exportar_datos_usuario, importar_datos_usuario
from salaz.models import Household, PantryItem, Purchase, PurchaseItem
from salaz.tests.test_api import SalazApiTestCase, make_ingredient
from wger.nutrition.models import Meal, MealItem, NutritionPlan
from wger.weight.models import WeightEntry


class ExportarImportarTests(SalazApiTestCase):
    def setUp(self):
        self.origen = User.objects.create_user(username='origen', password='pw')
        self.destino = User.objects.create_user(username='destino', password='pw')

        self.pollo = make_ingredient(name='Pechuga de pollo')
        self.arroz = make_ingredient(name='Arroz blanco')

        self.plan = NutritionPlan.objects.create(
            user=self.origen, description='Volumen', only_logging=True,
            goal_energy=2600, goal_protein=180, goal_carbohydrates=260, goal_fat=80,
        )
        self.comida = Meal.objects.create(plan=self.plan, order=1, name='Comida')
        MealItem.objects.create(meal=self.comida, ingredient=self.pollo, amount=Decimal('200'))
        MealItem.objects.create(meal=self.comida, ingredient=self.arroz, amount=Decimal('100'))

        WeightEntry.objects.create(user=self.origen, date='2026-08-01', weight=Decimal('78.4'))
        WeightEntry.objects.create(user=self.origen, date='2026-08-15', weight=Decimal('77.9'))

        self.household = Household.objects.create(owner=self.origen, name='Casa de prueba')
        PantryItem.objects.create(household=self.household, ingredient=self.arroz, unit='g', amount=Decimal('1000'))
        compra = Purchase.objects.create(household=self.household, date='2026-08-10', supermarket='Mercadona')
        PurchaseItem.objects.create(
            purchase=compra, ingredient=self.pollo, amount=Decimal('400'), unit='g',
            price=Decimal('3.20'), purchased=True,
        )

    def test_exportar_incluye_lo_creado_en_setup(self):
        datos = exportar_datos_usuario(self.origen)

        self.assertEqual(datos['version'], 1)
        self.assertEqual({e['date'] for e in datos['peso']['entradas']}, {'2026-08-01', '2026-08-15'})

        planes = datos['nutricion']['planes']
        self.assertEqual(len(planes), 1)
        [comida] = planes[0]['comidas']
        nombres = {item['ingrediente']['name'] for item in comida['meal_items']}
        self.assertEqual(nombres, {'Pechuga de pollo', 'Arroz blanco'})

        self.assertEqual(datos['compra']['hogar_nombre'], 'Casa de prueba')
        self.assertEqual(len(datos['compra']['despensa']), 1)
        self.assertEqual(len(datos['compra']['compras']), 1)

    def test_importar_reproduce_el_contenido_para_otro_usuario(self):
        datos = exportar_datos_usuario(self.origen)

        # La cuenta destino ya tiene SUS PROPIOS alimentos con otros ids:
        # importar_datos_usuario tiene que casarlos por nombre, no por id.
        make_ingredient(name='Pechuga de pollo')
        make_ingredient(name='Arroz blanco')

        informe = importar_datos_usuario(self.destino, datos)

        self.assertEqual(informe['fallos'], [])

        plan_destino = NutritionPlan.objects.get(user=self.destino, description='Volumen')
        items = MealItem.objects.filter(meal__plan=plan_destino)
        self.assertEqual(
            {i.ingredient.name for i in items},
            {'Pechuga de pollo', 'Arroz blanco'},
        )
        # Y NO son los mismos objetos Ingredient que los del origen: se
        # resolvieron contra el catalogo propio del destino.
        self.assertNotEqual({i.ingredient_id for i in items}, {self.pollo.id, self.arroz.id})

        self.assertEqual(
            set(WeightEntry.objects.filter(user=self.destino).values_list('date', flat=True)),
            {datetime.date(2026, 8, 1), datetime.date(2026, 8, 15)},
        )

        hogar_destino = Household.objects.get(owner=self.destino, name='Casa de prueba')
        self.assertEqual(PantryItem.objects.filter(household=hogar_destino).count(), 1)
        self.assertEqual(Purchase.objects.filter(household=hogar_destino).count(), 1)

    def test_importar_es_re_ejecutable_sin_duplicar_lo_grueso(self):
        datos = exportar_datos_usuario(self.origen)
        importar_datos_usuario(self.destino, datos)
        importar_datos_usuario(self.destino, datos)

        self.assertEqual(NutritionPlan.objects.filter(user=self.destino, description='Volumen').count(), 1)
        self.assertEqual(WeightEntry.objects.filter(user=self.destino).count(), 2)
