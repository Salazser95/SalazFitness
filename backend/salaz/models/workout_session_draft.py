"""
Sesion de entrenamiento en curso (borrador).

Antes vivia en localStorage bajo `salaz.sesion.{routineId}.{fecha}` (ver
web/src/features/entreno/lib/sesionStorage.ts): las series que el usuario ya
ha marcado como hechas, antes de pulsar "Terminar" y que eso se convierta en
`workoutsession` + `workoutlog` de verdad en wger. Si se cae el wifi del
gimnasio o se recarga la pagina a media sesion, no se pierde el progreso.

Un borrador por (usuario, fecha): el contenido entero (que rutina, que dia,
que ejercicio toca, las series con peso/reps/rir de cada una) va en un
JSONField porque es exactamente la forma de SesionProgreso del cliente y solo
se lee/escribe entera, nunca fila a fila.
"""

from django.conf import settings
from django.db import models


class WorkoutSessionDraft(models.Model):
    """Progreso guardado de una sesion de entrenamiento aun sin terminar."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_workout_session_drafts',
    )
    date = models.DateField()
    #: SesionProgreso completo: routineId, dayId, ejercicioActual, ejercicios
    #: (con sus series) y el sesionId de wger una vez creado.
    content = models.JSONField(default=dict, blank=True)
    #: Ultima escritura gana entre dispositivos. Ver la nota completa en
    #: device_state.py.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'date'], name='salaz_workout_draft_unique_user_date'
            ),
        ]

    def __str__(self):
        return f'{self.user.username} {self.date}'

    def get_owner_object(self):
        return self
