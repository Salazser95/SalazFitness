"""Anade traducciones al espanol para ejercicios de wger que solo tienen
nombre en ingles. Son nombres y descripciones tecnicas genericas (no texto
creativo protegido), asi que no hay problema de derechos de autor: es el
mismo tipo de aporte que cualquier colaborador de wger podria mandar via
su sistema de traducciones.

Ejecutar con: DJANGO_SETTINGS_MODULE=settings.local_dev python traducciones_ejercicios.py
"""
import django
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'settings.local_dev')
django.setup()

from wger.exercises.models import Translation  # noqa: E402

TRADUCCIONES = {
    687: ('Press militar', 'De pie o sentado, empuja la barra o mancuernas por encima de la cabeza hasta extender los brazos. Trabaja hombros y triceps.'),
    1698: ('Remo con barra (agarre prono)', 'Con el torso inclinado hacia adelante, tira de la barra hacia el abdomen manteniendo la espalda recta. Trabaja la espalda media.'),
    1697: ('Jalon al pecho (agarre ancho)', 'Sentado en la maquina de polea alta, tira de la barra hacia el pecho con los codos hacia abajo. Trabaja el dorsal ancho.'),
    1932: ('Curl martillo', 'De pie, flexiona el codo con la mancuerna en agarre neutro (pulgar hacia arriba). Trabaja biceps y braquial.'),
    1805: ('Sentadilla con barra', 'Con la barra sobre los trapecios, flexiona cadera y rodillas hasta bajar el gluteo, y vuelve a subir. Ejercicio basico de pierna.'),
    1519: ('Extension de triceps por encima de la cabeza', 'De pie o sentado, con la mancuerna o barra detras de la cabeza, extiende los codos hacia arriba. Trabaja el triceps.'),
    1675: ('Flexiones', 'En posicion de plancha, baja el pecho hacia el suelo flexionando los codos y vuelve a subir. Trabaja pecho, hombro y triceps.'),
    919: ('Remo en T', 'Con la barra fija en un extremo, inclina el torso y tira de la barra hacia el abdomen. Trabaja la espalda media.'),
    465: ('Curl con banco Scott', 'Con el brazo apoyado en el banco inclinado, flexiona el codo con la barra o mancuerna. Aisla el biceps.'),
    1649: ('Curl de concentracion', 'Sentado, con el codo apoyado en el muslo, flexiona el codo con la mancuerna. Aisla el biceps.'),
    1620: ('Elevacion de talones sentado con mancuerna', 'Sentado, con una mancuerna sobre las rodillas, eleva los talones. Trabaja el soleo.'),
}

LANGUAGE_ES = 4

def main():
    creadas = 0
    for exercise_id, (nombre, descripcion) in TRADUCCIONES.items():
        obj, created = Translation.objects.get_or_create(
            exercise_id=exercise_id,
            language_id=LANGUAGE_ES,
            defaults={'name': nombre, 'description': descripcion},
        )
        estado = 'creada' if created else 'ya existia'
        print(f'  {exercise_id:5d} -> {nombre}  ({estado})')
        if created:
            creadas += 1
    print(f'\nTotal creadas: {creadas}')


if __name__ == '__main__':
    main()
