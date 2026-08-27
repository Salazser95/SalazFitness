"""
Agua bebida por dia.

Antes vivia solo en localStorage bajo `salaz.agua.{fecha}` (ver
web/src/features/nutricion/local.ts), asi que cada dispositivo (PC, Android,
iPhone) mostraba un total distinto. Aqui hay un registro por (usuario, fecha):
escribir el mismo dia dos veces actualiza el total, no lo suma, para que el
cliente pueda mandar sin mas "hoy van 750 ml" sin tener que llevar la cuenta
de la diferencia.
"""

from django.conf import settings
from django.db import models


class WaterLog(models.Model):
    """Mililitros de agua registrados por un usuario en una fecha concreta."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_water_logs',
    )
    date = models.DateField()
    milliliters = models.PositiveIntegerField(default=0)
    #: Ultima escritura gana entre dispositivos. Ver la nota completa en
    #: device_state.py.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(fields=['user', 'date'], name='salaz_waterlog_unique_user_date'),
        ]

    def __str__(self):
        return f'{self.user.username} {self.date}: {self.milliliters} ml'

    def get_owner_object(self):
        return self
