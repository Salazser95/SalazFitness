"""
Objetivo de peso del usuario.

wger no tiene campos para esto (comprobado: "goal_weight" da 0 resultados en
su repositorio, ver docs/API-CONTRACT.md). Antes vivia en localStorage bajo
`salaz.objetivo.peso` / `.fecha` / `.tipo` (ver web/src/features/yo/objetivo.ts).
Un objetivo por usuario: no tiene sentido guardar un historial, solo el que
esta vigente ahora mismo.
"""

from django.conf import settings
from django.db import models


class WeightGoal(models.Model):
    """El objetivo de peso vigente de un usuario. Uno solo, se sobreescribe."""

    PERDER_PESO = 'perder_peso'
    MANTENER_PESO = 'mantener_peso'
    GANAR_PESO = 'ganar_peso'
    GANAR_MASA_MUSCULAR = 'ganar_masa_muscular'
    MEJORAR_FUERZA = 'mejorar_fuerza'
    RECOMPOSICION_CORPORAL = 'recomposicion_corporal'

    # Mismos valores que TIPOS_OBJETIVO en web/src/features/yo/objetivo.ts.
    TIPO_CHOICES = [
        (PERDER_PESO, 'Perder peso'),
        (MANTENER_PESO, 'Mantener peso'),
        (GANAR_PESO, 'Ganar peso'),
        (GANAR_MASA_MUSCULAR, 'Ganar masa muscular'),
        (MEJORAR_FUERZA, 'Mejorar fuerza'),
        (RECOMPOSICION_CORPORAL, 'Recomposicion corporal'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_weight_goal',
    )
    goal_type = models.CharField(max_length=30, choices=TIPO_CHOICES, blank=True, default='')
    target_weight = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    #: Ultima escritura gana entre dispositivos. Ver la nota completa en
    #: device_state.py.
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Objetivo de {self.user.username}'

    def get_owner_object(self):
        return self
