"""
Pruebas de WorkoutReschedule (intercambio de fecha) y WorkoutDaySkip (marca
de omitido a proposito). Ver las notas completas en
salaz/models/workout_reschedule.py y salaz/models/workout_day_skip.py.

Lo que se cubre:
  - crear un intercambio guarda las dos mitades tal cual se mandaron
  - no se puede intercambiar una fecha consigo misma
  - una fecha ya metida en un movimiento (como origen O como destino) no
    se puede volver a mover sin deshacer el primero
  - deshacer es un DELETE normal, y no revive validaciones raras
  - un usuario no ve ni puede tocar los movimientos/omisiones de otro
  - marcar la misma fecha como omitida dos veces no duplica
"""

from django.contrib.auth.models import User
from rest_framework import status

from salaz.models import WorkoutDaySkip, WorkoutReschedule
from salaz.tests.test_api import SalazApiTestCase


class WorkoutRescheduleApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw')
        self.other = User.objects.create_user(username='bob', password='pw')
        self.client.force_authenticate(user=self.user)

    def test_crear_guarda_las_dos_mitades_del_intercambio(self):
        respuesta = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {
                'origin_date': '2026-08-25',
                'target_date': '2026-08-27',
                'origin_routine': 10,
                'origin_day': 100,
                'target_routine': 10,
                'target_day': 102,
            },
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertEqual(respuesta.data['origin_date'], '2026-08-25')
        self.assertEqual(respuesta.data['target_date'], '2026-08-27')
        self.assertEqual(respuesta.data['origin_day'], 100)
        self.assertEqual(respuesta.data['target_day'], 102)
        self.assertIn('updated_at', respuesta.data)
        self.assertIn('created', respuesta.data)

    def test_una_fecha_de_descanso_puede_mover_null_como_dia(self):
        # martes era descanso (sin rutina/dia); se intercambia con el jueves
        # que si entrenaba.
        respuesta = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {
                'origin_date': '2026-08-25',
                'target_date': '2026-08-27',
                'origin_routine': None,
                'origin_day': None,
                'target_routine': 10,
                'target_day': 102,
            },
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertIsNone(respuesta.data['origin_day'])
        self.assertEqual(respuesta.data['target_day'], 102)

    def test_no_se_puede_intercambiar_una_fecha_consigo_misma(self):
        respuesta = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-25'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WorkoutReschedule.objects.count(), 0)

    def test_fechas_son_obligatorias(self):
        respuesta = self.client.post(
            '/api/v2/salaz/workout-reschedule/', {'origin_date': '2026-08-25'}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

        respuesta = self.client.post('/api/v2/salaz/workout-reschedule/', {}, format='json')
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_se_puede_volver_a_mover_una_fecha_ya_movida_como_origen(self):
        self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-27'},
            format='json',
        )
        # 25 ya es origen de un movimiento: intentar moverlo otra vez (a un
        # tercer dia distinto) debe rechazarse hasta deshacer el primero.
        respuesta = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-29'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WorkoutReschedule.objects.count(), 1)

    def test_no_se_puede_mover_una_fecha_ya_metida_como_destino(self):
        self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-27'},
            format='json',
        )
        # el 27 ya es el destino de un movimiento: no puede ser el origen
        # (ni el destino) de otro sin deshacer antes.
        respuesta = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-27', 'target_date': '2026-08-29'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(WorkoutReschedule.objects.count(), 1)

    def test_deshacer_es_borrar_la_fila_y_libera_las_fechas(self):
        creado = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-27'},
            format='json',
        )
        movimiento_id = creado.data['id']

        borrado = self.client.delete(f'/api/v2/salaz/workout-reschedule/{movimiento_id}/')
        self.assertEqual(borrado.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(WorkoutReschedule.objects.count(), 0)

        # con la fila deshecha, esas mismas fechas se pueden volver a usar
        respuesta = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-27'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)

    def test_otro_usuario_no_ve_ni_puede_tocar_el_movimiento_ajeno(self):
        creado = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-27'},
            format='json',
        )
        movimiento_id = creado.data['id']

        self.client.force_authenticate(user=self.other)
        respuesta_lista = self.client.get('/api/v2/salaz/workout-reschedule/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_detalle = self.client.get(f'/api/v2/salaz/workout-reschedule/{movimiento_id}/')
        self.assertEqual(respuesta_detalle.status_code, status.HTTP_404_NOT_FOUND)

        respuesta_borrado = self.client.delete(f'/api/v2/salaz/workout-reschedule/{movimiento_id}/')
        self.assertEqual(respuesta_borrado.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(WorkoutReschedule.objects.count(), 1)

    def test_el_mismo_usuario_puede_tener_movimientos_en_fechas_distintas(self):
        primero = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-27'},
            format='json',
        )
        segundo = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-09-01', 'target_date': '2026-09-03'},
            format='json',
        )
        self.assertEqual(primero.status_code, status.HTTP_201_CREATED)
        self.assertEqual(segundo.status_code, status.HTTP_201_CREATED)
        self.assertEqual(WorkoutReschedule.objects.filter(user=self.user).count(), 2)

    def test_dos_usuarios_pueden_usar_las_mismas_fechas_sin_chocar(self):
        self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-27'},
            format='json',
        )
        self.client.force_authenticate(user=self.other)
        respuesta = self.client.post(
            '/api/v2/salaz/workout-reschedule/',
            {'origin_date': '2026-08-25', 'target_date': '2026-08-27'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)


class WorkoutDaySkipApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw')
        self.other = User.objects.create_user(username='bob', password='pw')
        self.client.force_authenticate(user=self.user)

    def test_crear_marca_la_fecha_como_omitida(self):
        respuesta = self.client.post(
            '/api/v2/salaz/workout-day-skip/', {'date': '2026-08-25'}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertEqual(respuesta.data['date'], '2026-08-25')
        self.assertIn('updated_at', respuesta.data)

    def test_date_es_obligatoria(self):
        respuesta = self.client.post('/api/v2/salaz/workout-day-skip/', {}, format='json')
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_marcar_la_misma_fecha_dos_veces_no_duplica(self):
        self.client.post('/api/v2/salaz/workout-day-skip/', {'date': '2026-08-25'}, format='json')
        self.client.post('/api/v2/salaz/workout-day-skip/', {'date': '2026-08-25'}, format='json')
        self.assertEqual(WorkoutDaySkip.objects.filter(user=self.user, date='2026-08-25').count(), 1)

    def test_quitar_lo_omitido_es_borrar_la_fila(self):
        creado = self.client.post(
            '/api/v2/salaz/workout-day-skip/', {'date': '2026-08-25'}, format='json'
        )
        marca_id = creado.data['id']
        borrado = self.client.delete(f'/api/v2/salaz/workout-day-skip/{marca_id}/')
        self.assertEqual(borrado.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(WorkoutDaySkip.objects.count(), 0)

    def test_la_lista_sale_ordenada_de_mas_reciente_a_mas_antigua(self):
        # filterset_fields=('date',) sigue el mismo patron que WaterLog y
        # WorkoutSessionDraft (ver views.py); su plomeria de django-filter
        # la da la configuracion real de wger, no este arnes de pruebas, asi
        # que aqui solo se comprueba el orden por defecto (Meta.ordering).
        self.client.post('/api/v2/salaz/workout-day-skip/', {'date': '2026-08-25'}, format='json')
        self.client.post('/api/v2/salaz/workout-day-skip/', {'date': '2026-08-26'}, format='json')
        respuesta = self.client.get('/api/v2/salaz/workout-day-skip/')
        fechas = [fila['date'] for fila in respuesta.data['results']]
        self.assertEqual(fechas, ['2026-08-26', '2026-08-25'])

    def test_otro_usuario_no_ve_ni_puede_tocar_lo_omitido_ajeno(self):
        creado = self.client.post(
            '/api/v2/salaz/workout-day-skip/', {'date': '2026-08-25'}, format='json'
        )
        marca_id = creado.data['id']

        self.client.force_authenticate(user=self.other)
        respuesta_lista = self.client.get('/api/v2/salaz/workout-day-skip/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_borrado = self.client.delete(f'/api/v2/salaz/workout-day-skip/{marca_id}/')
        self.assertEqual(respuesta_borrado.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(WorkoutDaySkip.objects.count(), 1)

        # marcar la misma fecha desde otro usuario no choca con la del primero
        respuesta_crear = self.client.post(
            '/api/v2/salaz/workout-day-skip/', {'date': '2026-08-25'}, format='json'
        )
        self.assertEqual(respuesta_crear.status_code, status.HTTP_201_CREATED, respuesta_crear.data)
