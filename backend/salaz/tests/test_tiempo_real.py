"""
Sincronizacion en tiempo real (SSE): ChangeFeed, los signals que lo
alimentan y el endpoint eventos_sse.

El endpoint en si hace streaming (bucle con time.sleep de por medio, ver
salaz/api/views.py:_stream_eventos), asi que deliberadamente NO se consume
`response.streaming_content` en ningun test de aqui: eso colgaria la prueba
hasta el tope de vida de 5 minutos. Lo que se prueba a fondo es la parte
determinista, extraida a funciones puras (_cambios_desde, _formatear_evento,
_hogares_visibles), y del endpoint solo se comprueba lo que no hace falta
iterar: el codigo de estado y las cabeceras.
"""

import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status

from salaz.api.views import _cambios_desde, _formatear_evento, _hogares_visibles
from salaz.models import (
    ChangeFeed,
    Household,
    HouseholdMember,
    IngredientPrice,
    PantryItem,
    Purchase,
    PurchaseItem,
    Receipt,
    Recipe,
    RecipeIngredient,
    ShoppingList,
    ShoppingListItem,
    WeeklyPlan,
)
from salaz.signals import podar_cambios_viejos
from salaz.tests.test_api import SalazApiTestCase, make_ingredient


class CambiosPorModeloTests(SalazApiTestCase):
    """Cada modelo con ambito de hogar deja una fila de ChangeFeed al guardarse."""

    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Alice')
        self.ingredient = make_ingredient()

    def _ultimo_cambio(self):
        return ChangeFeed.objects.order_by('-id').first()

    def test_pantry_item(self):
        PantryItem.objects.create(household=self.household, name='Arroz', unit='kg', amount=Decimal('1'))
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'pantry-item')
        self.assertEqual(cambio.household_id, self.household.id)

    def test_purchase(self):
        Purchase.objects.create(
            household=self.household, date=datetime.date.today(), description='Compra', covers_days=7,
        )
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'purchase')
        self.assertEqual(cambio.household_id, self.household.id)

    def test_purchase_item(self):
        purchase = Purchase.objects.create(
            household=self.household, date=datetime.date.today(), description='Compra', covers_days=7,
        )
        PurchaseItem.objects.create(
            purchase=purchase, name='Pan', amount=Decimal('1'), unit='unit', price=Decimal('1.20'),
        )
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'purchase-item')
        # El household sale de purchase.household, no de un campo directo.
        self.assertEqual(cambio.household_id, self.household.id)

    def test_shopping_list_item(self):
        lista = ShoppingList.objects.create(
            household=self.household, name='Lista', start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 1, 12),
        )
        ShoppingListItem.objects.create(
            shopping_list=lista, name='Moras', amount=Decimal('0.25'), unit='kg',
            estimated_price=Decimal('2.50'), trip=1, buy_date=datetime.date(2026, 1, 1),
        )
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'shopping-list-item')
        self.assertEqual(cambio.household_id, self.household.id)

    def test_receipt(self):
        Receipt.objects.create(household=self.household)
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'receipt')
        self.assertEqual(cambio.household_id, self.household.id)

    def test_recipe(self):
        Recipe.objects.create(household=self.household, name='Arroz', servings=2)
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'recipe')
        self.assertEqual(cambio.household_id, self.household.id)

    # El resto de entidades del mapa, para no dejar ninguna sin cubrir.

    def test_household(self):
        # Se crea uno nuevo (el de setUp ya genero su propia fila).
        nuevo = Household.objects.create(owner=self.user, name='Casa nueva')
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'household')
        self.assertEqual(cambio.household_id, nuevo.id)

    def test_household_member(self):
        HouseholdMember.objects.create(household=self.household, name='Alice', consumption_share=Decimal('100'))
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'household-member')
        self.assertEqual(cambio.household_id, self.household.id)

    def test_shopping_list(self):
        ShoppingList.objects.create(
            household=self.household, name='Lista', start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 1, 12),
        )
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'shopping-list')
        self.assertEqual(cambio.household_id, self.household.id)

    def test_recipe_ingredient(self):
        receta = Recipe.objects.create(household=self.household, name='Arroz', servings=2)
        RecipeIngredient.objects.create(recipe=receta, ingredient=self.ingredient, amount=Decimal('100'))
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'recipe-ingredient')
        self.assertEqual(cambio.household_id, self.household.id)

    def test_ingredient_price(self):
        IngredientPrice.objects.create(
            ingredient=self.ingredient, household=self.household, price=Decimal('1.00'),
            amount=Decimal('1'), unit=IngredientPrice.UNIT_KILOGRAM, date=datetime.date.today(),
        )
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'ingredient-price')
        self.assertEqual(cambio.household_id, self.household.id)

    def test_weekly_plan(self):
        WeeklyPlan.objects.create(
            household=self.household, start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 1, 12),
        )
        cambio = self._ultimo_cambio()
        self.assertEqual(cambio.entity, 'weekly-plan')
        self.assertEqual(cambio.household_id, self.household.id)


class BorradoTests(SalazApiTestCase):
    """post_delete tambien deja fila, y un borrado en cascada no revienta."""

    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Alice')

    def test_borrar_deja_fila(self):
        item = PantryItem.objects.create(household=self.household, name='Pasta', unit='kg', amount=Decimal('1'))
        antes = ChangeFeed.objects.count()
        item.delete()
        despues = ChangeFeed.objects.filter(entity='pantry-item').order_by('-id').first()
        self.assertGreater(ChangeFeed.objects.count(), antes)
        self.assertEqual(despues.household_id, self.household.id)

    def test_borrado_en_cascada_no_revienta(self):
        # Borrar la Purchase se lleva por delante sus PurchaseItem (CASCADE).
        # Que no salte ninguna excepcion es justo lo que se prueba aqui: los
        # signals de post_delete de PurchaseItem no deben tirar abajo el
        # borrado por no poder resolver purchase.household.
        purchase = Purchase.objects.create(
            household=self.household, date=datetime.date.today(), description='Compra', covers_days=7,
        )
        PurchaseItem.objects.create(
            purchase=purchase, name='Pan', amount=Decimal('1'), unit='unit', price=Decimal('1.20'),
        )
        PurchaseItem.objects.create(
            purchase=purchase, name='Leche', amount=Decimal('1'), unit='unit', price=Decimal('0.90'),
        )
        purchase.delete()  # no debe lanzar nada
        self.assertFalse(PurchaseItem.objects.filter(purchase_id=purchase.id).exists())

    def test_borrar_hogar_completo_no_revienta(self):
        # El caso mas exigente: borrar el propio Household se lleva por
        # delante todo lo que cuelga de el (miembros, compras, recetas...).
        HouseholdMember.objects.create(household=self.household, name='Alice', consumption_share=Decimal('100'))
        Recipe.objects.create(household=self.household, name='Arroz', servings=2)
        Purchase.objects.create(
            household=self.household, date=datetime.date.today(), description='Compra', covers_days=7,
        )
        self.household.delete()  # no debe lanzar nada
        self.assertFalse(Household.objects.filter(pk=self.household.id).exists())


class PodaTests(SalazApiTestCase):
    """podar_cambios_viejos() borra lo viejo y respeta lo reciente."""

    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Alice')

    def test_poda_borra_viejo_y_respeta_reciente(self):
        vieja = ChangeFeed.objects.create(household=self.household, entity='pantry-item')
        reciente = ChangeFeed.objects.create(household=self.household, entity='pantry-item')
        # auto_now_add no se puede pasar en create(): se retrasa a mano con
        # un update(), que si permite saltarse ese comportamiento.
        ChangeFeed.objects.filter(pk=vieja.pk).update(created=timezone.now() - datetime.timedelta(hours=2))

        borradas = podar_cambios_viejos()

        self.assertEqual(borradas, 1)
        self.assertFalse(ChangeFeed.objects.filter(pk=vieja.pk).exists())
        self.assertTrue(ChangeFeed.objects.filter(pk=reciente.pk).exists())


class FuncionesPurasTests(SalazApiTestCase):
    """_cambios_desde, _formatear_evento y _hogares_visibles, sin pasar por el endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw')
        self.other = User.objects.create_user(username='bob', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Alice')
        self.other_household = Household.objects.create(owner=self.other, name='Casa Bob')

    def test_cambios_desde_respeta_el_cursor(self):
        # No se comparan ids absolutos: el setUp y lo que haya corrido antes
        # dejan sus propias filas, y sus numeros cambian segun el orden de la
        # tanda. Lo que se comprueba es la semantica del cursor -- "solo lo
        # posterior a este id" -- que es lo que de verdad hace la funcion.
        primero = ChangeFeed.objects.create(household=self.household, entity='pantry-item')
        segundo = ChangeFeed.objects.create(household=self.household, entity='purchase')

        desde_antes = [c.id for c in _cambios_desde(primero.id - 1, [self.household.id])]
        self.assertEqual(desde_antes[-2:], [primero.id, segundo.id])

        solo_nuevos = _cambios_desde(primero.id, [self.household.id])
        self.assertEqual([c.id for c in solo_nuevos], [segundo.id])

        # Con el cursor en la ultima fila no queda nada pendiente.
        self.assertEqual(_cambios_desde(segundo.id, [self.household.id]), [])

    def test_cambios_desde_no_ve_otros_hogares(self):
        ChangeFeed.objects.create(household=self.household, entity='pantry-item')
        ajeno = ChangeFeed.objects.create(household=self.other_household, entity='pantry-item')

        propios = _cambios_desde(0, [self.household.id])

        self.assertNotIn(ajeno.id, [c.id for c in propios])

    def test_hogares_visibles_solo_los_del_usuario(self):
        visibles = _hogares_visibles(self.user)
        self.assertIn(self.household, visibles)
        self.assertNotIn(self.other_household, visibles)

    def test_hogares_visibles_incluye_al_miembro_vinculado(self):
        HouseholdMember.objects.create(
            household=self.other_household, name='Alice invitada', user=self.user,
            consumption_share=Decimal('50'),
        )
        visibles = _hogares_visibles(self.user)
        self.assertIn(self.other_household, visibles)

    def test_formatear_evento(self):
        fila = ChangeFeed.objects.create(household=self.household, entity='pantry-item')
        texto = _formatear_evento(fila)
        self.assertEqual(
            texto,
            f'id: {fila.pk}\nevent: cambio\ndata: {{"entity": "pantry-item", "household": {self.household.id}}}\n\n',
        )
        # El formato SSE exige la linea en blanco al final de cada evento.
        self.assertTrue(texto.endswith('\n\n'))


class EndpointSSETests(SalazApiTestCase):
    """
    El endpoint de verdad, sin consumir el stream: solo estado y cabeceras.

    Consumir `response.streaming_content` colgaria la prueba (el generador
    duerme 2 segundos por vuelta y no termina hasta los 5 minutos de tope),
    asi que deliberadamente no se hace en ningun test de aqui.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw')
        Household.objects.create(owner=self.user, name='Casa Alice')

    def test_sin_autenticar(self):
        response = self.client.get('/api/v2/salaz/events/')
        # Mismo comportamiento que el resto de la API (ver la nota en
        # HouseholdApiTests.test_requires_authentication de test_api.py):
        # SessionAuthentication va primero en DEFAULT_AUTHENTICATION_CLASSES
        # y no ofrece un reto WWW-Authenticate, asi que DRF responde 403 en
        # vez de 401 para una peticion sin credenciales.
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_autenticado_devuelve_stream_con_cabeceras_anti_buffering(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/v2/salaz/events/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/event-stream')
        self.assertEqual(response['Cache-Control'], 'no-cache')
        self.assertEqual(response['X-Accel-Buffering'], 'no')
        self.assertEqual(response['Connection'], 'keep-alive')
