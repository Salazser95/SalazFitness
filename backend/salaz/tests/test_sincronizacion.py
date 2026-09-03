"""
Pruebas de los datos que antes vivian solo en el localStorage del navegador:
agua, objetivo de peso, plan semanal, favoritos/recientes de alimentos,
sesion de entreno en curso y las dos preferencias que cruzan dispositivo
(rutina activa, plan de nutricion activo).

Lo que se cubre en cada uno:
  - que el endpoint guarda y devuelve lo que se le manda
  - que un usuario NO puede leer ni modificar los datos de otro
  - que `updated_at` cambia al actualizar (la pieza de "ultima escritura gana")
  - el tope de 30 recientes (solo en RecentIngredientApiTests)
"""

from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status

from salaz.models import (
    DeviceState,
    FavoriteIngredient,
    Household,
    RecentIngredient,
    WaterLog,
    WeeklyPlan,
    WeightGoal,
    WorkoutSessionDraft,
)
from salaz.tests.test_api import SalazApiTestCase, make_ingredient


class WaterLogApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='pw')
        self.other = User.objects.create_user(username='bob', password='pw')
        self.client.force_authenticate(user=self.user)

    def test_crear_guarda_y_devuelve_lo_mandado(self):
        respuesta = self.client.post(
            '/api/v2/salaz/water-log/', {'date': '2026-08-27', 'milliliters': 750}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        self.assertEqual(respuesta.data['milliliters'], 750)
        self.assertEqual(respuesta.data['date'], '2026-08-27')
        self.assertIn('updated_at', respuesta.data)

    def test_escribir_el_mismo_dia_dos_veces_actualiza_no_duplica(self):
        self.client.post('/api/v2/salaz/water-log/', {'date': '2026-08-27', 'milliliters': 250}, format='json')
        self.client.post('/api/v2/salaz/water-log/', {'date': '2026-08-27', 'milliliters': 1000}, format='json')
        self.assertEqual(WaterLog.objects.filter(user=self.user, date='2026-08-27').count(), 1)
        registro = WaterLog.objects.get(user=self.user, date='2026-08-27')
        self.assertEqual(registro.milliliters, 1000)

    def test_updated_at_cambia_al_actualizar(self):
        primero = self.client.post(
            '/api/v2/salaz/water-log/', {'date': '2026-08-27', 'milliliters': 250}, format='json'
        )
        registro_id = primero.data['id']
        marca_inicial = WaterLog.objects.get(pk=registro_id).updated_at

        segundo = self.client.patch(
            f'/api/v2/salaz/water-log/{registro_id}/', {'milliliters': 500}, format='json'
        )
        self.assertEqual(segundo.status_code, status.HTTP_200_OK, segundo.data)
        marca_final = WaterLog.objects.get(pk=registro_id).updated_at
        self.assertGreater(marca_final, marca_inicial)

    def test_otro_usuario_no_ve_ni_puede_tocar_el_agua_ajena(self):
        propio = self.client.post(
            '/api/v2/salaz/water-log/', {'date': '2026-08-27', 'milliliters': 750}, format='json'
        )
        registro_id = propio.data['id']

        self.client.force_authenticate(user=self.other)
        respuesta_lista = self.client.get('/api/v2/salaz/water-log/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_detalle = self.client.get(f'/api/v2/salaz/water-log/{registro_id}/')
        self.assertEqual(respuesta_detalle.status_code, status.HTTP_404_NOT_FOUND)

        respuesta_patch = self.client.patch(
            f'/api/v2/salaz/water-log/{registro_id}/', {'milliliters': 1}, format='json'
        )
        self.assertEqual(respuesta_patch.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(WaterLog.objects.get(pk=registro_id).milliliters, 750)


class WeightGoalApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='carol', password='pw')
        self.other = User.objects.create_user(username='dave', password='pw')
        self.client.force_authenticate(user=self.user)

    def test_crear_guarda_y_devuelve_lo_mandado(self):
        respuesta = self.client.post(
            '/api/v2/salaz/weight-goal/',
            {'goal_type': 'perder_peso', 'target_weight': '78.50', 'target_date': '2026-12-31'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        self.assertEqual(respuesta.data['goal_type'], 'perder_peso')
        self.assertEqual(Decimal(respuesta.data['target_weight']), Decimal('78.50'))
        self.assertEqual(respuesta.data['target_date'], '2026-12-31')

    def test_el_objetivo_es_unico_por_usuario_crear_dos_veces_lo_actualiza(self):
        self.client.post(
            '/api/v2/salaz/weight-goal/',
            {'goal_type': 'perder_peso', 'target_weight': '78.50', 'target_date': '2026-12-31'},
            format='json',
        )
        self.client.post(
            '/api/v2/salaz/weight-goal/',
            {'goal_type': 'ganar_peso', 'target_weight': '90.00', 'target_date': '2027-01-01'},
            format='json',
        )
        self.assertEqual(WeightGoal.objects.filter(user=self.user).count(), 1)
        objetivo = WeightGoal.objects.get(user=self.user)
        self.assertEqual(objetivo.goal_type, 'ganar_peso')

    def test_updated_at_cambia_al_actualizar(self):
        primero = self.client.post(
            '/api/v2/salaz/weight-goal/', {'goal_type': 'perder_peso', 'target_weight': '80'}, format='json'
        )
        marca_inicial = WeightGoal.objects.get(user=self.user).updated_at

        segundo = self.client.patch(
            f'/api/v2/salaz/weight-goal/{primero.data["id"]}/', {'target_weight': '75'}, format='json'
        )
        self.assertEqual(segundo.status_code, status.HTTP_200_OK, segundo.data)
        marca_final = WeightGoal.objects.get(user=self.user).updated_at
        self.assertGreater(marca_final, marca_inicial)

    def test_otro_usuario_no_ve_ni_puede_tocar_el_objetivo_ajeno(self):
        propio = self.client.post(
            '/api/v2/salaz/weight-goal/', {'goal_type': 'perder_peso', 'target_weight': '80'}, format='json'
        )
        objetivo_id = propio.data['id']

        self.client.force_authenticate(user=self.other)
        respuesta_lista = self.client.get('/api/v2/salaz/weight-goal/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_detalle = self.client.get(f'/api/v2/salaz/weight-goal/{objetivo_id}/')
        self.assertEqual(respuesta_detalle.status_code, status.HTTP_404_NOT_FOUND)

        # Un segundo usuario que llama a crear no toca el objetivo del primero:
        # get_or_create esta filtrado por request.user, asi que abre el suyo.
        self.client.post(
            '/api/v2/salaz/weight-goal/', {'goal_type': 'ganar_peso', 'target_weight': '95'}, format='json'
        )
        self.assertEqual(WeightGoal.objects.get(pk=objetivo_id).goal_type, 'perder_peso')


class WeeklyPlanApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='erin', password='pw')
        self.household = Household.objects.create(owner=self.user, name='Casa Erin')
        self.other = User.objects.create_user(username='frank', password='pw')
        self.other_household = Household.objects.create(owner=self.other, name='Casa Frank')
        self.client.force_authenticate(user=self.user)

    def _payload(self, **extra):
        base = {
            'household': self.household.id,
            'start_date': '2026-08-24',
            'end_date': '2026-09-06',
            'selection': [{'recipeId': 1, 'recipeName': 'Arroz', 'tandas': 2}],
            'by_day': [{'fecha': '2026-08-24', 'recipeId': 1, 'recipeName': 'Arroz'}],
            'ingredient_origins': {'5': ['Arroz']},
        }
        base.update(extra)
        return base

    def test_crear_guarda_y_devuelve_lo_mandado(self):
        respuesta = self.client.post('/api/v2/salaz/weekly-plan/', self._payload(), format='json')
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        self.assertEqual(respuesta.data['start_date'], '2026-08-24')
        self.assertEqual(respuesta.data['selection'], [{'recipeId': 1, 'recipeName': 'Arroz', 'tandas': 2}])
        self.assertEqual(respuesta.data['ingredient_origins'], {'5': ['Arroz']})

    def test_crear_dos_veces_para_el_mismo_hogar_actualiza_no_duplica(self):
        self.client.post('/api/v2/salaz/weekly-plan/', self._payload(), format='json')
        self.client.post(
            '/api/v2/salaz/weekly-plan/',
            self._payload(selection=[{'recipeId': 2, 'recipeName': 'Pasta', 'tandas': 1}]),
            format='json',
        )
        self.assertEqual(WeeklyPlan.objects.filter(household=self.household).count(), 1)
        plan = WeeklyPlan.objects.get(household=self.household)
        self.assertEqual(plan.selection, [{'recipeId': 2, 'recipeName': 'Pasta', 'tandas': 1}])

    def test_updated_at_cambia_al_actualizar(self):
        primero = self.client.post('/api/v2/salaz/weekly-plan/', self._payload(), format='json')
        marca_inicial = WeeklyPlan.objects.get(household=self.household).updated_at

        segundo = self.client.patch(
            f'/api/v2/salaz/weekly-plan/{primero.data["id"]}/', {'by_day': []}, format='json'
        )
        self.assertEqual(segundo.status_code, status.HTTP_200_OK, segundo.data)
        marca_final = WeeklyPlan.objects.get(household=self.household).updated_at
        self.assertGreater(marca_final, marca_inicial)

    def test_no_se_puede_crear_un_plan_para_el_hogar_de_otro(self):
        respuesta = self.client.post(
            '/api/v2/salaz/weekly-plan/', self._payload(household=self.other_household.id), format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)

    def test_otro_usuario_no_ve_ni_puede_tocar_el_plan_ajeno(self):
        propio = self.client.post('/api/v2/salaz/weekly-plan/', self._payload(), format='json')
        plan_id = propio.data['id']

        self.client.force_authenticate(user=self.other)
        respuesta_lista = self.client.get('/api/v2/salaz/weekly-plan/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_detalle = self.client.get(f'/api/v2/salaz/weekly-plan/{plan_id}/')
        self.assertEqual(respuesta_detalle.status_code, status.HTTP_404_NOT_FOUND)

        respuesta_patch = self.client.patch(
            f'/api/v2/salaz/weekly-plan/{plan_id}/', {'by_day': []}, format='json'
        )
        self.assertEqual(respuesta_patch.status_code, status.HTTP_404_NOT_FOUND)


class FavoriteIngredientApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='grace', password='pw')
        self.other = User.objects.create_user(username='henry', password='pw')
        self.ingredient = make_ingredient(name='Manzana')
        self.client.force_authenticate(user=self.user)

    def test_crear_guarda_y_devuelve_lo_mandado(self):
        respuesta = self.client.post(
            '/api/v2/salaz/favorite-ingredient/', {'ingredient': self.ingredient.id}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertEqual(respuesta.data['ingredient'], self.ingredient.id)
        self.assertTrue(FavoriteIngredient.objects.filter(user=self.user, ingredient=self.ingredient).exists())

    def test_marcar_dos_veces_no_duplica(self):
        self.client.post('/api/v2/salaz/favorite-ingredient/', {'ingredient': self.ingredient.id}, format='json')
        self.client.post('/api/v2/salaz/favorite-ingredient/', {'ingredient': self.ingredient.id}, format='json')
        self.assertEqual(
            FavoriteIngredient.objects.filter(user=self.user, ingredient=self.ingredient).count(), 1
        )

    def test_se_puede_quitar_de_favoritos(self):
        respuesta = self.client.post(
            '/api/v2/salaz/favorite-ingredient/', {'ingredient': self.ingredient.id}, format='json'
        )
        borrado = self.client.delete(f'/api/v2/salaz/favorite-ingredient/{respuesta.data["id"]}/')
        self.assertEqual(borrado.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(FavoriteIngredient.objects.filter(user=self.user).exists())

    def test_otro_usuario_no_ve_ni_puede_tocar_el_favorito_ajeno(self):
        propio = self.client.post(
            '/api/v2/salaz/favorite-ingredient/', {'ingredient': self.ingredient.id}, format='json'
        )
        favorito_id = propio.data['id']

        self.client.force_authenticate(user=self.other)
        respuesta_lista = self.client.get('/api/v2/salaz/favorite-ingredient/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_detalle = self.client.get(f'/api/v2/salaz/favorite-ingredient/{favorito_id}/')
        self.assertEqual(respuesta_detalle.status_code, status.HTTP_404_NOT_FOUND)

        respuesta_borrado = self.client.delete(f'/api/v2/salaz/favorite-ingredient/{favorito_id}/')
        self.assertEqual(respuesta_borrado.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(FavoriteIngredient.objects.filter(pk=favorito_id).exists())


class RecentIngredientApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='iris', password='pw')
        self.other = User.objects.create_user(username='jack', password='pw')
        self.client.force_authenticate(user=self.user)

    def test_crear_guarda_y_devuelve_lo_mandado(self):
        ingrediente = make_ingredient(name='Yogur')
        respuesta = self.client.post(
            '/api/v2/salaz/recent-ingredient/', {'ingredient': ingrediente.id}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertEqual(respuesta.data['ingredient'], ingrediente.id)

    def test_registrar_el_mismo_alimento_no_duplica_y_actualiza_updated_at(self):
        ingrediente = make_ingredient(name='Pollo')
        primero = self.client.post(
            '/api/v2/salaz/recent-ingredient/', {'ingredient': ingrediente.id}, format='json'
        )
        marca_inicial = RecentIngredient.objects.get(pk=primero.data['id']).updated_at

        segundo = self.client.post(
            '/api/v2/salaz/recent-ingredient/', {'ingredient': ingrediente.id}, format='json'
        )
        self.assertEqual(RecentIngredient.objects.filter(user=self.user).count(), 1)
        marca_final = RecentIngredient.objects.get(pk=segundo.data['id']).updated_at
        self.assertGreaterEqual(marca_final, marca_inicial)

    def test_el_tope_de_30_se_respeta(self):
        for i in range(31):
            ingrediente = make_ingredient(name=f'Alimento {i}')
            respuesta = self.client.post(
                '/api/v2/salaz/recent-ingredient/', {'ingredient': ingrediente.id}, format='json'
            )
            self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)

        self.assertEqual(RecentIngredient.objects.filter(user=self.user).count(), 30)
        # El primero (Alimento 0) es el mas viejo y tiene que haberse recortado.
        self.assertFalse(
            RecentIngredient.objects.filter(user=self.user, ingredient__name='Alimento 0').exists()
        )
        self.assertTrue(
            RecentIngredient.objects.filter(user=self.user, ingredient__name='Alimento 30').exists()
        )

    def test_otro_usuario_no_ve_ni_puede_tocar_lo_reciente_ajeno(self):
        ingrediente = make_ingredient(name='Arroz')
        propio = self.client.post(
            '/api/v2/salaz/recent-ingredient/', {'ingredient': ingrediente.id}, format='json'
        )
        reciente_id = propio.data['id']

        self.client.force_authenticate(user=self.other)
        respuesta_lista = self.client.get('/api/v2/salaz/recent-ingredient/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_detalle = self.client.get(f'/api/v2/salaz/recent-ingredient/{reciente_id}/')
        self.assertEqual(respuesta_detalle.status_code, status.HTTP_404_NOT_FOUND)


class WorkoutSessionDraftApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='kelly', password='pw')
        self.other = User.objects.create_user(username='leo', password='pw')
        self.client.force_authenticate(user=self.user)

    def _contenido(self):
        return {
            'routineId': 1,
            'dayId': 2,
            'fecha': '2026-08-27',
            'ejercicioActual': 0,
            'ejercicios': [{'exercise': 73, 'series': []}],
            'sesionId': None,
        }

    def test_crear_guarda_y_devuelve_lo_mandado(self):
        respuesta = self.client.post(
            '/api/v2/salaz/workout-session-draft/',
            {'date': '2026-08-27', 'content': self._contenido()},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        self.assertEqual(respuesta.data['content']['routineId'], 1)
        self.assertEqual(respuesta.data['date'], '2026-08-27')

    def test_guardar_el_mismo_dia_dos_veces_actualiza_no_duplica(self):
        self.client.post(
            '/api/v2/salaz/workout-session-draft/',
            {'date': '2026-08-27', 'content': self._contenido()},
            format='json',
        )
        contenido2 = self._contenido()
        contenido2['ejercicioActual'] = 1
        self.client.post(
            '/api/v2/salaz/workout-session-draft/',
            {'date': '2026-08-27', 'content': contenido2},
            format='json',
        )
        self.assertEqual(WorkoutSessionDraft.objects.filter(user=self.user, date='2026-08-27').count(), 1)
        borrador = WorkoutSessionDraft.objects.get(user=self.user, date='2026-08-27')
        self.assertEqual(borrador.content['ejercicioActual'], 1)

    def test_updated_at_cambia_al_actualizar(self):
        primero = self.client.post(
            '/api/v2/salaz/workout-session-draft/',
            {'date': '2026-08-27', 'content': self._contenido()},
            format='json',
        )
        marca_inicial = WorkoutSessionDraft.objects.get(pk=primero.data['id']).updated_at

        segundo = self.client.patch(
            f'/api/v2/salaz/workout-session-draft/{primero.data["id"]}/',
            {'content': {**self._contenido(), 'ejercicioActual': 1}},
            format='json',
        )
        self.assertEqual(segundo.status_code, status.HTTP_200_OK, segundo.data)
        marca_final = WorkoutSessionDraft.objects.get(pk=primero.data['id']).updated_at
        self.assertGreater(marca_final, marca_inicial)

    def test_otro_usuario_no_ve_ni_puede_tocar_la_sesion_ajena(self):
        propio = self.client.post(
            '/api/v2/salaz/workout-session-draft/',
            {'date': '2026-08-27', 'content': self._contenido()},
            format='json',
        )
        borrador_id = propio.data['id']

        self.client.force_authenticate(user=self.other)
        respuesta_lista = self.client.get('/api/v2/salaz/workout-session-draft/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_detalle = self.client.get(f'/api/v2/salaz/workout-session-draft/{borrador_id}/')
        self.assertEqual(respuesta_detalle.status_code, status.HTTP_404_NOT_FOUND)


class DeviceStateApiTests(SalazApiTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='maya', password='pw')
        self.other = User.objects.create_user(username='noah', password='pw')
        self.client.force_authenticate(user=self.user)

    def test_crear_guarda_y_devuelve_lo_mandado(self):
        respuesta = self.client.post(
            '/api/v2/salaz/device-state/', {'key': 'rutina_activa', 'value': '42'}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        self.assertEqual(respuesta.data['key'], 'rutina_activa')
        self.assertEqual(respuesta.data['value'], '42')

    def test_rechaza_una_clave_que_no_es_rutina_ni_plan(self):
        respuesta = self.client.post(
            '/api/v2/salaz/device-state/', {'key': 'lo_que_sea', 'value': 'x'}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cambiar_la_rutina_activa_en_otro_dispositivo_pisa_la_anterior(self):
        # Esto es justo lo que pidio el dueno: cambiar en el iPhone y luego en
        # el PC deja la del PC. Aqui se simula con dos POST seguidos del mismo
        # usuario (cada uno "es" un dispositivo distinto).
        self.client.post('/api/v2/salaz/device-state/', {'key': 'rutina_activa', 'value': '1'}, format='json')
        self.client.post('/api/v2/salaz/device-state/', {'key': 'rutina_activa', 'value': '2'}, format='json')
        self.assertEqual(DeviceState.objects.filter(user=self.user, key='rutina_activa').count(), 1)
        self.assertEqual(DeviceState.objects.get(user=self.user, key='rutina_activa').value, '2')

    def test_rutina_activa_y_plan_activo_son_claves_independientes(self):
        self.client.post('/api/v2/salaz/device-state/', {'key': 'rutina_activa', 'value': '1'}, format='json')
        self.client.post('/api/v2/salaz/device-state/', {'key': 'plan_activo', 'value': 'uuid-del-plan'}, format='json')
        self.assertEqual(DeviceState.objects.filter(user=self.user).count(), 2)

    def test_updated_at_cambia_al_actualizar(self):
        primero = self.client.post(
            '/api/v2/salaz/device-state/', {'key': 'rutina_activa', 'value': '1'}, format='json'
        )
        marca_inicial = DeviceState.objects.get(pk=primero.data['id']).updated_at

        segundo = self.client.patch(
            f'/api/v2/salaz/device-state/{primero.data["id"]}/', {'value': '2'}, format='json'
        )
        self.assertEqual(segundo.status_code, status.HTTP_200_OK, segundo.data)
        marca_final = DeviceState.objects.get(pk=primero.data['id']).updated_at
        self.assertGreater(marca_final, marca_inicial)

    def test_otro_usuario_no_ve_ni_puede_tocar_la_preferencia_ajena(self):
        propio = self.client.post(
            '/api/v2/salaz/device-state/', {'key': 'rutina_activa', 'value': '1'}, format='json'
        )
        estado_id = propio.data['id']

        self.client.force_authenticate(user=self.other)
        respuesta_lista = self.client.get('/api/v2/salaz/device-state/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_detalle = self.client.get(f'/api/v2/salaz/device-state/{estado_id}/')
        self.assertEqual(respuesta_detalle.status_code, status.HTTP_404_NOT_FOUND)

        # Y crear su propia "rutina_activa" no toca la del primer usuario.
        self.client.post('/api/v2/salaz/device-state/', {'key': 'rutina_activa', 'value': '99'}, format='json')
        self.assertEqual(DeviceState.objects.get(pk=estado_id).value, '1')
