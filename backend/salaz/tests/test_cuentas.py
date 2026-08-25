"""
Pruebas del alta de cuenta con confirmacion por correo.

Lo que se comprueba es que la cuenta NO sirve hasta confirmar el correo: es lo
unico que impide que alguien abra cuentas en bucle contra el servidor.
"""

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status

from salaz.models import AccountVerification
from salaz.tests.test_api import SalazApiTestCase


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    SALAZ_APP_URL='https://ejemplo.test',
)
class AltaDeCuentaTests(SalazApiTestCase):
    URL_ALTA = '/api/v2/salaz/account/register/'
    URL_VERIFICAR = '/api/v2/salaz/account/verify/'

    def setUp(self):
        mail.outbox = []
        # DRF lleva la cuenta del limite por IP en la cache, que no se vacia
        # entre pruebas: sin esto, la sexta alta de la clase sale con un 429.
        cache.clear()

    def _alta(self, username='nuevo', email='nuevo@ejemplo.test'):
        return self.client.post(
            self.URL_ALTA,
            {'username': username, 'email': email, 'password': 'contrasena-larga-9'},
            format='json',
        )

    def test_la_cuenta_nace_desactivada_y_manda_correo(self):
        respuesta = self._alta()
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        usuario = User.objects.get(username='nuevo')
        # is_active=False es la clave: el login de wger ya rechaza estas
        # cuentas, asi que la verificacion queda impuesta sin tocar wger.
        self.assertFalse(usuario.is_active)
        self.assertEqual(len(mail.outbox), 1)

    def test_el_correo_lleva_el_enlace_de_la_app(self):
        self._alta()
        verificacion = AccountVerification.objects.get(user__username='nuevo')
        self.assertIn(
            f'https://ejemplo.test/verificar?token={verificacion.token}',
            mail.outbox[0].body,
        )

    def test_verificar_activa_la_cuenta(self):
        self._alta()
        verificacion = AccountVerification.objects.get(user__username='nuevo')
        respuesta = self.client.post(
            self.URL_VERIFICAR, {'token': verificacion.token}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        verificacion.refresh_from_db()
        self.assertTrue(verificacion.verified)
        self.assertTrue(verificacion.user.is_active)

    def test_un_token_inventado_no_activa_nada(self):
        respuesta = self.client.post(self.URL_VERIFICAR, {'token': 'inventado'}, format='json')
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verificar_dos_veces_no_falla(self):
        self._alta()
        verificacion = AccountVerification.objects.get(user__username='nuevo')
        self.client.post(self.URL_VERIFICAR, {'token': verificacion.token}, format='json')
        respuesta = self.client.post(
            self.URL_VERIFICAR, {'token': verificacion.token}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)

    def test_el_mismo_correo_no_abre_dos_cuentas(self):
        self._alta()
        respuesta = self._alta(username='otro')
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_el_mismo_usuario_no_se_repite(self):
        self._alta()
        respuesta = self._alta(email='distinto@ejemplo.test')
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_una_contrasena_debil_se_rechaza(self):
        respuesta = self.client.post(
            self.URL_ALTA,
            {'username': 'debil', 'email': 'debil@ejemplo.test', 'password': '123456'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='debil').exists())

    def test_el_limite_por_ip_corta_las_altas_en_bucle(self):
        """
        Lo que pedia el encargo: que nadie pueda abrir cuentas sin parar contra
        el servidor. `AltaThrottle` deja 5 por hora y por IP.

        Ojo con la cache: DRF lleva ahi la cuenta, asi que en produccion tiene
        que ser compartida entre procesos o cada worker de gunicorn contaria
        por su cuenta (ver la nota de CACHES en salaz_settings_prod.py).
        """
        for i in range(5):
            respuesta = self._alta(username=f'usuario{i}', email=f'usuario{i}@ejemplo.test')
            self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)

        respuesta = self._alta(username='sexto', email='sexto@ejemplo.test')
        self.assertEqual(respuesta.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertFalse(User.objects.filter(username='sexto').exists())

    def test_el_reenvio_no_delata_que_correos_existen(self):
        # Misma respuesta exista o no la cuenta: si no, este endpoint sirve
        # para averiguar quien esta registrado.
        self._alta()
        conocido = self.client.post(
            '/api/v2/salaz/account/resend/', {'email': 'nuevo@ejemplo.test'}, format='json'
        )
        desconocido = self.client.post(
            '/api/v2/salaz/account/resend/', {'email': 'nadie@ejemplo.test'}, format='json'
        )
        self.assertEqual(conocido.status_code, desconocido.status_code)
        self.assertEqual(conocido.data, desconocido.data)
