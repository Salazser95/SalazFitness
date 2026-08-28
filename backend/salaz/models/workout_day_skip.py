"""
Marca explicita de "esta fecha se salto a proposito".

Sin esta fila y sin una `WorkoutSession` registrada, una fecha con
entrenamiento planificado simplemente no tiene datos: eso es ambiguo,
podria significar "todavia no he llegado a marcarlo" o "decidi no
entrenar". Confundir las dos cosas era justo lo que se pidio evitar: la
ausencia de registros nunca debe leerse como "no entrene", solo esta fila
significa eso.

Un marcado no es un movimiento (no hay una `WorkoutReschedule` de por
medio: nada se mueve a otra fecha), asi que es su propio modelo, no un
caso mas de `WorkoutReschedule`.
"""

from django.conf import settings
from django.db import models


class WorkoutDaySkip(models.Model):
    """Una fecha que se decidio explicitamente no entrenar."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_workout_day_skips',
    )
    date = models.DateField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(fields=['user', 'date'], name='salaz_day_skip_unique_user_date'),
        ]

    def __str__(self):
        return f'{self.user.username}: {self.date} omitido'

    def get_owner_object(self):
        return self
