from decimal import Decimal

from django.db import models
from django.db.models import Sum


class ShoppingList(models.Model):
    """A shopping list for a household, covering a date range."""

    household = models.ForeignKey(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='shopping_lists',
    )
    name = models.CharField(max_length=255)
    start_date = models.DateField()
    end_date = models.DateField()
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created']

    def __str__(self):
        return self.name

    def get_owner_object(self):
        return self.household

    @property
    def estimated_total(self) -> Decimal:
        total = self.items.aggregate(total=Sum('estimated_price'))['total']
        return total if total is not None else Decimal('0.00')
