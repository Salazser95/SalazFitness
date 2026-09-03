"""
Hogar multiusuario: un HouseholdMember con la cuenta vinculada (`user`) ve y
puede escribir los datos compartidos del hogar (recetas, compras...) del
mismo modo que el dueno, pero solo el dueno gestiona el hogar en si y su
lista de miembros (anadir, renombrar, vincular, desvincular, quitar).

Ver la nota completa en salaz/api/views.py: _acceso_hogar, _accesible_o_404,
_resolver_vinculo.
"""

from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import status

from salaz.models import Household, HouseholdMember, Purchase, Recipe
from salaz.tests.test_api import SalazApiTestCase


class AccesoDatosCompartidosTests(SalazApiTestCase):
    """Un miembro vinculado lee y escribe los datos del hogar, igual que el dueno."""

    def setUp(self):
        self.dueno = User.objects.create_user(username='ana', password='pw')
        self.miembro = User.objects.create_user(username='bruno', password='pw')
        self.desconocido = User.objects.create_user(username='caro', password='pw')
        self.household = Household.objects.create(owner=self.dueno, name='Casa Ana y Bruno')
        HouseholdMember.objects.create(household=self.household, name='Bruno', user=self.miembro)
        self.recipe = Recipe.objects.create(household=self.household, name='Lentejas', servings=4)

    def test_el_miembro_ve_las_recetas_del_hogar(self):
        self.client.force_authenticate(user=self.miembro)
        respuesta = self.client.get('/api/v2/salaz/recipe/')
        nombres = [r['name'] for r in respuesta.data['results']]
        self.assertIn('Lentejas', nombres)

    def test_el_miembro_puede_crear_una_receta_en_el_hogar(self):
        self.client.force_authenticate(user=self.miembro)
        respuesta = self.client.post(
            '/api/v2/salaz/recipe/',
            {'household': self.household.id, 'name': 'Tortilla', 'servings': 2},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)

    def test_el_miembro_ve_y_crea_compras_del_hogar(self):
        Purchase.objects.create(
            household=self.household, date='2026-01-01', description='Compra semanal', covers_days=7,
        )
        self.client.force_authenticate(user=self.miembro)
        respuesta_lista = self.client.get('/api/v2/salaz/purchase/')
        self.assertEqual(len(respuesta_lista.data['results']), 1)

        respuesta_crear = self.client.post(
            '/api/v2/salaz/purchase/',
            {'household': self.household.id, 'date': '2026-01-08', 'description': 'Otra', 'covers_days': 7},
            format='json',
        )
        self.assertEqual(respuesta_crear.status_code, status.HTTP_201_CREATED, respuesta_crear.data)

    def test_un_desconocido_no_ve_ni_puede_crear_nada_del_hogar(self):
        self.client.force_authenticate(user=self.desconocido)
        respuesta_lista = self.client.get('/api/v2/salaz/recipe/')
        self.assertEqual(respuesta_lista.data['results'], [])

        respuesta_detalle = self.client.get(f'/api/v2/salaz/recipe/{self.recipe.id}/')
        self.assertEqual(respuesta_detalle.status_code, status.HTTP_404_NOT_FOUND)

        respuesta_crear = self.client.post(
            '/api/v2/salaz/recipe/',
            {'household': self.household.id, 'name': 'Intrusa', 'servings': 1},
            format='json',
        )
        self.assertEqual(respuesta_crear.status_code, status.HTTP_404_NOT_FOUND)


class GobiernoDelHogarTests(SalazApiTestCase):
    """Renombrar/borrar el hogar y gestionar sus miembros es solo del dueno."""

    def setUp(self):
        self.dueno = User.objects.create_user(username='dana', password='pw')
        self.miembro = User.objects.create_user(username='edu', password='pw')
        self.household = Household.objects.create(owner=self.dueno, name='Casa Dana')
        self.fila_miembro = HouseholdMember.objects.create(
            household=self.household, name='Edu', user=self.miembro
        )

    def test_el_miembro_ve_el_hogar_y_su_lista_de_miembros(self):
        self.client.force_authenticate(user=self.miembro)
        respuesta = self.client.get(f'/api/v2/salaz/household/{self.household.id}/')
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)

        respuesta_miembros = self.client.get('/api/v2/salaz/household-member/')
        nombres = [m['name'] for m in respuesta_miembros.data['results']]
        self.assertIn('Edu', nombres)

    def test_el_miembro_no_puede_renombrar_el_hogar(self):
        self.client.force_authenticate(user=self.miembro)
        respuesta = self.client.patch(
            f'/api/v2/salaz/household/{self.household.id}/', {'name': 'Casa Robada'}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_403_FORBIDDEN)
        self.household.refresh_from_db()
        self.assertEqual(self.household.name, 'Casa Dana')

    def test_el_miembro_no_puede_borrar_el_hogar(self):
        self.client.force_authenticate(user=self.miembro)
        respuesta = self.client.delete(f'/api/v2/salaz/household/{self.household.id}/')
        self.assertEqual(respuesta.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Household.objects.filter(pk=self.household.id).exists())

    def test_el_miembro_no_puede_anadir_otro_miembro(self):
        self.client.force_authenticate(user=self.miembro)
        respuesta = self.client.post(
            '/api/v2/salaz/household-member/',
            {'household': self.household.id, 'name': 'Intruso'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)

    def test_el_miembro_no_puede_editar_ni_borrar_su_propia_fila(self):
        self.client.force_authenticate(user=self.miembro)
        respuesta_editar = self.client.patch(
            f'/api/v2/salaz/household-member/{self.fila_miembro.id}/',
            {'name': 'Edu (cambiado)'},
            format='json',
        )
        self.assertEqual(respuesta_editar.status_code, status.HTTP_403_FORBIDDEN)

        respuesta_borrar = self.client.delete(f'/api/v2/salaz/household-member/{self.fila_miembro.id}/')
        self.assertEqual(respuesta_borrar.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(HouseholdMember.objects.filter(pk=self.fila_miembro.id).exists())

    def test_el_dueno_si_puede_renombrar_y_borrar(self):
        self.client.force_authenticate(user=self.dueno)
        respuesta = self.client.patch(
            f'/api/v2/salaz/household/{self.household.id}/', {'name': 'Casa Renombrada'}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)


class VincularCuentaTests(SalazApiTestCase):
    """Vincular/desvincular la cuenta de un miembro, por username exacto."""

    def setUp(self):
        self.dueno = User.objects.create_user(username='fina', password='pw')
        self.otra_cuenta = User.objects.create_user(username='gus', password='pw')
        self.household = Household.objects.create(owner=self.dueno, name='Casa Fina')
        self.client.force_authenticate(user=self.dueno)

    def test_crear_miembro_vinculado_a_una_cuenta_existente(self):
        respuesta = self.client.post(
            '/api/v2/salaz/household-member/',
            {'household': self.household.id, 'name': 'Gus', 'link_username': 'gus'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED, respuesta.data)
        self.assertEqual(respuesta.data['username'], 'gus')
        miembro = HouseholdMember.objects.get(pk=respuesta.data['id'])
        self.assertEqual(miembro.user_id, self.otra_cuenta.id)

    def test_vincular_un_username_que_no_existe_da_error_claro(self):
        respuesta = self.client.post(
            '/api/v2/salaz/household-member/',
            {'household': self.household.id, 'name': 'Fantasma', 'link_username': 'no-existe'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(HouseholdMember.objects.filter(name='Fantasma').exists())

    def test_no_se_puede_vincular_la_misma_cuenta_dos_veces(self):
        HouseholdMember.objects.create(household=self.household, name='Gus', user=self.otra_cuenta)
        otro_hogar = Household.objects.create(owner=self.dueno, name='Segunda casa')
        respuesta = self.client.post(
            '/api/v2/salaz/household-member/',
            {'household': otro_hogar.id, 'name': 'Gus otra vez', 'link_username': 'gus'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_desvincular_con_link_username_vacio(self):
        miembro = HouseholdMember.objects.create(household=self.household, name='Gus', user=self.otra_cuenta)
        respuesta = self.client.patch(
            f'/api/v2/salaz/household-member/{miembro.id}/', {'link_username': ''}, format='json'
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        miembro.refresh_from_db()
        self.assertIsNone(miembro.user)

    def test_editar_sin_mandar_link_username_no_toca_el_vinculo(self):
        miembro = HouseholdMember.objects.create(household=self.household, name='Gus', user=self.otra_cuenta)
        respuesta = self.client.patch(
            f'/api/v2/salaz/household-member/{miembro.id}/',
            {'consumption_share': '50'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK, respuesta.data)
        miembro.refresh_from_db()
        self.assertEqual(miembro.user_id, self.otra_cuenta.id)
        self.assertEqual(miembro.consumption_share, Decimal('50.00'))

    def test_no_se_puede_vincular_una_cuenta_inactiva(self):
        User.objects.create_user(username='inactivo', password='pw', is_active=False)
        respuesta = self.client.post(
            '/api/v2/salaz/household-member/',
            {'household': self.household.id, 'name': 'X', 'link_username': 'inactivo'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
