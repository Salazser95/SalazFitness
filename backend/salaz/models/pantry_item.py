from django.core.exceptions import ValidationError
from django.db import models

from salaz.models.ingredient_price import IngredientPrice
from wger.nutrition.models import Ingredient


class PantryItem(models.Model):
    """
    Cuanto queda en la despensa de un hogar de un producto dado.

    Se alimenta de dos sitios: a mano (anadir, corregir o borrar una linea
    desde la pantalla de despensa) y en automatico cuando se marca una
    linea de PurchaseItem como comprada (ver PurchaseItemViewSet en
    salaz/api/views.py): la cantidad de esa linea se suma al stock ya
    existente para el mismo ingrediente/nombre y unidad, o crea una fila
    nueva si no habia. Desmarcarla por error, o borrar esa linea de compra,
    resta la misma cantidad (sin bajar de cero).

    Deliberadamente no se descuenta solo al anotar una comida en el diario
    de nutricion: casar unidades de receta (gramos) con unidades de compra
    (kg, l, unidades sueltas...) de forma fiable es un problema aparte, y
    aqui basta con que el stock se pueda ajustar a mano segun se va gastando.
    """

    household = models.ForeignKey(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='pantry_items',
    )
    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='salaz_pantry_items',
    )
    name = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Used when there is no matching ingredient, e.g. 'verduras varias'.",
    )
    unit = models.CharField(max_length=10, choices=IngredientPrice.UNIT_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ['id']

    def __str__(self):
        label = self.ingredient.name if self.ingredient else self.name
        return f'{label}: {self.amount}{self.unit}'

    def get_owner_object(self):
        return self.household

    def clean(self):
        if not self.ingredient_id and not self.name:
            raise ValidationError('Either ingredient or name must be set.')
