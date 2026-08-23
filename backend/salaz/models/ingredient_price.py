from decimal import Decimal

from django.db import models

from wger.nutrition.models import Ingredient


class IngredientPrice(models.Model):
    """A price observation for an ingredient, as bought by a household."""

    UNIT_GRAM = 'g'
    UNIT_KILOGRAM = 'kg'
    UNIT_MILLILITER = 'ml'
    UNIT_LITER = 'l'
    UNIT_EACH = 'unit'

    UNIT_CHOICES = [
        (UNIT_GRAM, 'g'),
        (UNIT_KILOGRAM, 'kg'),
        (UNIT_MILLILITER, 'ml'),
        (UNIT_LITER, 'l'),
        (UNIT_EACH, 'unit'),
    ]

    # Conversion factor to the base unit used for normalization (grams for
    # weight, milliliters for volume). "unit" (a piece/item) has no fixed
    # weight so it cannot be normalized to a per-100g price.
    _UNIT_TO_BASE = {
        UNIT_GRAM: Decimal('1'),
        UNIT_KILOGRAM: Decimal('1000'),
        UNIT_MILLILITER: Decimal('1'),
        UNIT_LITER: Decimal('1000'),
    }

    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.CASCADE,
        related_name='salaz_prices',
    )
    household = models.ForeignKey(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='ingredient_prices',
    )
    price = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=10, choices=UNIT_CHOICES)
    supermarket = models.CharField(max_length=200, blank=True, default='')
    date = models.DateField()
    is_current = models.BooleanField(default=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f'{self.ingredient.name}: {self.price} / {self.amount}{self.unit}'

    def get_owner_object(self):
        return self.household

    @property
    def price_per_100g(self):
        """
        Normalize the price to a per-100g (or per-100ml) equivalent.

        Returns None when the unit is 'unit' (a discrete item with no fixed
        weight), or when the amount is zero.
        """
        base_factor = self._UNIT_TO_BASE.get(self.unit)
        if base_factor is None or not self.amount:
            return None
        base_amount = self.amount * base_factor
        if base_amount == 0:
            return None
        return (self.price / base_amount * Decimal('100')).quantize(Decimal('0.01'))
