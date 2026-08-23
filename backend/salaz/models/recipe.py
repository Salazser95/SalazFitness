from decimal import Decimal

from django.db import models


def recipe_image_upload_dir(instance, filename):
    return f'recipe-images/{instance.pk or "new"}/{filename}'


class Recipe(models.Model):
    """A recipe belonging to a household, used to plan meals and shopping lists."""

    household = models.ForeignKey(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='recipes',
    )
    name = models.CharField(max_length=255)
    servings = models.PositiveIntegerField()
    instructions = models.TextField(blank=True, default='')
    image = models.ImageField(upload_to=recipe_image_upload_dir, blank=True, null=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def get_owner_object(self):
        return self.household

    def _current_price_per_100g(self, ingredient_id):
        # Local import to avoid a circular import between recipe.py and
        # ingredient_price.py at module load time.
        from salaz.models.ingredient_price import IngredientPrice

        price = (
            IngredientPrice.objects.filter(
                household=self.household,
                ingredient_id=ingredient_id,
                is_current=True,
            )
            .order_by('-date')
            .first()
        )
        if price is None:
            return None
        return price.price_per_100g

    @property
    def total_cost(self) -> Decimal:
        total = Decimal('0.00')
        for recipe_ingredient in self.ingredients.select_related('ingredient').all():
            price_per_100g = self._current_price_per_100g(recipe_ingredient.ingredient_id)
            if price_per_100g is None:
                continue
            total += (price_per_100g / Decimal('100')) * recipe_ingredient.amount
        return total.quantize(Decimal('0.01'))

    @property
    def cost_per_serving(self) -> Decimal:
        if not self.servings:
            return Decimal('0.00')
        return (self.total_cost / self.servings).quantize(Decimal('0.01'))

    def _macro_total(self, field_name) -> Decimal:
        total = Decimal('0.00')
        for recipe_ingredient in self.ingredients.select_related('ingredient').all():
            per_100g = getattr(recipe_ingredient.ingredient, field_name)
            if per_100g is None:
                continue
            total += Decimal(per_100g) * recipe_ingredient.amount / Decimal('100')
        return total.quantize(Decimal('0.01'))

    @property
    def energy(self) -> Decimal:
        return self._macro_total('energy')

    @property
    def protein(self) -> Decimal:
        return self._macro_total('protein')

    @property
    def carbohydrates(self) -> Decimal:
        return self._macro_total('carbohydrates')

    @property
    def fat(self) -> Decimal:
        return self._macro_total('fat')
