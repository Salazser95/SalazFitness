from django.core.exceptions import ValidationError
from django.db import models

from salaz.models.ingredient_price import IngredientPrice
from wger.nutrition.models import Ingredient


class PurchaseItem(models.Model):
    """A single line item within a Purchase."""

    purchase = models.ForeignKey(
        'salaz.Purchase',
        on_delete=models.CASCADE,
        related_name='items',
    )
    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='salaz_purchase_items',
    )
    name = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Used when there is no matching ingredient, e.g. 'verduras varias'.",
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=10, choices=IngredientPrice.UNIT_CHOICES)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    is_shared = models.BooleanField(default=True)
    member = models.ForeignKey(
        'salaz.HouseholdMember',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_items',
        help_text='Set when this item belongs to one specific member, not the whole household.',
    )

    class Meta:
        ordering = ['id']

    def __str__(self):
        label = self.ingredient.name if self.ingredient else self.name
        return f'{label} ({self.price})'

    def get_owner_object(self):
        return self.purchase.household

    def clean(self):
        if not self.ingredient_id and not self.name:
            raise ValidationError('Either ingredient or name must be set.')
