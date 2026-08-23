import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.test import TestCase

from salaz.models import (
    Household,
    HouseholdMember,
    IngredientPrice,
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
                     carbohydrates=Decimal('0'), fat=Decimal('3'), language=None):
    if language is None:
        language = Language.objects.get(pk=2)  # English, from the test-languages fixture
    return Ingredient.objects.create(
        name=name,
        language=language,
        energy=energy,
        protein=protein,
        carbohydrates=carbohydrates,
        fat=fat,
        license_author='test',
    )


class SalazTestCase(TestCase):
    """
    Base test case that loads wger's own reference data fixtures.

    Creating a User triggers a UserProfile with notification_language_id=2,
    and Ingredient defaults to license_id=2 (CC_BY_SA_4_LICENSE_ID) -- both
    foreign keys that must exist, or SQLite's deferred constraint check fails
    at the end of the test's transaction. wger's own tests load these same
    fixtures for the same reason (see wger/core/tests/base_testcase.py and
    wger/nutrition/tests/*).
    """

    fixtures = ['test-languages.json', 'test-licenses.json']


class HouseholdModelTests(SalazTestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', password='pw')
        self.household = Household.objects.create(owner=self.owner, name='Casa')

    def test_str(self):
        self.assertEqual(str(self.household), 'Casa')

    def test_user_alias_returns_owner(self):
        self.assertEqual(self.household.user, self.owner)

    def test_get_owner_object_returns_self(self):
        self.assertEqual(self.household.get_owner_object(), self.household)

    def test_validate_shares_true_when_no_members(self):
        self.assertTrue(self.household.validate_shares())

    def test_validate_shares_true_when_balanced(self):
        HouseholdMember.objects.create(household=self.household, name='A', consumption_share=Decimal('60'))
        HouseholdMember.objects.create(household=self.household, name='B', consumption_share=Decimal('40'))
        self.assertTrue(self.household.validate_shares())

    def test_validate_shares_false_when_unbalanced(self):
        HouseholdMember.objects.create(household=self.household, name='A', consumption_share=Decimal('60'))
        HouseholdMember.objects.create(household=self.household, name='B', consumption_share=Decimal('30'))
        self.assertFalse(self.household.validate_shares())


class HouseholdMemberModelTests(SalazTestCase):
    def setUp(self):
        owner = User.objects.create_user(username='owner2', password='pw')
        self.household = Household.objects.create(owner=owner, name='Casa 2')

    def test_default_share_is_100_for_single_member(self):
        member = HouseholdMember.objects.create(household=self.household, name='Solo')
        self.assertEqual(member.consumption_share, Decimal('100.00'))

    def test_default_share_splits_equally_for_new_member(self):
        HouseholdMember.objects.create(household=self.household, name='A', consumption_share=Decimal('50'))
        second = HouseholdMember.objects.create(household=self.household, name='B')
        # Two members total at save time -> equal split is 50.
        self.assertEqual(second.consumption_share, Decimal('50.00'))

    def test_explicit_share_is_respected(self):
        member = HouseholdMember.objects.create(
            household=self.household, name='C', consumption_share=Decimal('75')
        )
        self.assertEqual(member.consumption_share, Decimal('75.00'))


class IngredientPriceModelTests(SalazTestCase):
    def setUp(self):
        owner = User.objects.create_user(username='owner3', password='pw')
        self.household = Household.objects.create(owner=owner, name='Casa 3')
        self.ingredient = make_ingredient()

    def _price(self, price, amount, unit):
        return IngredientPrice.objects.create(
            ingredient=self.ingredient,
            household=self.household,
            price=Decimal(price),
            amount=Decimal(amount),
            unit=unit,
            date=datetime.date(2026, 1, 1),
        )

    def test_price_per_100g_for_grams(self):
        price = self._price('2.00', '200', IngredientPrice.UNIT_GRAM)
        self.assertEqual(price.price_per_100g, Decimal('1.00'))

    def test_price_per_100g_for_kilograms(self):
        price = self._price('5.00', '2', IngredientPrice.UNIT_KILOGRAM)
        # 5.00 / 2000g * 100 = 0.25
        self.assertEqual(price.price_per_100g, Decimal('0.25'))

    def test_price_per_100g_for_liters(self):
        price = self._price('3.00', '1.5', IngredientPrice.UNIT_LITER)
        # 3.00 / 1500ml * 100 = 0.20
        self.assertEqual(price.price_per_100g, Decimal('0.20'))

    def test_price_per_100g_is_none_for_unit(self):
        price = self._price('1.00', '6', IngredientPrice.UNIT_EACH)
        self.assertIsNone(price.price_per_100g)

    def test_get_owner_object_returns_household(self):
        price = self._price('1.00', '100', IngredientPrice.UNIT_GRAM)
        self.assertEqual(price.get_owner_object(), self.household)


class PurchaseModelTests(SalazTestCase):
    def setUp(self):
        owner = User.objects.create_user(username='owner4', password='pw')
        self.household = Household.objects.create(owner=owner, name='Casa 4')
        self.member_a = HouseholdMember.objects.create(
            household=self.household, name='A', consumption_share=Decimal('60')
        )
        self.member_b = HouseholdMember.objects.create(
            household=self.household, name='B', consumption_share=Decimal('40')
        )
        self.purchase = Purchase.objects.create(
            household=self.household,
            date=datetime.date(2026, 1, 1),
            description='Compra semanal',
            covers_days=7,
        )

    def test_total_cost_with_no_items_is_zero(self):
        self.assertEqual(self.purchase.total_cost, Decimal('0.00'))

    def test_total_cost_sums_items(self):
        PurchaseItem.objects.create(
            purchase=self.purchase, name='Verduras', amount=Decimal('1'),
            unit='unit', price=Decimal('10.00'),
        )
        PurchaseItem.objects.create(
            purchase=self.purchase, name='Fruta', amount=Decimal('1'),
            unit='unit', price=Decimal('5.50'),
        )
        self.assertEqual(self.purchase.total_cost, Decimal('15.50'))

    def test_cost_per_day(self):
        PurchaseItem.objects.create(
            purchase=self.purchase, name='Verduras', amount=Decimal('1'),
            unit='unit', price=Decimal('14.00'),
        )
        self.assertEqual(self.purchase.cost_per_day, Decimal('2.00'))

    def test_shared_and_individual_totals(self):
        PurchaseItem.objects.create(
            purchase=self.purchase, name='Compartido', amount=Decimal('1'),
            unit='unit', price=Decimal('20.00'), is_shared=True,
        )
        PurchaseItem.objects.create(
            purchase=self.purchase, name='Solo de A', amount=Decimal('1'),
            unit='unit', price=Decimal('5.00'), is_shared=False, member=self.member_a,
        )
        self.assertEqual(self.purchase.shared_total, Decimal('20.00'))
        self.assertEqual(self.purchase.individual_total, Decimal('5.00'))

    def test_cost_per_person_applies_shares_and_individual_items(self):
        PurchaseItem.objects.create(
            purchase=self.purchase, name='Compartido', amount=Decimal('1'),
            unit='unit', price=Decimal('20.00'), is_shared=True,
        )
        PurchaseItem.objects.create(
            purchase=self.purchase, name='Solo de A', amount=Decimal('1'),
            unit='unit', price=Decimal('5.00'), is_shared=False, member=self.member_a,
        )
        result = self.purchase.cost_per_person
        # A: 60% of 20 = 12, plus their own 5 = 17
        self.assertEqual(result[self.member_a.id], Decimal('17.00'))
        # B: 40% of 20 = 8, no individual items
        self.assertEqual(result[self.member_b.id], Decimal('8.00'))


class PurchaseItemModelTests(SalazTestCase):
    def setUp(self):
        owner = User.objects.create_user(username='owner5', password='pw')
        household = Household.objects.create(owner=owner, name='Casa 5')
        self.purchase = Purchase.objects.create(
            household=household, date=datetime.date(2026, 1, 1), description='Compra',
        )

    def test_clean_requires_ingredient_or_name(self):
        item = PurchaseItem(
            purchase=self.purchase, amount=Decimal('1'), unit='unit', price=Decimal('1.00'),
        )
        with self.assertRaises(ValidationError):
            item.clean()

    def test_clean_passes_with_name_only(self):
        item = PurchaseItem(
            purchase=self.purchase, name='Verduras varias', amount=Decimal('1'),
            unit='unit', price=Decimal('1.00'),
        )
        item.clean()  # should not raise


class RecipeModelTests(SalazTestCase):
    def setUp(self):
        owner = User.objects.create_user(username='owner6', password='pw')
        self.household = Household.objects.create(owner=owner, name='Casa 6')
        self.ingredient = make_ingredient(
            name='Rice', energy=130, protein=Decimal('2.7'),
            carbohydrates=Decimal('28'), fat=Decimal('0.3'),
        )
        self.recipe = Recipe.objects.create(household=self.household, name='Arroz', servings=2)
        RecipeIngredient.objects.create(recipe=self.recipe, ingredient=self.ingredient, amount=Decimal('200'))

    def test_macros_scale_with_amount(self):
        # 200g of rice = 2x the per-100g values.
        self.assertEqual(self.recipe.energy, Decimal('260.00'))
        self.assertEqual(self.recipe.protein, Decimal('5.40'))
        self.assertEqual(self.recipe.carbohydrates, Decimal('56.00'))
        self.assertEqual(self.recipe.fat, Decimal('0.60'))

    def test_total_cost_zero_without_prices(self):
        self.assertEqual(self.recipe.total_cost, Decimal('0.00'))

    def test_total_cost_uses_current_household_price(self):
        IngredientPrice.objects.create(
            ingredient=self.ingredient, household=self.household,
            price=Decimal('1.00'), amount=Decimal('1'), unit=IngredientPrice.UNIT_KILOGRAM,
            date=datetime.date(2026, 1, 1), is_current=True,
        )
        # 1.00 / 1000g * 100 = 0.10 per 100g; 200g -> 0.20
        self.assertEqual(self.recipe.total_cost, Decimal('0.20'))
        self.assertEqual(self.recipe.cost_per_serving, Decimal('0.10'))

    def test_total_cost_ignores_non_current_prices(self):
        IngredientPrice.objects.create(
            ingredient=self.ingredient, household=self.household,
            price=Decimal('9.00'), amount=Decimal('1'), unit=IngredientPrice.UNIT_KILOGRAM,
            date=datetime.date(2026, 1, 1), is_current=False,
        )
        self.assertEqual(self.recipe.total_cost, Decimal('0.00'))


class ShoppingListModelTests(SalazTestCase):
    def setUp(self):
        owner = User.objects.create_user(username='owner7', password='pw')
        self.household = Household.objects.create(owner=owner, name='Casa 7')
        self.shopping_list = ShoppingList.objects.create(
            household=self.household, name='Lista', start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 1, 7),
        )

    def test_estimated_total_zero_when_empty(self):
        self.assertEqual(self.shopping_list.estimated_total, Decimal('0.00'))

    def test_estimated_total_sums_items_ignoring_null(self):
        ShoppingListItem.objects.create(
            shopping_list=self.shopping_list, name='Leche', amount=Decimal('1'),
            unit='l', estimated_price=Decimal('1.20'),
        )
        ShoppingListItem.objects.create(
            shopping_list=self.shopping_list, name='Sal', amount=Decimal('1'),
            unit='unit', estimated_price=None,
        )
        self.assertEqual(self.shopping_list.estimated_total, Decimal('1.20'))
