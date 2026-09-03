"""
Preferencias pequenas que tienen que viajar entre dispositivos.

`rutinaActivaId` y `planActivoId` son casi una preferencia de dispositivo
(como `salaz.idioma` o `salaz.ajustes.*`, que siguen siendo locales aposta),
pero el dueno de esta app la usa desde el PC, un emulador de Android y su
iPhone, y quiere que elegir la rutina activa en uno se note en los otros. De
ahi este modelo de clave/valor en vez de anadir dos columnas sueltas a algun
otro sitio: es deliberadamente pequeno, solo para estas dos claves, no un
cajon de sastre para cualquier preferencia futura.

### Por que "ultima escritura gana"

El dueno lo pidio explicito: si cambia la rutina activa en el iPhone y luego
en el PC, tiene que quedar la del PC. No hay fusion de cambios ni historial:
cada modelo nuevo de sincronizacion (este, y los de water_log.py,
weight_goal.py, weekly_plan.py, favorite_ingredient.py, recent_ingredient.py y
workout_session_draft.py) lleva un `updated_at` con `auto_now=True`, y el
serializer lo expone en solo lectura para que el cliente pueda comparar. El
servidor no hace nada mas listo que eso: cada escritura pisa a la anterior sin
mirar marcas de tiempo, asi que quien escribe el ultimo, gana, tal cual se
pidio. El `updated_at` de vuelta es lo que le permite a un cliente avanzado
darse cuenta de que otro dispositivo escribio despues de su ultima lectura.
"""

from django.conf import settings
from django.db import models


class DeviceState(models.Model):
    """Un par clave/valor por usuario, para preferencias que cruzan dispositivos."""

    RUTINA_ACTIVA = 'rutina_activa'
    PLAN_ACTIVO = 'plan_activo'

    KEY_CHOICES = [
        (RUTINA_ACTIVA, 'Rutina activa'),
        (PLAN_ACTIVO, 'Plan de nutricion activo'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_device_states',
    )
    key = models.CharField(max_length=30, choices=KEY_CHOICES)
    #: Texto siempre: el id de rutina (numerico) y el de plan de nutricion
    #: (UUID) se guardan como texto para no tener dos columnas de tipos
    #: distintos en un modelo pensado para ser generico entre las dos claves.
    value = models.CharField(max_length=64, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']
        constraints = [
            models.UniqueConstraint(fields=['user', 'key'], name='salaz_device_state_unique_user_key'),
        ]

    def __str__(self):
        return f'{self.user.username}.{self.key} = {self.value}'

    def get_owner_object(self):
        return self
