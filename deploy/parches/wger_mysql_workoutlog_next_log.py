"""
Parche de build: arregla un fallo real de wger contra MySQL.

wger/manager/migrations/0025_change_pk_to_uuid.py rellena WorkoutLog.next_log_tmp
con una subconsulta AUTORREFERENCIADA sobre la propia tabla WorkoutLog:

    WorkoutLog.objects.update(
        next_log_tmp=Subquery(
            WorkoutLog.objects.filter(id=OuterRef('next_log')).values('uuid')[:1]
        )
    )

MySQL prohibe "actualizar la tabla X mientras se selecciona de la tabla X" en la
misma sentencia (error 1093, "You can't specify target table ... for update in
FROM clause"). Esto no pasa en PostgreSQL ni en SQLite, asi que a wger se le ha
colado sin que sus pruebas lo cazaran: es un fallo real y reproducible de la
migracion contra MySQL 8.4, no de nada del modulo salaz.

Este script se ejecuta en el build de deploy/Dockerfile, justo despues de clonar
wger y antes de instalar nada, y sustituye ese unico bloque por el mismo
resultado calculado fila a fila en Python (una consulta de lectura con JOIN,
que MySQL si permite, seguida de un UPDATE por fila con un valor literal, sin
subconsulta autorreferenciada). session_tmp no se toca: su subconsulta lee de
WorkoutSession, una tabla distinta, y ahi MySQL no pone ninguna pega.

Falla el build a proposito (en vez de no hacer nada) si el texto original ya
no coincide exactamente: si wger corrige esto rio arriba, o cambia el fichero
por otro motivo, hace falta que alguien revise este parche a mano en vez de
que se quede aplicando en silencio un arreglo que ya no hace falta (o que
podria dejar de encajar).
"""

import sys
from pathlib import Path

FICHERO = Path('/srv/wger/wger/manager/migrations/0025_change_pk_to_uuid.py')

ORIGINAL = '''    # next_log_tmp
    WorkoutLog.objects.update(
        next_log_tmp=Subquery(
            WorkoutLog.objects.filter(id=OuterRef('next_log')).values('uuid')[:1],
        )
    )'''

ARREGLADO = '''    # next_log_tmp
    #
    # PARCHE (ver deploy/parches/wger_mysql_workoutlog_next_log.py): la version
    # original de wger hace esto con una subconsulta autorreferenciada sobre la
    # propia WorkoutLog dentro de un UPDATE, y MySQL lo rechaza con el error 1093
    # ("You can't specify target table 'manager_workoutlog' for update in FROM
    # clause"). PostgreSQL y SQLite si lo admiten, de ahi que se le colara a wger.
    # Mismo resultado, fila a fila: una lectura con JOIN (permitida, no es un
    # UPDATE) seguida de un UPDATE por fila con un valor ya resuelto, sin
    # subconsulta sobre la misma tabla.
    pares = list(
        WorkoutLog.objects.exclude(next_log__isnull=True).values_list('id', 'next_log__uuid')
    )
    for log_id, next_uuid in pares:
        WorkoutLog.objects.filter(id=log_id).update(next_log_tmp=next_uuid)'''


def main() -> int:
    texto = FICHERO.read_text()
    if ORIGINAL not in texto:
        print(
            f'ERROR: {FICHERO} ya no contiene el bloque esperado. '
            'wger ha debido cambiar esta migracion: revisa a mano si este '
            'parche (deploy/parches/wger_mysql_workoutlog_next_log.py) sigue '
            'haciendo falta antes de tocar nada mas.',
            file=sys.stderr,
        )
        return 1
    FICHERO.write_text(texto.replace(ORIGINAL, ARREGLADO))
    print(f'Parcheado {FICHERO}: next_log_tmp ya no autorreferencia WorkoutLog en MySQL.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
