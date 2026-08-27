"""
Ultimos alimentos usados.

Antes vivia en localStorage bajo `salaz.alimentos.recientes` (ver
web/src/features/nutricion/local.ts): el 80% de lo que come alguien se repite,
asi que la lista de recientes es el atajo que mas se usa al registrar una
comida. Igual que en el cliente, tope de 30 y orden por fecha de uso: usar de
nuevo un alimento que ya estaba en la lista lo sube al principio en vez de
duplicarlo.
"""

from django.conf import settings
from django.db import models

from wger.nutrition.models import Ingredient

#: Mismo tope que RECIENTES_MAX en web/src/features/nutricion/local.ts.
MAX_RECIENTES = 30


class RecentIngredient(models.Model):
    """Un alimento usado recientemente por un usuario."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_recent_ingredients',
    )
    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.CASCADE,
        related_name='salaz_recently_used_by',
    )
    #: Se actualiza en cada uso (auto_now): es la fecha de uso que ordena la
    #: lista y decide que se recorta al pasar de MAX_RECIENTES, y es a la vez
    #: el campo de "ultima escritura gana" que llevan todos estos modelos
    #: (ver la nota completa en device_state.py).
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'ingredient'], name='salaz_recent_unique_user_ingredient'
            ),
        ]

    def __str__(self):
        return f'{self.user.username}: {self.ingredient.name}'

    def get_owner_object(self):
        return self
