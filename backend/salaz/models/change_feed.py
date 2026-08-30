from django.db import models


class ChangeFeed(models.Model):
    """
    Registro de "algo ha cambiado" para la sincronizacion en tiempo real (SSE).

    Por que una tabla y no un pub/sub en memoria: la API corre detras de
    gunicorn con varios workers (procesos independientes, sin memoria
    compartida). Si el aviso de "algo cambio" se guardara solo en una lista
    en RAM del proceso que atendio la escritura, la peticion SSE de otro
    usuario -atendida por otro worker- nunca lo veria. Escribiendolo aqui,
    cualquier worker que atienda el endpoint de eventos puede leer los
    cambios nuevos con una simple consulta con cursor (ver
    api/views.py:eventos_sse y _cambios_desde), sin depender de en que
    proceso ocurrio la escritura original.

    No guarda el contenido del cambio, solo "en esta entidad, de este hogar,
    ha pasado algo": el cliente reacciona refrescando ese recurso via la API
    normal, que ya hace el filtrado de permisos y devuelve el dato completo.
    Guardar aqui el propio dato duplicaria la logica de serializacion y de
    acceso, para un canal que solo necesita decir "refresca".

    Las filas son de usar y tirar: se leen una vez por cada cliente conectado
    y se podan pasada una hora (ver podar_cambios_viejos en signals.py), asi
    que esta tabla no esta pensada como historial ni como fuente de verdad.
    """

    household = models.ForeignKey(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='changes',
    )
    #: 'pantry-item', 'purchase', ... — ver el mapa completo en signals.py.
    entity = models.CharField(max_length=40)
    created = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['id']
        indexes = [models.Index(fields=['household', 'id'])]

    def __str__(self):
        return f'{self.entity} @ household {self.household_id} (#{self.pk})'
