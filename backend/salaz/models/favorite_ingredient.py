"""
Alimentos marcados como favoritos.

Antes vivia en localStorage bajo `salaz.alimentos.favoritos` (ver
web/src/features/nutricion/local.ts), guardando una copia de los macros del
alimento. Aqui basta con enlazar al Ingredient de wger: el cliente ya sabe
pedir sus datos completos por id, y duplicar 177.302 filas de macros no
aporta nada que wger no de ya.
"""

from django.conf import settings
from django.db import models

from wger.nutrition.models import Ingredient


class FavoriteIngredient(models.Model):
    """Un alimento marcado como favorito por un usuario."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_favorite_ingredients',
    )
    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.CASCADE,
        related_name='salaz_favorited_by',
    )
    created = models.DateTimeField(auto_now_add=True)
    #: Ultima escritura gana entre dispositivos. Ver la nota completa en
    #: device_state.py.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'ingredient'], name='salaz_favorite_unique_user_ingredient'
            ),
        ]

    def __str__(self):
        return f'{self.user.username}: {self.ingredient.name}'

    def get_owner_object(self):
        return self
