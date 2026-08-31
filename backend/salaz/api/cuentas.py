"""
Alta de usuarios con confirmacion por correo.

Tres endpoints publicos (sin token, por definicion: quien se registra todavia
no tiene cuenta) y uno privado:

    POST /api/v2/salaz/account/register/   alta -> manda el correo
    POST /api/v2/salaz/account/verify/     confirma con el token del correo
    POST /api/v2/salaz/account/resend/     reenvia el correo
    GET  /api/v2/salaz/account/me/         estado de la cuenta que llama

Los tres publicos van con limite de peticiones por IP. Es la razon de ser de
todo esto: un servidor casero no aguanta que le abran cuentas en bucle, y sin
confirmar el correo no hay forma de distinguir a una persona de un script.

La cuenta se crea con `is_active=False`. wger ya rechaza el login de un usuario
inactivo, asi que la verificacion queda impuesta sin modificar nada de wger.
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.viewsets import ViewSet

from salaz.exportacion import exportar_datos_usuario, importar_datos_usuario
from salaz.models import AccountVerification


User = get_user_model()

#: Minutos que hay que esperar entre dos correos de confirmacion al mismo
#: usuario. Ademas del limite por IP: si no, un solo correo valido basta para
#: usar el servidor de envio como altavoz.
MINUTOS_ENTRE_CORREOS = 5

#: Tope de correos por cuenta. Pasado esto hay que crear la cuenta de nuevo.
MAX_CORREOS = 5


class AltaThrottle(AnonRateThrottle):
    """Altas por IP. El `rate` se declara aqui y no en settings para que el
    limite viaje con el modulo y no dependa de como este configurado wger."""

    scope = 'salaz-alta'
    rate = '5/hour'


class ReenvioThrottle(AnonRateThrottle):
    scope = 'salaz-reenvio'
    rate = '5/hour'


class VerificacionThrottle(AnonRateThrottle):
    """Mas holgado: verificar es idempotente y el token ya es secreto."""

    scope = 'salaz-verificacion'
    rate = '20/hour'


# ------------------------------------------------------------- serializers


class RegistroSerializer(serializers.Serializer):
    username = serializers.RegexField(
        r'^[\w.@+-]+$',
        max_length=150,
        help_text='Letras, numeros y . @ + - _',
    )
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=6, max_length=128)

    def validate_username(self, valor):
        if User.objects.filter(username__iexact=valor).exists():
            raise serializers.ValidationError('Ese nombre de usuario ya esta cogido.')
        return valor

    def validate_email(self, valor):
        # Sin unicidad en el correo no hay filtro que valga: la misma direccion
        # podria abrir cuentas sin limite.
        if User.objects.filter(email__iexact=valor).exists():
            raise serializers.ValidationError('Ya hay una cuenta con ese correo.')
        return valor.lower()

    def validate_password(self, valor):
        try:
            validate_password(valor)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages)) from e
        return valor


class VerificarSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=64)


class ReenviarSerializer(serializers.Serializer):
    email = serializers.EmailField()


# ------------------------------------------------------------------ correo


def _url_de_verificacion(token: str) -> str:
    """
    El enlace que se manda por correo.

    `SALAZ_APP_URL` es donde vive la app (la PWA o el dominio del movil). Se
    define en los settings de despliegue; en desarrollo cae al localhost de
    Vite.
    """
    base = getattr(settings, 'SALAZ_APP_URL', 'http://localhost:5173').rstrip('/')
    return f'{base}/verificar?token={token}'


def enviar_correo_verificacion(verificacion: AccountVerification) -> None:
    """Manda (o reenvia) el correo de confirmacion. El token se renueva."""
    token = verificacion.regenerar_token()
    enlace = _url_de_verificacion(token)
    send_mail(
        subject='Confirma tu cuenta de SalazFitness',
        message=(
            f'Hola {verificacion.user.username},\n\n'
            'Para poder entrar en SalazFitness confirma tu cuenta desde este enlace:\n\n'
            f'{enlace}\n\n'
            f'El enlace vale {AccountVerification.HORAS_VALIDEZ} horas.\n'
            'Si no has sido tu, ignora este mensaje: la cuenta no se activara.\n'
        ),
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
        recipient_list=[verificacion.user.email],
        fail_silently=False,
    )


# -------------------------------------------------------------------- vista


class AccountViewSet(ViewSet):
    """Alta y confirmacion de cuentas. Ver la nota de cabecera del modulo."""

    permission_classes = [AllowAny]
    # wger marca sus endpoints privados con esto; aqui es explicitamente false
    # porque registrarse y verificar tienen que funcionar sin sesion.
    is_private = False

    def get_throttles(self):
        if self.action == 'register':
            return [AltaThrottle()]
        if self.action == 'resend':
            return [ReenvioThrottle()]
        if self.action == 'verify':
            return [VerificacionThrottle()]
        return super().get_throttles()

    @action(detail=False, methods=['post'])
    def register(self, request):
        serializer = RegistroSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data

        try:
            with transaction.atomic():
                usuario = User.objects.create_user(
                    username=datos['username'],
                    email=datos['email'],
                    password=datos['password'],
                    # Hasta confirmar el correo no se puede entrar.
                    is_active=False,
                )
                verificacion = AccountVerification.objects.create(user=usuario)
        except IntegrityError:
            # Dos altas simultaneas con el mismo usuario: la validacion previa
            # no basta, la unicidad la garantiza la base de datos.
            return Response(
                {'detail': 'Ese nombre de usuario ya esta cogido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            enviar_correo_verificacion(verificacion)
        except Exception:
            # Si el correo no sale, la cuenta a medias no sirve para nada y
            # ademas bloquea el nombre de usuario: se deshace el alta.
            usuario.delete()
            return Response(
                {'detail': 'No se ha podido enviar el correo de confirmacion. Intentalo mas tarde.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                'detail': 'Cuenta creada. Confirma el correo que te hemos enviado para poder entrar.',
                'username': usuario.username,
                'email': usuario.email,
                'verified': False,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'])
    def verify(self, request):
        serializer = VerificarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        verificacion = AccountVerification.objects.filter(
            token=serializer.validated_data['token']
        ).first()
        if verificacion is None:
            return Response(
                {'detail': 'Ese enlace no vale. Pide uno nuevo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if verificacion.verified:
            return Response({'detail': 'La cuenta ya estaba confirmada.', 'verified': True})
        if verificacion.expired:
            return Response(
                {'detail': 'El enlace ha caducado. Pide uno nuevo desde la app.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verificacion.confirmar()
        return Response(
            {
                'detail': 'Cuenta confirmada. Ya puedes entrar.',
                'username': verificacion.user.username,
                'verified': True,
            }
        )

    @action(detail=False, methods=['post'])
    def resend(self, request):
        serializer = ReenviarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        correo = serializer.validated_data['email'].lower()

        # Respuesta identica exista o no la cuenta: si no, este endpoint sirve
        # para averiguar que correos estan registrados.
        generica = Response(
            {'detail': 'Si esa cuenta existe y esta pendiente, le llegara un correo.'}
        )

        usuario = User.objects.filter(email__iexact=correo).first()
        if usuario is None:
            return generica
        verificacion = AccountVerification.objects.filter(user=usuario).first()
        if verificacion is None or verificacion.verified:
            return generica
        if verificacion.emails_sent >= MAX_CORREOS:
            return generica
        if verificacion.sent_at and timezone.now() - verificacion.sent_at < timedelta(
            minutes=MINUTOS_ENTRE_CORREOS
        ):
            return generica

        try:
            enviar_correo_verificacion(verificacion)
        except Exception:
            return generica
        return generica

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        """Estado de la cuenta que llama. La app lo usa para avisar si esta pendiente."""
        verificacion = AccountVerification.objects.filter(user=request.user).first()
        return Response(
            {
                'username': request.user.username,
                'email': request.user.email,
                # Una cuenta sin fila de verificacion es anterior a esto (por
                # ejemplo el admin de wger): si puede entrar, esta verificada.
                'verified': verificacion.verified if verificacion else True,
                'pending_since': verificacion.created if verificacion and not verificacion.verified else None,
            }
        )

    @action(detail=False, methods=['get'], url_path='exportar-todo', permission_classes=[IsAuthenticated])
    def exportar_todo(self, request):
        """
        Descarga entreno, nutricion, compra, peso y perfil en un unico JSON.
        Pensado para llevarlo de una instalacion a otra: ver importar_todo,
        que consume exactamente este formato (ver salaz/exportacion.py).
        """
        return Response(
            exportar_datos_usuario(request.user, request.get_host()),
            headers={
                'Content-Disposition': 'attachment; filename="salazfitness-exportacion.json"',
            },
        )

    @action(detail=False, methods=['post'], url_path='importar-todo', permission_classes=[IsAuthenticated])
    def importar_todo(self, request):
        """
        Vuelve a montar, para el usuario que llama, un JSON generado por
        exportar_todo (tipicamente de OTRA instalacion). Cada ejercicio y
        cada alimento se resuelve por nombre contra el catalogo local antes
        de escribir nada que dependa de el (ver salaz/exportacion.py):
        nunca se copian ids de otra base de datos tal cual.

        Responde 200 con el resumen de lo hecho (creados/omitidos/fallos)
        incluso si algunas filas no se han podido importar -- una fila mal
        formada no aborta el resto.
        """
        datos = request.data
        if not isinstance(datos, dict):
            return Response(
                {'detail': 'El cuerpo tiene que ser el JSON de una exportacion.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        informe = importar_datos_usuario(request.user, datos, request.get_host())
        return Response(informe)
