from django.apps import AppConfig


class SalazConfig(AppConfig):
    """App config for the salaz app (SalazFitness extras on top of wger)."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'salaz'

    def ready(self):
        # Conecta los signals que alimentan ChangeFeed (sincronizacion en
        # tiempo real por SSE). El import va aqui dentro y no arriba del
        # todo del fichero porque ready() es el momento en que Django
        # garantiza que el registro de apps/modelos ya esta completo; hacer
        # el import a nivel de modulo arriesga fallar por modelos que aun no
        # se han cargado.
        from salaz import signals

        signals.conectar_signals()
