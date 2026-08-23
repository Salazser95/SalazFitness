from django.db import models

from salaz.models.ingredient_price import IngredientPrice
from wger.nutrition.models import Ingredient


class ShoppingListItem(models.Model):
    """A single line item within a ShoppingList."""

    shopping_list = models.ForeignKey(
        'salaz.ShoppingList',
        on_delete=models.CASCADE,
        related_name='items',
    )
    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='salaz_shopping_list_items',
    )
    name = models.CharField(max_length=255, blank=True, default='')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=10, choices=IngredientPrice.UNIT_CHOICES)
    estimated_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    purchased = models.BooleanField(default=False)
    supermarket = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        ordering = ['id']

    def __str__(self):
        label = self.ingredient.name if self.ingredient else self.name
        return f'{label} ({self.amount}{self.unit})'

    def get_owner_object(self):
        return self.shopping_list.household
