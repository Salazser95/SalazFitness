"""
Actualiza el perfil salaz1 con los datos y preferencias reales del usuario.

Cambios respecto a crear_perfil_salaz1.py:
  - Altura corregida a 167 cm (antes 175 de referencia) -> recalcula todo.
  - Rutina de 6 dias con MAXIMO 5 ejercicios por dia (antes 6).
  - Alternancia SEMANAL (semana si / semana no) entre bloque de Fuerza
    (peso alto) y bloque de Marcado, en vez de bloques de 2 semanas.
  - Dieta de batch cooking: comida y cena son LA MISMA receta, cada tanda
    da 4 raciones (2 comidas + 2 cenas). Desayuno variado, sin tupper.
  - Sin cerdo y sin espinacas.
  - Pechuga de pollo de bandeja familiar y carne picada de vacuno, para
    cortar y formar en casa.

PRECIOS REALES: leidos de la API publica de tienda.mercadona.es el
2026-08-23 con el codigo postal 08784 (Piera). Estan fijados en el
diccionario PRECIOS de abajo. Si Mercadona los cambia, hay que
reejecutar la extraccion.

Ejecutar con:
  cd C:\\Proyectos\\wger
  $env:PYTHONPATH = "C:\\Proyectos\\SalazFitness\\backend"
  $env:DJANGO_SETTINGS_MODULE = "salaz_settings"
  .\\.venv\\Scripts\\python.exe C:\\Proyectos\\SalazFitness\\scripts\\actualizar_salaz1.py
"""

import datetime
import decimal
import os
import sys

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'salaz_settings')
django.setup()

from django.contrib.auth.models import User  # noqa: E402

from wger.core.models import Language, UserProfile  # noqa: E402
from wger.manager.models import (  # noqa: E402
    Day,
    RepetitionsConfig,
    RestConfig,
    RiRConfig,
    Routine,
    SetsConfig,
    Slot,
    SlotEntry,
    WeightConfig,
)
from wger.nutrition.models import Ingredient, NutritionPlan  # noqa: E402

sys.path.insert(0, r'C:\Proyectos\SalazFitness\backend')
from salaz.models import (  # noqa: E402
    Household,
    IngredientPrice,
    Purchase,
    PurchaseItem,
    Recipe,
    RecipeIngredient,
)

D = decimal.Decimal
HOY = datetime.date.today()
REP_UNIT_ID = 1
WEIGHT_UNIT_ID = 1
LANG_ES = 4
DIAS_COMPRA = 12


# ==================================================== 1. PERFIL CORREGIDO

def actualizar_perfil():
    user = User.objects.get(username='salaz1')
    p = user.userprofile
    p.height = 167
    # 6 dias de entrenamiento a ~1 h. Con 5 h y tiempo libre en intensidad
    # baja el factor de actividad salia 1.61, que infravalora el gasto de
    # alguien que entrena 6 dias por semana.
    p.sport_hours = 6
    p.sport_intensity = UserProfile.INTENSITY_HIGH
    p.freetime_intensity = UserProfile.INTENSITY_MEDIUM
    p.save()

    bmr = p.calculate_basal_metabolic_rate()
    factor = p.calculate_activities()
    mantenimiento = int(bmr * factor)
    p.calories = mantenimiento
    p.save()

    print('1. PERFIL')
    print('   Altura corregida a 167 cm (antes 175 de referencia)')
    print(f'   Peso {p.weight} kg -> objetivo 60 kg  (+7 kg)')
    print(f'   BMR (Mifflin-St Jeor) = {bmr} kcal')
    print(f'   Factor de actividad   = {factor}')
    print(f'   Mantenimiento         = {mantenimiento} kcal/dia')
    return user, mantenimiento


# ========================================== 2. INGREDIENTES QUE FALTABAN

# Valores por 100 g de tabla de composicion de alimentos (BEDCA/USDA):
# datos nutricionales genericos, no contenido protegido.
INGREDIENTES_NUEVOS = [
    ('ternera_picada', 'Carne picada de vacuno', 158, D('21.0'), D('0.0'), D('8.0'), D('0.0')),
    ('huevo', 'Huevo fresco entero', 143, D('12.6'), D('0.7'), D('9.5'), D('0.0')),
    ('patata', 'Patata cruda', 77, D('2.0'), D('17.0'), D('0.1'), D('2.2')),
    ('calabacin', 'Calabacin fresco', 17, D('1.2'), D('3.1'), D('0.3'), D('1.0')),
    ('judia_verde', 'Judia verde plana', 31, D('1.8'), D('7.0'), D('0.1'), D('3.4')),
    ('cebolla', 'Cebolla fresca', 40, D('1.1'), D('9.3'), D('0.1'), D('1.7')),
    ('pimiento', 'Pimiento rojo fresco', 31, D('1.0'), D('6.0'), D('0.3'), D('2.1')),
    ('tomate_nat', 'Tomate natural fresco', 18, D('0.9'), D('3.9'), D('0.2'), D('1.2')),
    ('platano', 'Platano de Canarias', 89, D('1.1'), D('22.8'), D('0.3'), D('2.6')),
    # Gama "+Proteinas" de Hacendado. Valores de la etiqueta nutricional.
    ('postre_prot_nat', 'Postre lacteo proteico natural 0% MG', 59, D('10.0'), D('4.5'), D('0.1'), D('0.0')),
    ('postre_prot_fresa', 'Postre lacteo proteico fresa 0% MG', 68, D('8.3'), D('8.5'), D('0.1'), D('0.0')),
    ('postre_prot_coco', 'Postre lacteo proteico coco 0% MG', 68, D('8.3'), D('8.5'), D('0.1'), D('0.0')),
    ('natillas_prot', 'Natillas proteicas vainilla', 85, D('10.0'), D('10.0'), D('1.3'), D('0.0')),
    # Whey concentrada tipica. OJO: Mercadona NO vende proteina en polvo.
    ('proteina_polvo', 'Proteina de suero en polvo (whey)', 380, D('80.0'), D('6.0'), D('5.0'), D('0.0')),
    ('miel', 'Miel de flores', 320, D('0.3'), D('80.0'), D('0.0'), D('0.0')),
    ('energetica', 'Bebida energetica zero (preentreno)', 3, D('0.0'), D('0.0'), D('0.0'), D('0.0')),
]


def crear_ingredientes():
    lang = Language.objects.get(pk=LANG_ES)
    ids = {}
    creados = 0
    for clave, nombre, kcal, prot, hc, grasa, fibra in INGREDIENTES_NUEVOS:
        # filter().first() y no get_or_create: una ejecucion previa pudo
        # dejar duplicados y get_or_create revienta con MultipleObjectsReturned.
        ing = Ingredient.objects.filter(name=nombre, language=lang).order_by('id').first()
        campos = {
            'brand': 'Mercadona', 'energy': kcal, 'protein': prot,
            'carbohydrates': hc, 'fat': grasa, 'fiber': fibra,
            'license_id': 2, 'license_author': 'SalazFitness (tabla de composicion)',
        }
        if ing is None:
            ing = Ingredient.objects.create(name=nombre, language=lang, **campos)
            creados += 1
        else:
            for k, v in campos.items():
                setattr(ing, k, v)
            ing.save()
        ids[clave] = ing.id
    print(f'2. INGREDIENTES: {creados} creados, {len(INGREDIENTES_NUEVOS) - creados} ya existian')
    return ids


# ============================================== 3. RUTINA 6 DIAS / 5 EJERCICIOS

DIAS = [
    ('Empuje A', [
        (73, 'basico'),      # Press de banca
        (687, 'basico'),     # Press militar
        (194, 'basico'),     # Fondos en paralelas
        (348, 'accesorio'),  # Elevacion lateral
        (1185, 'accesorio'),  # Extension triceps polea
    ]),
    ('Tiron A', [
        (475, 'basico'),     # Dominadas
        (1698, 'basico'),    # Remo con barra
        (1697, 'basico'),    # Jalon al pecho
        (222, 'accesorio'),  # Jalon a la cara
        (91, 'accesorio'),   # Curl con barra
    ]),
    ('Pierna A', [
        (1805, 'basico'),    # Sentadilla con barra
        (507, 'basico'),     # Peso muerto rumano
        (371, 'basico'),     # Prensa de piernas
        (364, 'accesorio'),  # Curl femoral
        (622, 'accesorio'),  # Elevacion de talones
    ]),
    ('Descanso', []),
    ('Empuje B', [
        (1277, 'basico'),    # Press inclinado mancuernas
        (20, 'basico'),      # Press Arnold
        (129, 'basico'),     # Press de pecho en maquina
        (256, 'accesorio'),  # Elevaciones frontales
        (1519, 'accesorio'),  # Extension triceps sobre cabeza
    ]),
    ('Tiron B', [
        (919, 'basico'),     # Remo en T
        (152, 'basico'),     # Dominadas supinas
        (1117, 'basico'),    # Remo gironda
        (822, 'accesorio'),  # Aperturas posteriores
        (1932, 'accesorio'),  # Curl martillo
    ]),
    ('Pierna B y Core', [
        (184, 'basico'),     # Peso muerto convencional
        (984, 'basico'),     # Zancadas
        (369, 'accesorio'),  # Extension de cuadriceps
        (458, 'accesorio'),  # Plancha
        (167, 'accesorio'),  # Abdominales
    ]),
]

ANCLAS = {73: D('20'), 1698: D('20'), 1805: D('20'), 1277: D('8'), 919: D('15'), 184: D('20')}

# 16 semanas: impares = Fuerza (peso alto), pares = Marcado.
BLOQUES = [(s, 'Fuerza' if s % 2 == 1 else 'Marcado') for s in range(1, 17)]

PARAMS = {
    ('Fuerza', 'basico'):     {'sets': 4, 'reps': 5,  'rest': 150, 'rir': D('2')},
    ('Fuerza', 'accesorio'):  {'sets': 3, 'reps': 8,  'rest': 90,  'rir': D('2')},
    ('Marcado', 'basico'):    {'sets': 3, 'reps': 12, 'rest': 75,  'rir': D('1')},
    ('Marcado', 'accesorio'): {'sets': 3, 'reps': 15, 'rest': 45,  'rir': D('1')},
}


def peso_ancla(exercise_id, semana):
    """Sube 2,5% en cada semana de Fuerza. En Marcado baja al 70% de esa carga."""
    w0 = ANCLAS[exercise_id]
    previas = sum(1 for s, t in BLOQUES if t == 'Fuerza' and s < semana)
    peso_fuerza = w0 * (D('1.025') ** previas)
    if semana % 2 == 1:
        return peso_fuerza.quantize(D('1'))
    return (peso_fuerza * D('0.70')).quantize(D('1'))


def crear_rutina(user):
    Routine.objects.filter(user=user).delete()
    inicio = HOY + datetime.timedelta(days=(7 - HOY.weekday()) % 7 or 7)  # proximo lunes
    fin = inicio + datetime.timedelta(weeks=16) - datetime.timedelta(days=1)

    routine = Routine.objects.create(
        user=user,
        name='Fuerza y marcado 16sem',
        description=(
            'Seis dias de entrenamiento, maximo cinco ejercicios por dia. Semana si '
            'y semana no alterna bloque de FUERZA (pocas repeticiones, mucho peso, '
            'descansos largos) con bloque de MARCADO (mas repeticiones, menos '
            'descanso). La dieta se mantiene en superavit las dos semanas: el '
            'objetivo es subir de 53 a 60 kg en musculo, no perder peso.'
        ),
        start=inicio, end=fin, fit_in_week=True,
    )
    print('3. RUTINA')
    print(f'   "{routine.name}" (id={routine.id})')
    print(f'   Empieza el LUNES {inicio}, termina el {fin} (16 semanas)')

    total = 0
    for orden, (nombre_dia, ejercicios) in enumerate(DIAS, start=1):
        day = Day.objects.create(
            routine=routine, order=orden, type='custom',
            name=nombre_dia, is_rest=(nombre_dia == 'Descanso'),
        )
        if not ejercicios:
            print(f'   {nombre_dia:18} -- descanso')
            continue
        for orden_slot, (exercise_id, rol) in enumerate(ejercicios, start=1):
            slot = Slot.objects.create(day=day, order=orden_slot)
            entry = SlotEntry.objects.create(
                slot=slot, exercise_id=exercise_id,
                repetition_unit_id=REP_UNIT_ID, weight_unit_id=WEIGHT_UNIT_ID,
                order=1, type='normal',
            )
            previo = {}
            for semana, tipo in BLOQUES:
                p = PARAMS[(tipo, rol)]
                if p['sets'] != previo.get('sets'):
                    SetsConfig.objects.create(slot_entry=entry, iteration=semana, value=p['sets'])
                    total += 1
                if p['reps'] != previo.get('reps'):
                    RepetitionsConfig.objects.create(slot_entry=entry, iteration=semana, value=p['reps'])
                    total += 1
                if p['rest'] != previo.get('rest'):
                    RestConfig.objects.create(slot_entry=entry, iteration=semana, value=p['rest'])
                    total += 1
                if p['rir'] != previo.get('rir'):
                    RiRConfig.objects.create(slot_entry=entry, iteration=semana, value=p['rir'])
                    total += 1
                previo = dict(p)
                if exercise_id in ANCLAS:
                    peso = peso_ancla(exercise_id, semana)
                    if peso != previo.get('peso'):
                        WeightConfig.objects.create(slot_entry=entry, iteration=semana, value=peso)
                        total += 1
                        previo['peso'] = peso
        print(f'   {nombre_dia:18} {len(ejercicios)} ejercicios')

    print(f'   {total} filas de configuracion escritas')
    return routine


# ============================================================ 4. NUTRICION

def crear_planes(user, mantenimiento):
    NutritionPlan.objects.filter(user=user).delete()
    fuerza = NutritionPlan.objects.create(
        user=user, description='Semana FUERZA (peso alto)', only_logging=True,
        goal_energy=mantenimiento + 450, goal_protein=140,
        goal_carbohydrates=431, goal_fat=85, goal_fiber=30,
    )
    marcado = NutritionPlan.objects.create(
        user=user, description='Semana MARCADO (definicion)', only_logging=True,
        goal_energy=mantenimiento + 200, goal_protein=150,
        goal_carbohydrates=374, goal_fat=78, goal_fiber=30,
    )
    print('4. PLANES NUTRICIONALES (los dos en superavit: el objetivo es ganar peso)')
    print(f'   Semana FUERZA : {fuerza.goal_energy} kcal | {fuerza.goal_protein}P {fuerza.goal_carbohydrates}HC {fuerza.goal_fat}G')
    print(f'   Semana MARCADO: {marcado.goal_energy} kcal | {marcado.goal_protein}P {marcado.goal_carbohydrates}HC {marcado.goal_fat}G')
    return fuerza, marcado


# ================================================ 5. COMPRA Y BATCH COOKING

IDS_EXISTENTES = {
    'pollo': 13955,       # Pechuga de pollo  104 kcal 21.5P
    'merluza': 126963,    # Medallones de merluza  78 kcal 18P
    'atun': 71161,        # Lomitos de atun al natural  63 kcal 14P
    'pavo': 73521,        # Fiambre pechuga de pavo  81 kcal 14P
    'arroz': 73436,       # Arroz  349 kcal 6.9P 75HC
    'macarrones': 164617,  # Macarrones  344 kcal 12P 68HC
    'lentejas': 75280,    # Lenteja pardina  320 kcal 24.5P
    'brocoli': 127379,    # Brocoli  23 kcal 2.7P
    'zanahoria': 127713,  # Zanahoria  39 kcal
    'avena': 75313,       # Avena molida  374 kcal 13.5P
    'aceite': 127592,     # AOVE  824 kcal
    'pan': 75656,         # Pan molde integral  227 kcal 11P
    'queso_batido': 127911,  # Queso fresco batido  46 kcal 8P
    'yogur': 73608,       # Yogur natural  73 kcal 3.5P
    'almendra': 127866,   # Almendra molida  604 kcal 26P
    'claras': 122140,     # Claras de huevo  47 kcal 10P
    'leche': 73928,       # Leche desnatada  36 kcal 3.3P
    'manzana': 167106,    # Manzana  52 kcal
}

# PRECIOS REALES de tienda.mercadona.es, CP 08784, leidos el 2026-08-23.
# (nombre en Mercadona, precio EUR del formato, tamano, unidad, EUR/kg o /l)
PRECIOS = {
    'pollo':          ('Pechugas enteras familiar de pollo', D('7.07'), D('1.14'), 'kg', D('6.20')),
    'ternera_picada': ('Preparado de carne picada vacuno', D('10.80'), D('1'), 'kg', D('10.80')),
    'merluza':        ('Filetes de merluza del Cabo sin piel Hacendado', D('5.50'), D('0.6'), 'kg', D('9.17')),
    'atun':           ('Atun claro al natural Hacendado (pack)', D('4.20'), D('0.48'), 'kg', D('11.67')),
    'pavo':           ('Pechuga de pavo Hacendado finas lonchas', D('3.95'), D('0.4'), 'kg', D('9.88')),
    'huevo':          ('Huevos grandes L (docena)', D('3.05'), D('12'), 'unit', D('0.25')),
    'claras':         ('Claras de huevo liquidas pasteurizadas', D('2.85'), D('1'), 'l', D('2.85')),
    'arroz':          ('Arroz redondo Hacendado', D('1.15'), D('1'), 'kg', D('1.15')),
    'macarrones':     ('Macarron Hacendado', D('1.15'), D('1'), 'kg', D('1.15')),
    'lentejas':       ('Lenteja pardina Hacendado', D('1.95'), D('1'), 'kg', D('1.95')),
    'patata':         ('Patatas (bolsa 3 kg)', D('4.65'), D('3'), 'kg', D('1.55')),
    'brocoli':        ('Brocoli', D('1.14'), D('0.38'), 'kg', D('3.00')),
    'judia_verde':    ('Judia verde plana', D('3.75'), D('0.75'), 'kg', D('5.00')),
    'calabacin':      ('Calabacin verde', D('0.62'), D('0.39'), 'kg', D('1.60')),
    'cebolla':        ('Cebollas (malla 2 kg)', D('3.60'), D('2'), 'kg', D('1.80')),
    'zanahoria':      ('Zanahorias (bolsa 1 kg)', D('1.20'), D('1'), 'kg', D('1.20')),
    'pimiento':       ('Pimiento rojo', D('0.70'), D('0.28'), 'kg', D('2.50')),
    'tomate_nat':     ('Tomate natural', D('1.90'), D('1'), 'kg', D('1.90')),
    'aceite':         ('Aceite de oliva virgen extra Hacendado (3 l)', D('13.55'), D('3'), 'l', D('4.52')),
    'avena':          ('Avena molida Hacendado', D('1.15'), D('0.5'), 'kg', D('2.30')),
    'pan':            ('Pan de molde 100% integral familiar Hacendado', D('1.15'), D('0.82'), 'kg', D('1.40')),
    'queso_batido':   ('Queso fresco batido desnatado 0% MG Hacendado', D('1.10'), D('0.5'), 'kg', D('2.20')),
    'yogur':          ('Yogur natural Hacendado (pack)', D('1.00'), D('0.75'), 'kg', D('1.33')),
    'almendra':       ('Almendra natural Hacendado', D('2.30'), D('0.2'), 'kg', D('11.50')),
    'leche':          ('Leche semidesnatada Hacendado (6 l)', D('5.04'), D('6'), 'l', D('0.84')),
    'platano':        ('Platano de Canarias IGP', D('0.41'), D('0.18'), 'kg', D('2.30')),
    'manzana':        ('Manzanas Golden (1,5 kg)', D('3.30'), D('1.5'), 'kg', D('2.20')),
    'postre_prot_nat': ('Postre lacteo natural +Proteinas 10 g 0% MG', D('1.40'), D('0.5'), 'kg', D('2.80')),
    'postre_prot_fresa': ('Postre lacteo con fresa +Proteinas 10 g 0% MG', D('1.55'), D('0.48'), 'kg', D('3.23')),
    'postre_prot_coco': ('Postre lacteo sabor coco +Proteinas 10 g 0% MG', D('1.55'), D('0.48'), 'kg', D('3.23')),
    'natillas_prot': ('Natillas sabor vainilla +Proteinas 12 g', D('1.75'), D('0.48'), 'kg', D('3.65')),
    'proteina_polvo': ('Proteina whey en polvo (NO en Mercadona)', D('22.00'), D('1'), 'kg', D('22.00')),
    'miel': ('Miel de flores Hacendado', D('5.00'), D('1'), 'kg', D('5.00')),
    'energetica': ('Bebida energetica Zero Energy Drink Hacendado', D('0.40'), D('0.25'), 'l', D('1.60')),
}

# Cada receta rinde 4 RACIONES = 2 comidas + 2 cenas (2 dias cubiertos).
# El numero de tandas en 12 dias esta al final de cada tupla.
# Cantidades calculadas para que cada racion de comida/cena ronde las
# 830 kcal, que es lo que hace falta para llegar al objetivo diario.
RECETAS_BATCH = [
    ('Pollo con arroz y brocoli', 4,
     'Corta la bandeja familiar de pechuga en tiras. Saltea con un poco de aceite hasta dorar. '
     'Cuece el arroz. Cuece el brocoli y la zanahoria al vapor 8 minutos. '
     'Reparte en 4 tuppers: dos para comida y dos para cena.',
     [('pollo', 800), ('arroz', 580), ('brocoli', 400), ('zanahoria', 200), ('aceite', 40)], 2),

    ('Hamburguesas caseras con patata', 4,
     'Forma 8 hamburguesas con la carne picada de vacuno, sal y pimienta. Hazlas a la plancha. '
     'Asa la patata en dados al horno 35 minutos a 200 grados con un chorrito de aceite. '
     'Saltea la judia verde. Reparte en 4 tuppers, dos hamburguesas por tupper.',
     [('ternera_picada', 800), ('patata', 2000), ('judia_verde', 400), ('cebolla', 150), ('aceite', 50)], 2),

    ('Merluza con macarrones y calabacin', 4,
     'Hornea la merluza 15 minutos a 200 grados. Cuece los macarrones al dente. '
     'Saltea el calabacin y el tomate natural en dados. Mezcla y reparte en 4 tuppers.',
     [('merluza', 800), ('macarrones', 640), ('calabacin', 400), ('tomate_nat', 300), ('aceite', 50)], 1),

    ('Lentejas con pollo y verduras', 4,
     'Cuece las lentejas con la cebolla, la zanahoria y el pimiento en dados. '
     'Anade la pechuga en tacos los ultimos 10 minutos. Reparte en 4 tuppers.',
     [('lentejas', 640), ('pollo', 600), ('zanahoria', 200), ('cebolla', 150), ('pimiento', 200), ('aceite', 50)], 1),
]

# Desayunos: se hacen cada dia, no van en tupper. Rotan 4 veces cada uno.
DESAYUNOS = [
    ('Desayuno A: avena con leche y platano', 1,
     'Calienta la leche, anade la avena y cuece 3 minutos. Sirve con el platano en rodajas '
     'y la almendra por encima.',
     [('avena', 100), ('leche', 300), ('platano', 120), ('almendra', 20)], 4),
    ('Desayuno B: tostadas con pavo y huevo', 1,
     'Tuesta el pan y unta el tomate natural rallado. Pon las lonchas de pavo. '
     'Cuaja las claras y dos huevos en la sarten con un poco de aceite.',
     [('pan', 120), ('pavo', 80), ('tomate_nat', 100), ('claras', 150), ('huevo', 120), ('aceite', 10)], 4),
    ('Desayuno C: yogur con avena, manzana y almendra', 1,
     'Mezcla el yogur y el queso batido con la avena, la manzana en dados y la almendra. '
     'Se puede dejar hecho la noche anterior.',
     [('yogur', 250), ('queso_batido', 100), ('avena', 80), ('manzana', 150), ('almendra', 20)], 4),
]

# Dos tomas de apoyo al dia (media manana y merienda). Sin ellas la dieta
# se queda muy por debajo del objetivo diario.
SNACKS = [
    ('Snack A: tostada con atun', 1,
     'Tuesta el pan, escurre el atun y montalo encima con un chorrito de aceite.',
     [('pan', 90), ('atun', 80), ('aceite', 10)], 12),
    ('Snack B: postre proteico + almendra', 1,
     'Un postre lacteo proteico de los que te gusten (natural, fresa, coco o natillas) '
     'con la almendra picada por encima. Ver la tabla comparativa: el natural es el que '
     'mas proteina da por caloria; los de sabores llevan algo de fructosa anadida.',
     [('postre_prot_nat', 250), ('almendra', 20), ('platano', 100)], 12),
]

# Entrenamiento: 6 dias a la semana, asi que 6 batidos y 6 preentrenos
# por semana -> unos 10 de cada uno en 12 dias.
SUPLEMENTOS = [
    ('Batido post-entreno (con polvo)', 1,
     'Bate la proteina en polvo con la leche, el platano y la miel. Tomalo en la media '
     'hora siguiente al entrenamiento. OJO: Mercadona NO vende proteina en polvo, hay '
     'que comprarla aparte (Decathlon, HSN, MyProtein...). Un bote de 1 kg da unos 33 batidos.',
     [('proteina_polvo', 30), ('leche', 300), ('platano', 120), ('miel', 20)], 10),
    ('Preentreno (energizante con agua)', 1,
     'Una lata de bebida energetica zero azucar con agua, unos 30 minutos antes de '
     'entrenar. Version zero para que no sume calorias al objetivo del dia.',
     [('energetica', 250)], 10),
]


def crear_compra_y_recetas(user, ids_nuevos):
    ids = dict(IDS_EXISTENTES)
    ids.update(ids_nuevos)

    household = Household.objects.filter(owner=user).first()
    Recipe.objects.filter(household=household).delete()
    Purchase.objects.filter(household=household).delete()
    IngredientPrice.objects.filter(household=household).delete()

    for clave, (_nom, precio, cantidad, unidad, _ref) in PRECIOS.items():
        if clave not in ids:
            continue
        IngredientPrice.objects.update_or_create(
            household=household, ingredient_id=ids[clave], is_current=True,
            defaults={'price': precio, 'amount': cantidad, 'unit': unidad,
                      'supermarket': 'Mercadona', 'date': HOY},
        )

    print('5. RECETAS (batch cooking: comida = cena, 4 raciones por tanda)')
    for nombre, raciones, instrucciones, ingredientes, _tandas in RECETAS_BATCH + DESAYUNOS + SNACKS + SUPLEMENTOS:
        receta = Recipe.objects.create(
            household=household, name=nombre, servings=raciones, instructions=instrucciones,
        )
        for clave, gramos in ingredientes:
            RecipeIngredient.objects.create(
                recipe=receta, ingredient_id=ids[clave], amount=D(str(gramos)),
            )
        kcal = receta.energy / raciones if raciones else 0
        prot = receta.protein / raciones if raciones else 0
        print(f'   {nombre[:42]:42} {kcal:5.0f} kcal  {prot:5.1f} g prot  {receta.cost_per_serving} EUR/racion')

    # Lista de la compra: suma de todo lo necesario para 12 dias
    necesario = {}
    for _n, _r, _i, ingredientes, tandas in RECETAS_BATCH + DESAYUNOS + SNACKS + SUPLEMENTOS:
        for clave, gramos in ingredientes:
            necesario[clave] = necesario.get(clave, 0) + gramos * tandas

    purchase = Purchase.objects.create(
        household=household, date=HOY,
        description=f'Compra batch cooking {DIAS_COMPRA} dias',
        supermarket='Mercadona', covers_days=DIAS_COMPRA,
    )

    print(f'\n6. LISTA DE LA COMPRA ({DIAS_COMPRA} dias) -- precios reales Mercadona CP 08784')
    print(f'   {"PRODUCTO":46} {"NECESITAS":>10}  {"COMPRAR":>18}  {"COSTE":>7}')
    for clave in sorted(necesario, key=lambda k: -necesario[k]):
        if clave not in ids or clave not in PRECIOS:
            continue
        gramos = necesario[clave]
        nombre_merca, precio_pack, tam_pack, unidad, _ref = PRECIOS[clave]
        if unidad == 'unit':
            unidades = gramos / 60  # 1 huevo ~ 60 g
            packs = max(1, int(unidades / float(tam_pack)) + (1 if unidades % float(tam_pack) else 0))
            etiqueta_nec = f'{unidades:.0f} ud'
        else:
            pack_g = float(tam_pack) * 1000
            packs = max(1, int(gramos / pack_g) + (1 if gramos % pack_g else 0))
            etiqueta_nec = f'{gramos/1000:.2f} kg' if gramos >= 1000 else f'{gramos:.0f} g'
        coste = precio_pack * packs
        PurchaseItem.objects.create(
            purchase=purchase, ingredient_id=ids[clave], name=nombre_merca,
            amount=D(str(gramos)), unit='unit' if unidad == 'unit' else 'g',
            price=coste, is_shared=True,
        )
        formato = f'{packs} x {tam_pack} {unidad}'
        print(f'   {nombre_merca[:46]:46} {etiqueta_nec:>10}  {formato:>18}  {coste:>6} EUR')

    print(f'\n   TOTAL: {purchase.total_cost} EUR para {DIAS_COMPRA} dias  ({purchase.cost_per_day} EUR/dia)')
    return purchase


def main():
    user, mantenimiento = actualizar_perfil()
    ids_nuevos = crear_ingredientes()
    crear_rutina(user)
    crear_planes(user, mantenimiento)
    crear_compra_y_recetas(user, ids_nuevos)
    print('\nListo. Usuario salaz1 / clave 123456')


if __name__ == '__main__':
    main()
