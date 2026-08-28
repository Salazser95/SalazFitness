import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from salaz.models import (
    Household,
    HouseholdMember,
    IngredientPrice,
    PantryItem,
    Purchase,
    PurchaseItem,
    Recipe,
    RecipeIngredient,
    ShoppingList,
    ShoppingListItem,
)
from wger.core.models import Language
from wger.nutrition.models import Ingredient


def make_ingredient(name='Chicken breast', energy=120, protein=Decimal('20'),
                     carbohydrates=Decimal('0'), fat=Decimal('3')):
    language = Language.objects.get(pk=2)  # English, from the test-languages fixture
    return Ingredient.objects.create(
        name=name, language=language, energy=energy, protein=protein,
        carbohydrates=carbohydrates, fat=fat, license_author='test',
    )


class SalazApiTestCase(APITestCase):
    """Base test case that loads wger's reference data fixtures (see test_models.SalazTestCase)."""

    fixtures = ['test-languages.json', 'test-licenses.json']


class HouseholdApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw')
        self.other = User.objects.create_user(username='bob', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Alice')
        self.other_household = Household.objects.create(owner=self.other, name='Casa Bob')

    def test_requires_authentication(self):
        response = self.client.get('/api/v2/salaz/household/')
        # SessionAuthentication is first in DEFAULT_AUTHENTICATION_CLASSES and
        # doesn't provide a WWW-Authenticate challenge, so DRF reports
        # unauthenticated access as 403 rather than 401 here (verified
        # against wger's actual REST_FRAMEWORK config).
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_only_shows_own_households(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/v2/salaz/household/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [h['name'] for h in response.data['results']]
        self.assertEqual(names, ['Casa Alice'])

    def test_create_sets_owner_to_request_user(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post('/api/v2/salaz/household/', {'name': 'Nueva casa'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['owner'], self.user.id)

    def test_cannot_retrieve_other_users_household(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f'/api/v2/salaz/household/{self.other_household.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_can_update_own_household(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(
            f'/api/v2/salaz/household/{self.household.id}/', {'name': 'Renombrada'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.household.refresh_from_db()
        self.assertEqual(self.household.name, 'Renombrada')

    def test_owner_can_delete_own_household(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(f'/api/v2/salaz/household/{self.household.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Household.objects.filter(pk=self.household.id).exists())

    def test_summary_endpoint(self):
        HouseholdMember.objects.create(
            household=self.household, name='Alice', consumption_share=Decimal('100')
        )
        Purchase.objects.create(
            household=self.household, date=datetime.date.today(), description='Compra',
            covers_days=7,
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f'/api/v2/salaz/household/{self.household.id}/summary/?days=30')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        for key in ('total', 'per_person', 'daily', 'weekly', 'biweekly', 'monthly_estimate', 'shares_valid'):
            self.assertIn(key, response.data)
        self.assertTrue(response.data['shares_valid'])

    def test_summary_endpoint_rejects_other_users_household(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(f'/api/v2/salaz/household/{self.other_household.id}/summary/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class HouseholdMemberApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='carol', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Carol')
        self.client.force_authenticate(user=self.user)

    def test_create_without_share_defaults_to_100(self):
        response = self.client.post(
            '/api/v2/salaz/household-member/',
            {'household': self.household.id, 'name': 'Sola'},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Decimal(response.data['consumption_share']), Decimal('100.00'))

    def test_create_rejects_share_over_100(self):
        response = self.client.post(
            '/api/v2/salaz/household-member/',
            {'household': self.household.id, 'name': 'X', 'consumption_share': '150'},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_create_member_for_another_users_household(self):
        other = User.objects.create_user(username='eve', password='pw')
        other_household = Household.objects.create(owner=other, name='Casa Eve')
        response = self.client.post(
            '/api/v2/salaz/household-member/',
            {'household': other_household.id, 'name': 'Intrusa'},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(HouseholdMember.objects.filter(name='Intrusa').exists())


class PurchaseApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='dave', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Dave')
        self.member_a = HouseholdMember.objects.create(
            household=self.household, name='A', consumption_share=Decimal('70')
        )
        self.member_b = HouseholdMember.objects.create(
            household=self.household, name='B', consumption_share=Decimal('30')
        )
        self.purchase = Purchase.objects.create(
            household=self.household, date=datetime.date.today(), description='Compra',
            covers_days=7,
        )
        PurchaseItem.objects.create(
            purchase=self.purchase, name='Compartido', amount=Decimal('1'),
            unit='unit', price=Decimal('10.00'), is_shared=True,
        )
        self.client.force_authenticate(user=self.user)

    def test_breakdown_endpoint(self):
        response = self.client.get(f'/api/v2/salaz/purchase/{self.purchase.id}/breakdown/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(Decimal(response.data['total']), Decimal('10.00'))
        amounts = {row['member']: Decimal(row['amount']) for row in response.data['cost_per_person']}
        self.assertEqual(amounts[self.member_a.id], Decimal('7.00'))
        self.assertEqual(amounts[self.member_b.id], Decimal('3.00'))

    def test_other_user_cannot_see_breakdown(self):
        other = User.objects.create_user(username='eve', password='pw')
        self.client.force_authenticate(user=other)
        response = self.client.get(f'/api/v2/salaz/purchase/{self.purchase.id}/breakdown/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_purchase_for_own_household(self):
        response = self.client.post(
            '/api/v2/salaz/purchase/',
            {'household': self.household.id, 'date': '2026-01-01', 'description': 'Compra nueva', 'covers_days': 7},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_cannot_create_purchase_for_another_users_household(self):
        other = User.objects.create_user(username='eve', password='pw')
        other_household = Household.objects.create(owner=other, name='Casa Eve')
        response = self.client.post(
            '/api/v2/salaz/purchase/',
            {'household': other_household.id, 'date': '2026-01-01', 'description': 'Intrusa', 'covers_days': 7},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Purchase.objects.filter(household=other_household).exists())

    def test_create_purchase_requires_household(self):
        response = self.client.post(
            '/api/v2/salaz/purchase/', {'date': '2026-01-01', 'description': 'Sin hogar', 'covers_days': 7}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_purchase_item_for_own_purchase(self):
        response = self.client.post(
            '/api/v2/salaz/purchase-item/',
            {
                'purchase': self.purchase.id, 'name': 'Nuevo', 'amount': '1',
                'unit': 'unit', 'price': '5.00', 'is_shared': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_purchase_item_starts_unmarked_and_can_be_marked_purchased(self):
        creado = self.client.post(
            '/api/v2/salaz/purchase-item/',
            {
                'purchase': self.purchase.id, 'name': 'Tomates', 'amount': '1',
                'unit': 'kg', 'price': '2.50', 'is_shared': True,
            },
            format='json',
        )
        self.assertFalse(creado.data['purchased'])

        marcado = self.client.patch(
            f"/api/v2/salaz/purchase-item/{creado.data['id']}/", {'purchased': True}, format='json'
        )
        self.assertEqual(marcado.status_code, status.HTTP_200_OK, marcado.data)
        self.assertTrue(marcado.data['purchased'])

    def test_cannot_create_purchase_item_for_another_users_purchase(self):
        other = User.objects.create_user(username='mallory', password='pw')
        other_household = Household.objects.create(owner=other, name='Casa Mallory')
        other_purchase = Purchase.objects.create(
            household=other_household, date=datetime.date.today(), covers_days=7,
        )
        response = self.client.post(
            '/api/v2/salaz/purchase-item/',
            {
                'purchase': other_purchase.id, 'name': 'Intrusa', 'amount': '1',
                'unit': 'unit', 'price': '5.00', 'is_shared': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(PurchaseItem.objects.filter(purchase=other_purchase).exists())

    def test_create_purchase_item_requires_purchase(self):
        response = self.client.post(
            '/api/v2/salaz/purchase-item/',
            {'name': 'Sin compra', 'amount': '1', 'unit': 'unit', 'price': '5.00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PantryItemApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='ivan', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Ivan')
        self.ingredient = make_ingredient(name='Arroz blanco')
        self.purchase = Purchase.objects.create(
            household=self.household, date=datetime.date.today(), description='Compra',
            covers_days=7,
        )
        self.client.force_authenticate(user=self.user)

    def test_create_and_list_manual_pantry_item(self):
        response = self.client.post(
            '/api/v2/salaz/pantry-item/',
            {'household': self.household.id, 'name': 'Papel de cocina', 'unit': 'unit', 'amount': '2'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        listado = self.client.get(f'/api/v2/salaz/pantry-item/?household={self.household.id}')
        self.assertEqual(len(listado.data['results']), 1)

    def test_cannot_create_pantry_item_for_another_users_household(self):
        other = User.objects.create_user(username='judy', password='pw')
        other_household = Household.objects.create(owner=other, name='Casa Judy')
        response = self.client.post(
            '/api/v2/salaz/pantry-item/',
            {'household': other_household.id, 'name': 'Intrusa', 'unit': 'unit', 'amount': '1'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(PantryItem.objects.filter(household=other_household).exists())

    def test_pantry_item_requires_household(self):
        response = self.client.post(
            '/api/v2/salaz/pantry-item/', {'name': 'Sin hogar', 'unit': 'unit', 'amount': '1'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_amount_can_be_corrected_by_hand(self):
        item = PantryItem.objects.create(household=self.household, name='Pasta', unit='kg', amount=Decimal('3'))
        response = self.client.patch(f'/api/v2/salaz/pantry-item/{item.id}/', {'amount': '1.5'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        item.refresh_from_db()
        self.assertEqual(item.amount, Decimal('1.50'))

    def test_delete_manual_pantry_item(self):
        item = PantryItem.objects.create(household=self.household, name='Papel', unit='unit', amount=Decimal('1'))
        response = self.client.delete(f'/api/v2/salaz/pantry-item/{item.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PantryItem.objects.filter(pk=item.id).exists())

    def test_other_user_cannot_see_or_touch_pantry_item(self):
        other = User.objects.create_user(username='mallory2', password='pw')
        item = PantryItem.objects.create(household=self.household, name='Papel', unit='unit', amount=Decimal('1'))
        self.client.force_authenticate(user=other)
        get_resp = self.client.get(f'/api/v2/salaz/pantry-item/{item.id}/')
        self.assertEqual(get_resp.status_code, status.HTTP_404_NOT_FOUND)
        patch_resp = self.client.patch(f'/api/v2/salaz/pantry-item/{item.id}/', {'amount': '99'}, format='json')
        self.assertEqual(patch_resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_marking_a_purchase_item_as_purchased_adds_stock(self):
        linea = PurchaseItem.objects.create(
            purchase=self.purchase, ingredient=self.ingredient, amount=Decimal('1.5'),
            unit='kg', price=Decimal('3.00'), is_shared=True,
        )
        response = self.client.patch(f'/api/v2/salaz/purchase-item/{linea.id}/', {'purchased': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        despensa = PantryItem.objects.get(household=self.household, ingredient=self.ingredient, unit='kg')
        self.assertEqual(despensa.amount, Decimal('1.50'))

    def test_marking_twice_does_not_double_count(self):
        linea = PurchaseItem.objects.create(
            purchase=self.purchase, ingredient=self.ingredient, amount=Decimal('1'),
            unit='kg', price=Decimal('2.00'), is_shared=True, purchased=True,
        )
        # Ya estaba marcada: mandar purchased=True otra vez no debe sumar de nuevo.
        self.client.patch(f'/api/v2/salaz/purchase-item/{linea.id}/', {'purchased': True}, format='json')
        self.assertFalse(
            PantryItem.objects.filter(household=self.household, ingredient=self.ingredient).exists()
        )

    def test_unmarking_a_purchase_item_subtracts_stock(self):
        linea = PurchaseItem.objects.create(
            purchase=self.purchase, ingredient=self.ingredient, amount=Decimal('2'),
            unit='kg', price=Decimal('4.00'), is_shared=True,
        )
        self.client.patch(f'/api/v2/salaz/purchase-item/{linea.id}/', {'purchased': True}, format='json')
        self.client.patch(f'/api/v2/salaz/purchase-item/{linea.id}/', {'purchased': False}, format='json')
        despensa = PantryItem.objects.get(household=self.household, ingredient=self.ingredient, unit='kg')
        self.assertEqual(despensa.amount, Decimal('0.00'))

    def test_stock_never_goes_negative(self):
        despensa = PantryItem.objects.create(
            household=self.household, ingredient=self.ingredient, unit='kg', amount=Decimal('0.5'),
        )
        linea = PurchaseItem.objects.create(
            purchase=self.purchase, ingredient=self.ingredient, amount=Decimal('2'),
            unit='kg', price=Decimal('4.00'), is_shared=True, purchased=True,
        )
        self.client.patch(f'/api/v2/salaz/purchase-item/{linea.id}/', {'purchased': False}, format='json')
        despensa.refresh_from_db()
        self.assertEqual(despensa.amount, Decimal('0.00'))

    def test_deleting_a_purchased_line_returns_its_stock(self):
        linea = PurchaseItem.objects.create(
            purchase=self.purchase, ingredient=self.ingredient, amount=Decimal('1'),
            unit='kg', price=Decimal('2.00'), is_shared=True, purchased=True,
        )
        PantryItem.objects.create(
            household=self.household, ingredient=self.ingredient, unit='kg', amount=Decimal('1'),
        )
        response = self.client.delete(f'/api/v2/salaz/purchase-item/{linea.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        despensa = PantryItem.objects.get(household=self.household, ingredient=self.ingredient, unit='kg')
        self.assertEqual(despensa.amount, Decimal('0.00'))

    def test_deleting_an_unmarked_line_does_not_touch_stock(self):
        linea = PurchaseItem.objects.create(
            purchase=self.purchase, ingredient=self.ingredient, amount=Decimal('1'),
            unit='kg', price=Decimal('2.00'), is_shared=True, purchased=False,
        )
        PantryItem.objects.create(
            household=self.household, ingredient=self.ingredient, unit='kg', amount=Decimal('3'),
        )
        response = self.client.delete(f'/api/v2/salaz/purchase-item/{linea.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        despensa = PantryItem.objects.get(household=self.household, ingredient=self.ingredient, unit='kg')
        self.assertEqual(despensa.amount, Decimal('3.00'))

    def test_items_without_ingredient_match_by_name(self):
        linea = PurchaseItem.objects.create(
            purchase=self.purchase, name='Verduras varias', amount=Decimal('2'),
            unit='unit', price=Decimal('5.00'), is_shared=True,
        )
        self.client.patch(f'/api/v2/salaz/purchase-item/{linea.id}/', {'purchased': True}, format='json')
        despensa = PantryItem.objects.get(
            household=self.household, ingredient__isnull=True, name='Verduras varias',
        )
        self.assertEqual(despensa.amount, Decimal('2.00'))

    def test_different_units_of_the_same_ingredient_stay_separate(self):
        despensa_kg = PantryItem.objects.create(
            household=self.household, ingredient=self.ingredient, unit='kg', amount=Decimal('1'),
        )
        linea_g = PurchaseItem.objects.create(
            purchase=self.purchase, ingredient=self.ingredient, amount=Decimal('500'),
            unit='g', price=Decimal('1.00'), is_shared=True,
        )
        self.client.patch(f'/api/v2/salaz/purchase-item/{linea_g.id}/', {'purchased': True}, format='json')
        despensa_kg.refresh_from_db()
        self.assertEqual(despensa_kg.amount, Decimal('1'))
        despensa_g = PantryItem.objects.get(household=self.household, ingredient=self.ingredient, unit='g')
        self.assertEqual(despensa_g.amount, Decimal('500.00'))


class IngredientPriceApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='heidi', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Heidi')
        self.ingredient = make_ingredient(name='Tomato')
        self.client.force_authenticate(user=self.user)

    def test_create_price_for_own_household(self):
        response = self.client.post(
            '/api/v2/salaz/ingredient-price/',
            {
                'ingredient': self.ingredient.id, 'household': self.household.id,
                'price': '2.50', 'amount': '1', 'unit': 'kg', 'date': '2026-01-01',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_cannot_create_price_for_another_users_household(self):
        other = User.objects.create_user(username='ivan', password='pw')
        other_household = Household.objects.create(owner=other, name='Casa Ivan')
        response = self.client.post(
            '/api/v2/salaz/ingredient-price/',
            {
                'ingredient': self.ingredient.id, 'household': other_household.id,
                'price': '2.50', 'amount': '1', 'unit': 'kg', 'date': '2026-01-01',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(IngredientPrice.objects.filter(household=other_household).exists())

    def test_create_price_requires_household(self):
        response = self.client.post(
            '/api/v2/salaz/ingredient-price/',
            {'ingredient': self.ingredient.id, 'price': '2.50', 'amount': '1', 'unit': 'kg', 'date': '2026-01-01'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class RecipeApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='frank', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Frank')
        self.ingredient = make_ingredient(
            name='Rice', energy=100, protein=Decimal('2'), carbohydrates=Decimal('20'), fat=Decimal('1')
        )
        self.recipe = Recipe.objects.create(household=self.household, name='Arroz', servings=2)
        RecipeIngredient.objects.create(recipe=self.recipe, ingredient=self.ingredient, amount=Decimal('100'))
        self.client.force_authenticate(user=self.user)

    def test_cost_endpoint(self):
        response = self.client.get(f'/api/v2/salaz/recipe/{self.recipe.id}/cost/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn('total_cost', response.data)
        self.assertIn('cost_per_serving', response.data)
        macros = response.data['macros_per_serving']
        for key in ('energy', 'protein', 'carbohydrates', 'fat'):
            self.assertIn(key, macros)

    def test_create_recipe_for_own_household(self):
        response = self.client.post(
            '/api/v2/salaz/recipe/',
            {'household': self.household.id, 'name': 'Magdalenas', 'servings': 12},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['name'], 'Magdalenas')

    def test_cannot_create_recipe_for_another_users_household(self):
        other = User.objects.create_user(username='eve', password='pw')
        other_household = Household.objects.create(owner=other, name='Casa Eve')
        response = self.client.post(
            '/api/v2/salaz/recipe/',
            {'household': other_household.id, 'name': 'Intrusa', 'servings': 1},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Recipe.objects.filter(name='Intrusa').exists())

    def test_create_recipe_requires_household(self):
        response = self.client.post(
            '/api/v2/salaz/recipe/', {'name': 'Sin hogar', 'servings': 1}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_recipe_ingredient_for_own_recipe(self):
        otro_ingrediente = make_ingredient(
            name='Flour', energy=364, protein=Decimal('10'), carbohydrates=Decimal('76'), fat=Decimal('1')
        )
        response = self.client.post(
            '/api/v2/salaz/recipe-ingredient/',
            {'recipe': self.recipe.id, 'ingredient': otro_ingrediente.id, 'amount': '50'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_cannot_create_recipe_ingredient_for_another_users_recipe(self):
        other = User.objects.create_user(username='mallory', password='pw')
        other_household = Household.objects.create(owner=other, name='Casa Mallory')
        other_recipe = Recipe.objects.create(household=other_household, name='Ajena', servings=1)
        response = self.client.post(
            '/api/v2/salaz/recipe-ingredient/',
            {'recipe': other_recipe.id, 'ingredient': self.ingredient.id, 'amount': '50'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(RecipeIngredient.objects.filter(recipe=other_recipe).exists())


class ShoppingListGenerateApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='grace', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Grace')
        self.ingredient = make_ingredient(name='Pasta', energy=350, protein=Decimal('12'),
                                            carbohydrates=Decimal('70'), fat=Decimal('1.5'))
        self.recipe = Recipe.objects.create(household=self.household, name='Pasta al pesto', servings=4)
        RecipeIngredient.objects.create(recipe=self.recipe, ingredient=self.ingredient, amount=Decimal('400'))
        IngredientPrice.objects.create(
            ingredient=self.ingredient, household=self.household, price=Decimal('1.00'),
            amount=Decimal('1'), unit=IngredientPrice.UNIT_KILOGRAM, date=datetime.date.today(),
            is_current=True,
        )
        self.client.force_authenticate(user=self.user)

    def test_generate_creates_shopping_list_with_aggregated_items(self):
        response = self.client.post(
            '/api/v2/salaz/shopping-list/generate/',
            {
                'household': self.household.id,
                'start_date': '2026-01-01',
                'end_date': '2026-01-07',
                'recipe_ids': [self.recipe.id],
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        list_id = response.data['id']
        items_response = self.client.get(f'/api/v2/salaz/shopping-list-item/?shopping_list={list_id}')
        items = items_response.data['results']
        self.assertEqual(len(items), 1)
        self.assertEqual(Decimal(items[0]['amount']), Decimal('400.00'))
        # 1.00 / 1000g * 100 = 0.10 per 100g; 400g -> 0.40
        self.assertEqual(Decimal(items[0]['estimated_price']), Decimal('0.40'))

    def test_generate_requires_household(self):
        response = self.client.post(
            '/api/v2/salaz/shopping-list/generate/',
            {'start_date': '2026-01-01', 'end_date': '2026-01-07', 'recipe_ids': []},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_rejects_other_users_household(self):
        other = User.objects.create_user(username='henry', password='pw')
        self.client.force_authenticate(user=other)
        response = self.client.post(
            '/api/v2/salaz/shopping-list/generate/',
            {
                'household': self.household.id,
                'start_date': '2026-01-01',
                'end_date': '2026-01-07',
                'recipe_ids': [],
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ListaACompraApiTests(SalazApiTestCase):
    """
    Marcar una linea de la lista de la compra (generada desde nutricion o
    desde recetas) como comprada tiene que reflejarse de verdad en Compras
    (una Purchase real, no solo el check) y, a traves de eso, en la
    despensa -- ver _sincronizar_compra_real en api/views.py.
    """

    def setUp(self):
        self.user = User.objects.create_user(username='karen', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Karen')
        self.ingredient = make_ingredient(name='Moras')
        self.lista = ShoppingList.objects.create(
            household=self.household, name='Lista de la semana',
            start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 1, 12),
        )
        self.item = ShoppingListItem.objects.create(
            shopping_list=self.lista, ingredient=self.ingredient, name='Moras',
            amount=Decimal('0.25'), unit='kg', estimated_price=Decimal('2.50'),
            trip=1, buy_date=datetime.date(2026, 1, 1),
        )
        self.client.force_authenticate(user=self.user)

    def _marcar(self, item_id, purchased):
        return self.client.patch(
            f'/api/v2/salaz/shopping-list-item/{item_id}/', {'purchased': purchased}, format='json',
        )

    def test_marcar_comprado_crea_la_compra_real_y_su_linea(self):
        response = self._marcar(self.item.id, True)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        compra = Purchase.objects.get(household=self.household, shopping_list=self.lista, trip=1)
        self.assertEqual(compra.date, datetime.date(2026, 1, 1))

        linea = PurchaseItem.objects.get(shopping_list_item=self.item)
        self.assertEqual(linea.purchase_id, compra.id)
        self.assertEqual(linea.ingredient_id, self.ingredient.id)
        self.assertEqual(linea.amount, Decimal('0.25'))
        self.assertEqual(linea.unit, 'kg')
        self.assertEqual(linea.price, Decimal('2.50'))
        self.assertTrue(linea.purchased)

    def test_marcar_comprado_ajusta_la_despensa(self):
        self._marcar(self.item.id, True)
        despensa = PantryItem.objects.get(household=self.household, ingredient=self.ingredient, unit='kg')
        self.assertEqual(despensa.amount, Decimal('0.25'))

    def test_dos_lineas_de_la_misma_tanda_comparten_una_sola_compra(self):
        otro_item = ShoppingListItem.objects.create(
            shopping_list=self.lista, name='Pan', amount=Decimal('1'), unit='unit',
            estimated_price=Decimal('1.20'), trip=1, buy_date=datetime.date(2026, 1, 1),
        )
        self._marcar(self.item.id, True)
        self._marcar(otro_item.id, True)
        self.assertEqual(
            Purchase.objects.filter(household=self.household, shopping_list=self.lista, trip=1).count(), 1
        )

    def test_una_tanda_distinta_crea_una_compra_distinta(self):
        item_tanda_2 = ShoppingListItem.objects.create(
            shopping_list=self.lista, name='Fresas', amount=Decimal('0.25'), unit='kg',
            estimated_price=Decimal('2.00'), trip=2, buy_date=datetime.date(2026, 1, 4),
        )
        self._marcar(self.item.id, True)
        self._marcar(item_tanda_2.id, True)
        self.assertEqual(
            Purchase.objects.filter(household=self.household, shopping_list=self.lista).count(), 2
        )

    def test_volver_a_marcar_no_duplica_la_linea(self):
        self._marcar(self.item.id, True)
        self._marcar(self.item.id, False)
        self._marcar(self.item.id, True)
        self.assertEqual(PurchaseItem.objects.filter(shopping_list_item=self.item).count(), 1)
        despensa = PantryItem.objects.get(household=self.household, ingredient=self.ingredient, unit='kg')
        # 0.25 al marcar, -0.25 al desmarcar, +0.25 al volver a marcar: 0.25, no 0.50.
        self.assertEqual(despensa.amount, Decimal('0.25'))

    def test_desmarcar_revierte_la_despensa_sin_borrar_la_linea(self):
        self._marcar(self.item.id, True)
        self._marcar(self.item.id, False)

        linea = PurchaseItem.objects.get(shopping_list_item=self.item)
        self.assertFalse(linea.purchased)
        despensa = PantryItem.objects.get(household=self.household, ingredient=self.ingredient, unit='kg')
        self.assertEqual(despensa.amount, Decimal('0.00'))

    def test_desmarcar_sin_haber_marcado_antes_no_hace_nada(self):
        response = self._marcar(self.item.id, False)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(PurchaseItem.objects.filter(shopping_list_item=self.item).exists())
        self.assertFalse(Purchase.objects.filter(shopping_list=self.lista).exists())

    def test_guardar_sin_cambiar_purchased_no_duplica_nada(self):
        self._marcar(self.item.id, True)
        # PATCH de otro campo (el supermercado), sin tocar `purchased`.
        response = self.client.patch(
            f'/api/v2/salaz/shopping-list-item/{self.item.id}/', {'supermarket': 'Mercadona'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(PurchaseItem.objects.filter(shopping_list_item=self.item).count(), 1)
