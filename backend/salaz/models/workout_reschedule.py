"""
Mover el entreno de una fecha a otra, sin tocar la rutina.

Antes vivia en localStorage bajo `salaz.entreno.movidos.{routineId}` (ver
web/src/features/entreno/local.ts, `MovidosMap`): un mapa fecha origen ->
fecha destino, calculado en el cliente. Aqui es una fila por movimiento, para
que cruce dispositivos y para poder guardar mas que un simple par de fechas.

### Por que es un intercambio, no un "mover a secas"

"Mover el entreno de hoy al jueves" no vacia el jueves: LO QUE HUBIERA
TOCADO el jueves pasa a tocar hoy. Es justo lo que describio el dueno ("si
martes es dia de pierna... y si jueves tocaba pecho, tocara piernas"). Por
eso el modelo guarda las DOS mitades del intercambio, no solo una fecha de
origen: `origin_*` es lo que habia en `origin_date` antes de moverlo,
`target_*` es lo que habia en `target_date`. Resolver una fecha cualquiera
es mirar si aparece como origen o como destino de alguna fila y devolver la
mitad contraria (ver `entreno/reprogramacion.ts` en el frontend).

### Por que se congela la rutina/dia en el momento del movimiento

`origin_routine`/`origin_day`/`target_routine`/`target_day` son el id que
`GET /api/v2/routine/{id}/date-sequence-gym/` decia que tocaba en cada fecha
EN EL MOMENTO de crear la fila, no un calculo que se repite cada vez que se
lee. Si mas tarde se edita la rutina (se cambia que dia va cada semana), un
movimiento ya hecho no tiene por que cambiar de sentido con el; se deshace
borrando la fila, se vuelve a crear si hace falta con los datos nuevos.

### Por que no hay ForeignKey a Routine ni a Day de wger

Este modulo no tiene en ningun otro sitio una importacion directa de esos
dos modelos (a diferencia de `Ingredient`, que si se importa en varios
ficheros): el frontend solo habla con `/api/v2/routine/` y `/api/v2/day/`
por REST, nunca por el ORM. Sin poder verificar aqui la ruta exacta de esos
modelos en la version de wger que se vaya a desplegar, se guardan como
enteros sueltos, igual que `DeviceState.value` ya guarda el id de la rutina
activa como texto: la autorizacion la sigue dando el filtro por `user` de
este modelo, no una FK a un modelo ajeno.

Null en cualquiera de los cuatro campos de dia/rutina significa "esa fecha
era descanso": no hay Day que journal.
"""

from django.conf import settings
from django.db import models


class WorkoutReschedule(models.Model):
    """Intercambio puntual entre dos fechas. No modifica la rutina en si."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_workout_reschedules',
    )
    origin_date = models.DateField()
    target_date = models.DateField()

    origin_routine = models.IntegerField(null=True, blank=True)
    origin_day = models.IntegerField(null=True, blank=True)
    target_routine = models.IntegerField(null=True, blank=True)
    target_day = models.IntegerField(null=True, blank=True)

    created = models.DateTimeField(auto_now_add=True)
    #: Ultima escritura gana entre dispositivos. Ver la nota completa en
    #: device_state.py. Aqui en la practica casi no aplica (crear/borrar,
    #: no se actualiza in situ), pero se mantiene el mismo campo en todos
    #: los modelos de sincronizacion por consistencia.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created']
        constraints = [
            # Una fecha no puede ser origen de dos movimientos a la vez: si
            # ya se movio, hay que deshacer ese primero. Ver la validacion
            # de "una fecha no puede ser origen Y destino a la vez" en el
            # serializer, que una constraint de base de datos no puede
            # expresar (compara dos columnas de filas distintas).
            models.UniqueConstraint(
                fields=['user', 'origin_date'], name='salaz_reschedule_unique_origin'
            ),
            models.UniqueConstraint(
                fields=['user', 'target_date'], name='salaz_reschedule_unique_target'
            ),
        ]

    def __str__(self):
        return f'{self.user.username}: {self.origin_date} <-> {self.target_date}'

    def get_owner_object(self):
        return self
