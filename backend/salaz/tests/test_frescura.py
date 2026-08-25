"""
Pruebas del reparto de la compra en tandas.

Usan `unittest.TestCase` a proposito, no `django.test.TestCase`: `frescura` no
importa nada de Django ni toca la base de datos, asi que estas pruebas se
pueden ejecutar sin levantar wger, con `python -m unittest`. El corredor de
Django las recoge igual.
"""

import unittest

from salaz import frescura


class TestPerfilPara(unittest.TestCase):
    def test_moras_son_fruta_delicada_de_tres_dias(self):
        perfil = frescura.perfil_para('Moras')
        self.assertEqual(perfil.categoria, frescura.FRUTA_DELICADA)
        self.assertEqual(perfil.dias, 3)
        self.assertTrue(perfil.compra_pequena)

    def test_el_plural_y_las_tildes_dan_igual(self):
        self.assertEqual(frescura.perfil_para('mora'), frescura.perfil_para('MORAS'))
        self.assertEqual(frescura.perfil_para('Platano'), frescura.perfil_para('plátanos'))

    def test_no_casa_por_subcadena(self):
        # 'espinacas' contiene 'pina' como texto. Si se emparejara por
        # subcadena, las espinacas saldrian clasificadas como pina y con el
        # doble de vida util de la que tienen.
        self.assertEqual(frescura.perfil_para('Espinacas frescas').categoria, frescura.VERDURA)
        self.assertEqual(frescura.perfil_para('Espinacas frescas').dias, 5)
        # Y 'panceta' no es pan.
        self.assertEqual(frescura.perfil_para('Panceta').categoria, frescura.DESPENSA)

    def test_lo_especifico_gana_a_lo_generico(self):
        self.assertEqual(frescura.perfil_para('Pan de molde integral').dias, 10)
        self.assertEqual(frescura.perfil_para('Barra de pan').dias, 2)
        self.assertEqual(frescura.perfil_para('Leche entera UHT').dias, 120)
        self.assertEqual(frescura.perfil_para('Leche fresca del dia').dias, 5)

    def test_lo_desconocido_es_despensa(self):
        # El supuesto seguro: manda comprar de mas una vez, nunca tirar comida.
        perfil = frescura.perfil_para('Ganache de wasabi')
        self.assertEqual(perfil, frescura.PERFIL_POR_DEFECTO)
        self.assertEqual(frescura.perfil_para(''), frescura.PERFIL_POR_DEFECTO)

    def test_secuencia_de_palabras_con_plural(self):
        self.assertEqual(frescura.perfil_para('Judias verdes').categoria, frescura.VERDURA)


class TestRepartirEnTandas(unittest.TestCase):
    def test_la_despensa_se_compra_una_sola_vez(self):
        tandas = frescura.repartir_en_tandas(12, frescura.perfil_para('Arroz'))
        self.assertEqual(len(tandas), 1)
        self.assertEqual(tandas[0].dias_cubiertos, 12)
        self.assertEqual(tandas[0].fraccion, 1.0)

    def test_las_moras_se_reparten_en_cuatro_compras(self):
        tandas = frescura.repartir_en_tandas(12, frescura.perfil_para('Moras'))
        self.assertEqual([t.dia_offset for t in tandas], [0, 3, 6, 9])
        self.assertEqual([t.dias_cubiertos for t in tandas], [3, 3, 3, 3])

    def test_las_tandas_cubren_el_periodo_entero_sin_solaparse(self):
        for producto in ('Moras', 'Brocoli', 'Salmon', 'Arroz', 'Yogur'):
            for dias in (1, 7, 12, 14, 30):
                tandas = frescura.repartir_en_tandas(dias, frescura.perfil_para(producto))
                self.assertEqual(sum(t.dias_cubiertos for t in tandas), dias, producto)
                self.assertAlmostEqual(sum(t.fraccion for t in tandas), 1.0, places=6)
                esperado = 0
                for tanda in tandas:
                    self.assertEqual(tanda.dia_offset, esperado, producto)
                    esperado += tanda.dias_cubiertos

    def test_congelar_alarga_la_vida_util(self):
        moras = frescura.perfil_para('Moras')
        self.assertEqual(len(frescura.repartir_en_tandas(12, moras, congelar=True)), 1)


class TestPlanificarCompra(unittest.TestCase):
    def test_el_pescado_fresco_se_congela_en_vez_de_seis_viajes(self):
        plan = frescura.planificar_compra(12, frescura.perfil_para('Salmon'))
        self.assertTrue(plan.congelar)
        self.assertEqual(len(plan.tandas), 1)
        self.assertIn('congela', plan.motivo)

    def test_las_moras_siguen_siendo_compra_fresca_pequena(self):
        plan = frescura.planificar_compra(12, frescura.perfil_para('Moras'))
        self.assertFalse(plan.congelar)
        self.assertEqual(len(plan.tandas), 4)

    def test_se_puede_forzar_la_decision(self):
        moras = frescura.perfil_para('Moras')
        self.assertTrue(frescura.planificar_compra(12, moras, congelar=True).congelar)
        forzado_fresco = frescura.planificar_compra(30, moras, congelar=False)
        self.assertFalse(forzado_fresco.congelar)
        self.assertEqual(len(forzado_fresco.tandas), 10)


class TestCesta(unittest.TestCase):
    def test_lleva_fruta_y_verdura(self):
        nombres = {p.nombre for p in frescura.cesta_fruta_verdura()}
        self.assertIn('Brocoli', nombres)
        self.assertIn('Manzana', nombres)

    def test_la_fruta_roja_es_opcional(self):
        sin_roja = {p.nombre for p in frescura.cesta_fruta_verdura(fruta_roja=False)}
        self.assertNotIn('Moras', sin_roja)
        self.assertNotIn('Fresas', sin_roja)
        self.assertIn('Manzana', sin_roja)

    def test_la_fruta_roja_va_en_dosis_pequena(self):
        # Se estropea en 2-3 dias: comprar 150 g/dia de moras es tirar dinero.
        por_nombre = {p.nombre: p for p in frescura.cesta_fruta_verdura()}
        self.assertLessEqual(por_nombre['Moras'].gramos_dia, 50)
        self.assertLessEqual(por_nombre['Fresas'].gramos_dia, 80)

    def test_la_cesta_no_lleva_nada_que_el_usuario_no_coma(self):
        # Sin cerdo y sin espinacas, que es lo que tiene apuntado en su perfil.
        nombres = ' '.join(p.nombre.lower() for p in frescura.cesta_fruta_verdura())
        for prohibido in ('cerdo', 'espinaca', 'panceta', 'chorizo', 'bacon'):
            self.assertNotIn(prohibido, nombres)


if __name__ == '__main__':
    unittest.main()
