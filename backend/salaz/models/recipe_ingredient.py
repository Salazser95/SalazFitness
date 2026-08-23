from django.db import models

from wger.nutrition.models import Ingredient


class RecipeIngredient(models.Model):
    """One ingredient line within a Recipe. Amount is always in grams."""

    recipe = models.ForeignKey(
        'salaz.Recipe',
        on_delete=models.CASCADE,
        related_name='ingredients',
    )
    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.CASCADE,
        related_name='salaz_recipe_ingredients',
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, help_text='Grams')

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.ingredient.name}: {self.amount}g ({self.recipe.name})'

    def get_owner_object(self):
        return self.recipe.household
