"""
Crea (o repara) una cuenta ya verificada, sin pasar por el correo.

Sirve para dos cosas:

- La cuenta de prueba `salaz1`, que el usuario pidio con acceso directo:
      manage.py crear_usuario salaz1 --password 123456
- Cualquier cuenta que haya que dar de alta a mano en el servidor sin tener
  configurado el envio de correo.

Todo lo demas (altas desde la app) pasa siempre por la confirmacion por correo
de salaz/api/cuentas.py: esto es una herramienta de administracion del
servidor, no un atajo accesible desde fuera.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from salaz.models import AccountVerification


class Command(BaseCommand):
    help = 'Crea o actualiza un usuario con la cuenta ya verificada.'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('--password', required=True)
        parser.add_argument('--email', default='')
        parser.add_argument(
            '--staff',
            action='store_true',
            help='Ademas, da acceso al panel de administracion de Django.',
        )

    def handle(self, *args, **options):
        User = get_user_model()
        username = options['username']

        usuario, creado = User.objects.get_or_create(
            username=username,
            defaults={'email': options['email']},
        )
        usuario.set_password(options['password'])
        if options['email']:
            usuario.email = options['email']
        usuario.is_active = True
        if options['staff']:
            usuario.is_staff = True
        usuario.save()

        verificacion, _ = AccountVerification.objects.get_or_create(user=usuario)
        if not verificacion.verified:
            verificacion.verified = True
            verificacion.verified_at = timezone.now()
            verificacion.save(update_fields=['verified', 'verified_at'])

        self.stdout.write(
            self.style.SUCCESS(
                f'{"Creado" if creado else "Actualizado"} el usuario "{username}", '
                'verificado y listo para entrar.'
            )
        )
