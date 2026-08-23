"""
Crea el perfil de prueba salaz1 completo: usuario, biometria, rutina de
16 semanas con periodizacion masa/definicion alternando cada 2 semanas
(estilo "recomposicion tipo Wolverine": ni bulk puro ni solo resistencia),
dos planes nutricionales (fase masa / fase definicion), un hogar con
compra y recetas basadas en productos reales de Mercadona/Hacendado
presentes en la base de datos de wger.

NO toca al usuario admin ni a sus datos.

Los precios de la compra son ESTIMACIONES razonables de precio de
supermercado espanol, no datos scrapeados en tiempo real: no hay acceso
a precios en vivo de Mercadona. El usuario deberia ajustarlos a los
precios reales de su ultimo ticket.

Ejecutar con:
  cd C:\\Proyectos\\wger
  $env:DJANGO_SETTINGS_MODULE = "settings.local_dev"
  .\\.venv\\Scripts\\python.exe C:\\Proyectos\\SalazFitness\\scripts\\crear_perfil_salaz1.py
"""

import datetime
import decimal
import os

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings.local_dev')
django.setup()

from django.contrib.auth.models import User  # noqa: E402
from django.contrib.auth.hashers import make_password  # noqa: E402

from wger.core.models import UserProfile  # noqa: E402
from wger.weight.models import WeightEntry  # noqa: E402
from wger.manager.models import (  # noqa: E402
    Routine,
    Day,
    Slot,
    SlotEntry,
    SetsConfig,
    RepetitionsConfig,
    WeightConfig,
    RestConfig,
    RiRConfig,
)
from wger.nutrition.models import NutritionPlan, Meal, MealItem, Ingredient  # noqa: E402

import sys  # noqa: E402
sys.path.insert(0, r'C:\Proyectos\SalazFitness\backend')
from salaz.models import (  # noqa: E402
    Household,
    HouseholdMember,
    IngredientPrice,
    Purchase,
    PurchaseItem,
    Recipe,
    RecipeIngredient,
)

D = decimal.Decimal
HOY = datetime.date.today()
REP_UNIT_ID = 1  # "Repetitions"
WEIGHT_UNIT_ID = 1  # "kg"


# ============================================================ 1. USUARIO

def crear_usuario():
    user, created = User.objects.get_or_create(
        username='salaz1',
        defaults={'email': 'salaz1@example.com', 'password': make_password('123456')},
    )
    if not created:
        user.password = make_password('123456')
        user.save()
    print(f'1. Usuario salaz1: {"creado" if created else "ya existia, clave reseteada"} (id={user.id})')

    profile = user.userprofile
    profile.birthdate = datetime.date(1998, 6, 15)
    profile.gender = UserProfile.GENDER_MALE
    profile.height = 175
    profile.weight_unit = 'kg'
    profile.work_intensity = UserProfile.INTENSITY_MEDIUM
    profile.sport_intensity = UserProfile.INTENSITY_HIGH
    profile.freetime_intensity = UserProfile.INTENSITY_MEDIUM
    profile.sleep_hours = 7
    profile.work_hours = 8
    profile.sport_hours = 5
    profile.freetime_hours = 8
    profile.save()

    # calculate_basal_metabolic_rate() lee profile.weight, que a su vez
    # es la ULTIMA WeightEntry del usuario (no un campo propio del
    # perfil): hay que crear la entrada de peso antes de calcular, o el
    # BMR sale a partir de peso 0.
    peso, _ = WeightEntry.objects.get_or_create(
        user=user,
        date=datetime.datetime.combine(HOY, datetime.time(8, 0), tzinfo=datetime.timezone.utc),
        defaults={'weight': D('53.0')},
    )
    print(f'   Peso inicial: 53.0 kg ({HOY})')

    bmr = profile.calculate_basal_metabolic_rate()
    factor = profile.calculate_activities()
    mantenimiento = int(bmr * factor)
    profile.calories = mantenimiento
    profile.save()

    print('   Biometria: 28 anios, 175 cm, hombre (valores de referencia: no se han dado datos reales)')
    print(f'   BMR (Mifflin-St Jeor) = {bmr} kcal | factor actividad = {factor}')
    print(f'   Mantenimiento estimado = {mantenimiento} kcal/dia')
    return user, mantenimiento


# ============================================================ 2. RUTINA

# (id_ejercicio, nombre_dia, rol) -- rol: 'basico' o 'accesorio'.
# Mismo pool de 35 ejercicios verificado en la rutina de admin (todos
# existen en la base, y tras la traduccion anadida ahora casi todos
# tienen nombre en espanol).
DIAS = [
    ('Empuje A', [
        (73, 'basico'), (687, 'basico'), (194, 'basico'),
        (924, 'accesorio'), (256, 'accesorio'), (1185, 'accesorio'),
    ]),
    ('Tiron A', [
        (475, 'basico'), (1698, 'basico'), (1697, 'basico'),
        (222, 'accesorio'), (91, 'accesorio'), (1932, 'accesorio'),
    ]),
    ('Pierna A', [
        (1805, 'basico'), (507, 'basico'), (371, 'basico'),
        (364, 'accesorio'), (622, 'accesorio'),
    ]),
    ('Descanso', []),
    ('Empuje B', [
        (1277, 'basico'), (20, 'basico'), (129, 'basico'),
        (348, 'accesorio'), (1519, 'accesorio'), (1675, 'accesorio'),
    ]),
    ('Tiron B', [
        (919, 'basico'), (152, 'basico'), (1117, 'basico'),
        (822, 'accesorio'), (465, 'accesorio'), (1649, 'accesorio'),
    ]),
    ('Pierna B y Core', [
        (184, 'basico'), (984, 'basico'),
        (369, 'accesorio'), (1620, 'accesorio'), (458, 'accesorio'), (167, 'accesorio'),
    ]),
]

# Peso de referencia (kg) del ejercicio ancla de cada dia, en el primer
# bloque de masa. El resto de ejercicios se deja sin peso configurado:
# el usuario lo ajusta en su primera sesion real (mismo criterio que la
# rutina de admin).
ANCLAS = {73: D('20'), 1698: D('20'), 1805: D('20'), 1277: D('8'), 919: D('15'), 184: D('20')}

# 8 bloques de 2 semanas = 16 semanas. Alternando Masa/Definicion,
# empezando y terminando en bloques distintos para que el ultimo tramo
# sea el de "marcar" antes de la foto final.
BLOQUES = [
    (1, 'Masa'), (3, 'Definicion'), (5, 'Masa'), (7, 'Definicion'),
    (9, 'Masa'), (11, 'Definicion'), (13, 'Masa'), (15, 'Definicion'),
]

PARAMS = {
    ('Masa', 'basico'):     {'sets': 4, 'reps': 6,  'rest': 120, 'rir': D('2')},
    ('Masa', 'accesorio'):  {'sets': 3, 'reps': 10, 'rest': 90,  'rir': D('2')},
    ('Definicion', 'basico'):    {'sets': 3, 'reps': 12, 'rest': 75, 'rir': D('1')},
    ('Definicion', 'accesorio'): {'sets': 3, 'reps': 15, 'rest': 45, 'rir': D('1')},
}


def peso_ancla(exercise_id, iteracion):
    """Progresion del peso de referencia solo para los ejercicios ancla."""
    w0 = ANCLAS[exercise_id]
    bloques_masa_previos = sum(1 for it, tipo in BLOQUES if tipo == 'Masa' and it < iteracion)
    peso_masa_actual = w0 * (D('1.05') ** bloques_masa_previos)
    tipo_bloque = next(tipo for it, tipo in BLOQUES if it == iteracion)
    if tipo_bloque == 'Masa':
        return peso_masa_actual.quantize(D('1'))
    return (peso_masa_actual * D('0.75')).quantize(D('1'))


def crear_rutina(user):
    inicio = HOY
    fin = inicio + datetime.timedelta(weeks=16) - datetime.timedelta(days=1)

    Routine.objects.filter(user=user, name='Recomposicion 16 semanas').delete()
    routine = Routine.objects.create(
        user=user,
        name='Recomposicion 16 semanas',
        description=(
            'Periodizacion en bloques de 2 semanas alternando masa (fuerza, '
            'series pesadas, descansos largos) y definicion (mas repeticiones, '
            'menos descanso, ritmo metabolico), sin dejar nunca la dieta en '
            'deficit: el objetivo es ganar peso en musculo, no una fase de '
            'volumen sucio ni una fase de solo cardio.'
        ),
        start=inicio,
        end=fin,
        fit_in_week=True,
    )
    print(f'2. Rutina "{routine.name}" (id={routine.id}) del {inicio} al {fin}')

    total_configs = 0
    for orden, (nombre_dia, ejercicios) in enumerate(DIAS, start=1):
        day = Day.objects.create(
            routine=routine,
            order=orden,
            type='custom',
            name=nombre_dia,
            is_rest=(nombre_dia == 'Descanso'),
        )
        if not ejercicios:
            continue

        for orden_slot, (exercise_id, rol) in enumerate(ejercicios, start=1):
            slot = Slot.objects.create(day=day, order=orden_slot)
            entry = SlotEntry.objects.create(
                slot=slot,
                exercise_id=exercise_id,
                repetition_unit_id=REP_UNIT_ID,
                weight_unit_id=WEIGHT_UNIT_ID,
                order=1,
                type='normal',
            )

            valor_previo = {}
            for iteracion, tipo_bloque in BLOQUES:
                p = PARAMS[(tipo_bloque, rol)]
                nuevos = {
                    'sets': p['sets'],
                    'reps': p['reps'],
                    'rest': p['rest'],
                    'rir': p['rir'],
                }
                if nuevos['sets'] != valor_previo.get('sets'):
                    SetsConfig.objects.create(slot_entry=entry, iteration=iteracion, value=nuevos['sets'])
                    total_configs += 1
                if nuevos['reps'] != valor_previo.get('reps'):
                    RepetitionsConfig.objects.create(slot_entry=entry, iteration=iteracion, value=nuevos['reps'])
                    total_configs += 1
                if nuevos['rest'] != valor_previo.get('rest'):
                    RestConfig.objects.create(slot_entry=entry, iteration=iteracion, value=nuevos['rest'])
                    total_configs += 1
                if nuevos['rir'] != valor_previo.get('rir'):
                    RiRConfig.objects.create(slot_entry=entry, iteration=iteracion, value=nuevos['rir'])
                    total_configs += 1
                valor_previo = nuevos

                if exercise_id in ANCLAS:
                    peso = peso_ancla(exercise_id, iteracion)
                    if peso != valor_previo.get('peso'):
                        WeightConfig.objects.create(slot_entry=entry, iteration=iteracion, value=peso)
                        total_configs += 1
                        valor_previo['peso'] = peso

        print(f'   {nombre_dia}: {len(ejercicios)} ejercicios')

    print(f'   Total de filas de configuracion escritas: {total_configs}')
    return routine


# ======================================================= 3. NUTRICION

def crear_planes_nutricion(user, mantenimiento):
    NutritionPlan.objects.filter(user=user, description__startswith='SalazFitness -').delete()

    fase_masa = NutritionPlan.objects.create(
        user=user,
        description='SalazFitness - Fase Masa',
        only_logging=True,
        goal_energy=mantenimiento + 450,
        goal_protein=106,
        goal_carbohydrates=484,
        goal_fat=88,
        goal_fiber=30,
    )
    fase_definicion = NutritionPlan.objects.create(
        user=user,
        description='SalazFitness - Fase Definicion',
        only_logging=True,
        goal_energy=mantenimiento + 200,
        goal_protein=117,
        goal_carbohydrates=390,
        goal_fat=97,
        goal_fiber=30,
    )
    print('3. Planes nutricionales:')
    print(f'   Fase Masa       (id={fase_masa.id}): {fase_masa.goal_energy} kcal, '
          f'{fase_masa.goal_protein}P / {fase_masa.goal_carbohydrates}HC / {fase_masa.goal_fat}G')
    print(f'   Fase Definicion (id={fase_definicion.id}): {fase_definicion.goal_energy} kcal, '
          f'{fase_definicion.goal_protein}P / {fase_definicion.goal_carbohydrates}HC / {fase_definicion.goal_fat}G')
    return fase_masa, fase_definicion


# =============================================== 4. HOGAR, COMPRA, RECETAS

# (id_ingrediente, nombre_visible, precio_eur, cantidad, unidad)
# Precios estimados de supermercado espanol (Mercadona/Hacendado), no
# datos en vivo: ajustar al ticket real cuando se tenga.
INGREDIENTES_COMPRA = {
    'pollo':    (75433,  'Pechuga de pollo braseada Hacendado',        D('3.50'), D('300'), 'g'),
    'arroz':    (127599, 'Arroz cocido Hacendado',                     D('1.10'), D('250'), 'g'),
    'espinaca': (127205, 'Brotes de espinaca',                         D('1.50'), D('200'), 'g'),
    'aceite':   (127592, 'Aceite de Oliva Virgen Extra Hacendado',     D('5.50'), D('1'),   'l'),
    'pan':      (75656,  'Pan de molde integral sin azucares Hacendado', D('1.80'), D('460'), 'g'),
    'queso':    (127911, 'Queso Fresco Batido Hacendado',              D('1.35'), D('500'), 'g'),
    'claras':   (122140, 'Claras de Huevo San Juan',                   D('2.60'), D('500'), 'g'),
    'salmon':   (148539, 'Salmon (2 filetes)',                         D('4.50'), D('260'), 'g'),
    'boniato':  (126618, 'Boniato cocido en dados',                    D('1.60'), D('400'), 'g'),
    'avena':    (75313,  'Avena Molida Hacendado',                     D('1.10'), D('500'), 'g'),
    'almendra': (127866, 'Almendra Molida Hacendado',                  D('2.60'), D('200'), 'g'),
    'yogur':    (73608,  'Yogur natural Danone',                       D('1.60'), D('500'), 'g'),
}

RECETAS = [
    ('Pollo con arroz y espinacas', 2,
     'Saltea la pechuga de pollo en una sarten con un poco de aceite hasta que este dorada. '
     'Anade las espinacas y saltea 2-3 minutos. Sirve sobre el arroz cocido caliente.',
     [('pollo', 300), ('arroz', 300), ('espinaca', 150), ('aceite', 15)]),
    ('Tostada integral con queso fresco batido y claras', 1,
     'Cuaja las claras de huevo en una sarten antiadherente a fuego medio, sin aceite. '
     'Tuesta el pan integral. Unta el queso fresco batido sobre las tostadas y acompana con las claras.',
     [('pan', 90), ('queso', 150), ('claras', 200)]),
    ('Salmon con boniato asado', 1,
     'Hornea el salmon a 200 grados durante 12-15 minutos. '
     'Sirve con el boniato asado, alinado con un chorrito de aceite de oliva.',
     [('salmon', 180), ('boniato', 250), ('aceite', 10)]),
    ('Batido post-entreno de avena y almendra', 1,
     'Bate todos los ingredientes con agua o leche hasta conseguir la textura deseada. '
     'Tomalo en la media hora siguiente al entrenamiento.',
     [('avena', 60), ('almendra', 20), ('yogur', 200)]),
]


def crear_compra_y_recetas(user):
    Household.objects.filter(owner=user, name='Casa salaz1').delete()
    household = Household.objects.create(owner=user, name='Casa salaz1')
    HouseholdMember.objects.create(household=household, name='salaz1', user=user, consumption_share=D('100'))
    print(f'4. Hogar "Casa salaz1" (id={household.id}), 1 miembro al 100%')

    for clave, (ingredient_id, nombre, precio, cantidad, unidad) in INGREDIENTES_COMPRA.items():
        IngredientPrice.objects.update_or_create(
            household=household,
            ingredient_id=ingredient_id,
            is_current=True,
            defaults={'price': precio, 'amount': cantidad, 'unit': unidad,
                      'supermarket': 'Mercadona', 'date': HOY},
        )
    print(f'   {len(INGREDIENTES_COMPRA)} precios de referencia (Mercadona) cargados')

    purchase = Purchase.objects.create(
        household=household, date=HOY, description='Compra semanal',
        supermarket='Mercadona', covers_days=7,
    )
    for clave, (ingredient_id, nombre, precio, cantidad, unidad) in INGREDIENTES_COMPRA.items():
        PurchaseItem.objects.create(
            purchase=purchase, ingredient_id=ingredient_id, name=nombre,
            amount=cantidad, unit=unidad, price=precio, is_shared=True,
        )
    print(f'   Compra "{purchase.description}" (id={purchase.id}): {purchase.total_cost} EUR, '
          f'{purchase.cost_per_day} EUR/dia')

    ids_recetas = []
    for nombre, raciones, instrucciones, ingredientes in RECETAS:
        Recipe.objects.filter(household=household, name=nombre).delete()
        receta = Recipe.objects.create(
            household=household, name=nombre, servings=raciones, instructions=instrucciones,
        )
        for clave, gramos in ingredientes:
            ingredient_id = INGREDIENTES_COMPRA[clave][0]
            RecipeIngredient.objects.create(recipe=receta, ingredient_id=ingredient_id, amount=D(str(gramos)))
        ids_recetas.append(receta.id)
        print(f'   Receta "{nombre}" (id={receta.id}): {receta.energy} kcal total, '
              f'{receta.cost_per_serving} EUR/racion')

    return household, ids_recetas


# ==================================================================== MAIN

def main():
    user, mantenimiento = crear_usuario()
    crear_rutina(user)
    crear_planes_nutricion(user, mantenimiento)
    crear_compra_y_recetas(user)
    print('\nListo. Usuario: salaz1 / Clave: 123456')


if __name__ == '__main__':
    main()
