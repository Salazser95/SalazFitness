#!/usr/bin/env python3
"""
Copia el contenido de una cuenta (entreno, nutricion, compra, peso y perfil)
desde una instalacion de SalazFitness (normalmente tu wger local) hacia otra
(normalmente el servidor remoto del tunel), usando la API REST de la app en
los dos lados -- no toca ninguna base de datos directamente.

Por que por la API y no copiando la base de datos: las dos instalaciones son
independientes (SQLite local, MySQL remoto), y sus catalogos de ejercicios y
alimentos casi seguro tienen ids numericos distintos para la misma cosa (el
id de "Press banca" en un lado no tiene por que ser el mismo id en el otro).
Copiar los ids tal cual dejaria rutinas y comidas apuntando al ejercicio o
alimento equivocado, en silencio. Este script resuelve cada ejercicio y cada
alimento por NOMBRE en el lado remoto antes de escribir nada que dependa de
el, y si no encuentra una coincidencia exacta, lo dice en vez de adivinar.

Uso tipico (con el backend local arrancado en :8000 y el tunel activo):

    python scripts/migrar_a_remoto.py \
        --local http://localhost:8000 --usuario-local salaz1 --clave-local ... \
        --remoto https://algo-al-azar.trycloudflare.com --usuario-remoto salaz1 --clave-remota ...

Con --dry-run se lee todo y se informa de lo que se HARIA, sin escribir nada
en el lado remoto -- conviene correrlo asi la primera vez.

Requiere la libreria "requests" (ya es una dependencia de wger, deberia estar
en el mismo entorno virtual que usas para arrancar el backend).
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import quote as url_quote

import requests


# ------------------------------------------------------------------ sesion


class ErrorApi(Exception):
    def __init__(self, metodo: str, url: str, status: int, cuerpo: str):
        self.metodo = metodo
        self.url = url
        self.status = status
        self.cuerpo = cuerpo
        super().__init__(f'{metodo} {url} -> {status}: {cuerpo[:300]}')


class Sesion:
    """Un cliente HTTP contra una instalacion de SalazFitness/wger, ya logueado."""

    def __init__(self, base_url: str, etiqueta: str):
        self.base_url = base_url.rstrip('/')
        self.etiqueta = etiqueta
        self.access_token: str | None = None
        self.refresh_token: str | None = None
        self.user_id: int | None = None
        self.http = requests.Session()

    def login(self, usuario: str, clave: str) -> None:
        res = self.http.post(
            f'{self.base_url}/allauth/app/v1/auth/login',
            json={'username': usuario, 'password': clave},
            timeout=30,
        )
        if res.status_code != 200:
            raise ErrorApi('POST', '/allauth/app/v1/auth/login', res.status_code, res.text)
        datos = res.json()
        self.access_token = datos['meta']['access_token']
        self.refresh_token = datos['meta']['refresh_token']
        self.user_id = datos['data']['user']['id']
        print(f'  [{self.etiqueta}] sesion iniciada como "{usuario}"')

    def _refrescar(self) -> None:
        res = self.http.post(
            f'{self.base_url}/allauth/app/v1/tokens/refresh',
            json={'refresh_token': self.refresh_token},
            timeout=30,
        )
        if res.status_code != 200:
            raise ErrorApi('POST', '/allauth/app/v1/tokens/refresh', res.status_code, res.text)
        datos = res.json()['data']
        self.access_token = datos['access_token']
        self.refresh_token = datos['refresh_token']

    def _cabeceras(self) -> dict[str, str]:
        return {'Authorization': f'Bearer {self.access_token}'}

    def _peticion(self, metodo: str, ruta: str, **kwargs: Any) -> requests.Response:
        # `ruta` puede ser un path relativo ("/api/v2/...") o, para seguir la
        # paginacion de DRF, la URL absoluta que el propio servidor devolvio
        # en "next": esa ya trae host y esquema, no hay que volver a anteponer
        # base_url (podria no coincidir byte a byte si el proxy/tunel de por
        # medio normaliza la URL de forma distinta).
        url = ruta if ruta.startswith('http') else f'{self.base_url}{ruta}'
        res = self.http.request(metodo, url, headers=self._cabeceras(), timeout=30, **kwargs)
        # El access token vive 5 minutos (ver docs/API-CONTRACT.md): en una
        # migracion con muchas filas es facil que caduque a mitad. Un solo
        # reintento tras refrescar basta, nunca hace falta un segundo.
        if res.status_code == 401:
            self._refrescar()
            res = self.http.request(metodo, url, headers=self._cabeceras(), timeout=30, **kwargs)
        return res

    def get(self, ruta: str, **kwargs: Any) -> Any:
        res = self._peticion('GET', ruta, **kwargs)
        if res.status_code != 200:
            raise ErrorApi('GET', ruta, res.status_code, res.text)
        return res.json()

    def get_todo(self, ruta: str, limite_paginas: int = 200) -> list[dict[str, Any]]:
        """Seguir 'next' hasta agotar la paginacion, igual que fetchAll en el frontend."""
        elementos: list[dict[str, Any]] = []
        siguiente: str | None = ruta
        for _ in range(limite_paginas):
            if siguiente is None:
                break
            res = self._peticion('GET', siguiente)
            if res.status_code != 200:
                raise ErrorApi('GET', siguiente, res.status_code, res.text)
            datos = res.json()
            elementos.extend(datos.get('results', datos if isinstance(datos, list) else []))
            siguiente = datos.get('next') if isinstance(datos, dict) else None
        return elementos

    def post(self, ruta: str, cuerpo: dict[str, Any]) -> dict[str, Any]:
        res = self._peticion('POST', ruta, json=cuerpo)
        if res.status_code not in (200, 201):
            raise ErrorApi('POST', ruta, res.status_code, res.text)
        return res.json()

    def patch(self, ruta: str, cuerpo: dict[str, Any]) -> dict[str, Any]:
        res = self._peticion('PATCH', ruta, json=cuerpo)
        if res.status_code != 200:
            raise ErrorApi('PATCH', ruta, res.status_code, res.text)
        return res.json()


# --------------------------------------------------------------- el informe


@dataclass
class Informe:
    """Cuenta lo que se ha hecho en cada dominio, para el resumen final."""

    creados: dict[str, int] = field(default_factory=dict)
    omitidos: dict[str, int] = field(default_factory=dict)
    fallos: list[str] = field(default_factory=list)

    def creado(self, que: str, n: int = 1) -> None:
        self.creados[que] = self.creados.get(que, 0) + n

    def omitido(self, que: str, n: int = 1) -> None:
        self.omitidos[que] = self.omitidos.get(que, 0) + n

    def fallo(self, mensaje: str) -> None:
        self.fallos.append(mensaje)
        print(f'    ! {mensaje}')

    def resumen(self) -> str:
        lineas = []
        for que, n in self.creados.items():
            lineas.append(f'  creado(s): {n} {que}')
        for que, n in self.omitidos.items():
            lineas.append(f'  omitido(s) (ya existian): {n} {que}')
        if self.fallos:
            lineas.append(f'  FALLOS: {len(self.fallos)} (detalle mas arriba)')
        return '\n'.join(lineas) if lineas else '  (nada que hacer)'


def _intentar(informe: Informe, contexto: str, fn: Callable[[], Any]) -> Any:
    """Ejecuta fn(); si falla, lo registra en el informe y sigue con lo demas
    en vez de tirar toda la migracion abajo por una fila mal formada."""
    try:
        return fn()
    except ErrorApi as e:
        informe.fallo(f'{contexto}: {e}')
        return None
    except Exception as e:  # noqa: BLE001 - se quiere capturar cualquier cosa y seguir
        informe.fallo(f'{contexto}: {type(e).__name__}: {e}')
        return None


# --------------------------------------------------- resolver ejercicios/alimentos


def normalizar(texto: str) -> str:
    return ' '.join(texto.strip().lower().split())


class ResolverEjercicios:
    """
    Traduce un id de Exercise LOCAL al id REMOTO equivalente, por nombre (no
    por id: los dos catalogos pueden tener numeraciones distintas). No crea
    ejercicios nuevos -- es el catalogo compartido de la comunidad wger, no
    algo propio del usuario -- asi que si no hay coincidencia exacta de
    nombre, se informa y esa fila se omite en vez de adivinar.
    """

    def __init__(self, local: Sesion, remoto: Sesion, informe: Informe):
        self.local = local
        self.remoto = remoto
        self.informe = informe
        self._cache: dict[int, int | None] = {}
        self._indice_remoto: dict[str, int] | None = None

    def _nombre_local(self, exercise_id: int) -> str | None:
        resultados = self.local.get_todo(f'/api/v2/exercise-translation/?exercise={exercise_id}')
        es = next((t for t in resultados if t['language'] == 4), None)
        en = next((t for t in resultados if t['language'] == 2), None)
        elegido = es or en or (resultados[0] if resultados else None)
        return elegido['name'] if elegido else None

    def _indice(self) -> dict[str, int]:
        if self._indice_remoto is None:
            print('  [remoto] descargando nombres de ejercicios para poder casarlos por nombre...')
            traducciones = self.remoto.get_todo('/api/v2/exercise-translation/?limit=999', 30)
            indice: dict[str, int] = {}
            for t in traducciones:
                clave = normalizar(t['name'])
                # Si hay varias traducciones con el mismo nombre normalizado,
                # se queda la primera: es un caso raro (sinonimos exactos) y
                # cualquiera de las dos es una coincidencia razonable.
                indice.setdefault(clave, t['exercise'])
            self._indice_remoto = indice
            print(f'  [remoto] {len(indice)} nombres de ejercicio indexados')
        return self._indice_remoto

    def resolver(self, exercise_id: int) -> int | None:
        if exercise_id in self._cache:
            return self._cache[exercise_id]
        nombre = self._nombre_local(exercise_id)
        resultado: int | None = None
        if nombre:
            resultado = self._indice().get(normalizar(nombre))
        if resultado is None:
            self.informe.fallo(
                f'ejercicio local #{exercise_id} ("{nombre}") no tiene equivalente exacto '
                'en el remoto -- se omite lo que dependa de el'
            )
        self._cache[exercise_id] = resultado
        return resultado


class ResolverIngredientes:
    """
    Igual que ResolverEjercicios pero para Ingredient. A diferencia de los
    ejercicios, los alimentos SI se crean en el remoto si no existen: wger
    trata los alimentos como algo que cualquiera puede anadir (el buscador de
    la app ya deja crear uno "sobre la marcha"), y el usuario ha pedido
    explicitamente traerse solo los alimentos que usa, no el catalogo entero.
    """

    def __init__(self, local: Sesion, remoto: Sesion, informe: Informe, dry_run: bool):
        self.local = local
        self.remoto = remoto
        self.informe = informe
        self.dry_run = dry_run
        self._cache: dict[int, int | None] = {}

    def _buscar_remoto_por_nombre(self, nombre: str) -> int | None:
        # limit=50 + hasta 10 paginas: de sobra para una busqueda de un
        # alimento normal, sin arrastrarse una tabla de 177k filas de golpe.
        resultados = self.remoto.get_todo(f'/api/v2/ingredient/?name__search={url_quote(nombre)}&limit=50', 10)
        objetivo = normalizar(nombre)
        for ing in resultados:
            if normalizar(ing['name']) == objetivo:
                return ing['id']
        return None

    def _buscar_remoto_por_codigo(self, codigo: str) -> int | None:
        resultados = self.remoto.get_todo(f'/api/v2/ingredient/?code={url_quote(codigo)}')
        return resultados[0]['id'] if resultados else None

    def resolver(self, ingredient_id: int) -> int | None:
        if ingredient_id in self._cache:
            return self._cache[ingredient_id]

        local_ing = _intentar(
            self.informe,
            f'leer alimento local #{ingredient_id}',
            lambda: self.local.get(f'/api/v2/ingredient/{ingredient_id}/'),
        )
        if local_ing is None:
            self._cache[ingredient_id] = None
            return None

        remoto_id: int | None = None
        if local_ing.get('code'):
            remoto_id = self._buscar_remoto_por_codigo(local_ing['code'])
        if remoto_id is None:
            remoto_id = self._buscar_remoto_por_nombre(local_ing['name'])

        if remoto_id is None:
            if self.dry_run:
                print(f'    (dry-run) se crearia el alimento "{local_ing["name"]}" en el remoto')
                self.informe.creado('alimentos nuevos (dry-run)')
            else:
                creado = _intentar(
                    self.informe,
                    f'crear alimento "{local_ing["name"]}" en el remoto',
                    lambda: self.remoto.post(
                        '/api/v2/ingredient/',
                        {
                            'name': local_ing['name'],
                            'code': local_ing.get('code'),
                            'common_name': local_ing.get('common_name') or '',
                            'brand': local_ing.get('brand') or '',
                            'energy': local_ing['energy'],
                            'protein': local_ing['protein'],
                            'carbohydrates': local_ing['carbohydrates'],
                            'carbohydrates_sugar': local_ing.get('carbohydrates_sugar'),
                            'fat': local_ing['fat'],
                            'fat_saturated': local_ing.get('fat_saturated'),
                            'fiber': local_ing.get('fiber'),
                            'sodium': local_ing.get('sodium'),
                        },
                    ),
                )
                if creado is not None:
                    remoto_id = creado['id']
                    self.informe.creado('alimentos nuevos')

        self._cache[ingredient_id] = remoto_id
        return remoto_id


# ------------------------------------------------------------------- perfil


def migrar_perfil(local: Sesion, remoto: Sesion, informe: Informe, dry_run: bool) -> None:
    print('\n== Perfil (edad, altura, objetivos diarios...) ==')
    perfil = _intentar(informe, 'leer perfil local', lambda: local.get('/api/v2/userprofile/'))
    if perfil is None:
        return

    # notification_language es el id de un Language: 2 = ingles en las dos
    # instalaciones (fixture fija de wger, ver deploy/arrancar.sh), asi que
    # no hace falta resolverlo por nombre.
    campos = [
        'age', 'birthdate', 'height', 'gender',
        'sleep_hours', 'work_hours', 'work_intensity',
        'sport_hours', 'sport_intensity',
        'freetime_hours', 'freetime_intensity',
        'calories', 'weight_unit', 'num_days_weight_reminder',
        'weight_rounding', 'repetitions_rounding',
        'workout_reminder_active', 'workout_reminder', 'workout_duration',
        'notification_language',
    ]
    cuerpo = {c: perfil.get(c) for c in campos if c in perfil}

    if dry_run:
        print(f'  (dry-run) se actualizaria el perfil remoto con: {cuerpo}')
        informe.creado('perfil actualizado (dry-run)')
        return

    _intentar(informe, 'actualizar perfil remoto', lambda: remoto.patch('/api/v2/userprofile/', cuerpo))
    informe.creado('perfil actualizado')


# --------------------------------------------------------------------- peso


def migrar_peso(local: Sesion, remoto: Sesion, informe: Informe, dry_run: bool) -> None:
    print('\n== Peso (historial de pesajes) ==')
    entradas = _intentar(informe, 'leer historial de peso local', lambda: local.get_todo('/api/v2/weightentry/'))
    if not entradas:
        print('  nada que migrar')
        return

    existentes = _intentar(informe, 'leer historial de peso remoto', lambda: remoto.get_todo('/api/v2/weightentry/'))
    fechas_existentes = {e['date'] for e in (existentes or [])}

    for entrada in entradas:
        if entrada['date'] in fechas_existentes:
            informe.omitido('pesajes (ya existia esa fecha)')
            continue
        if dry_run:
            print(f'    (dry-run) se crearia el pesaje {entrada["date"]}: {entrada["weight"]}')
            informe.creado('pesajes (dry-run)')
            continue
        creado = _intentar(
            informe,
            f'crear pesaje {entrada["date"]}',
            lambda e=entrada: remoto.post('/api/v2/weightentry/', {'date': e['date'], 'weight': e['weight']}),
        )
        if creado is not None:
            informe.creado('pesajes')

    # El objetivo de peso (salaz/weight-goal) es upsert: no hay riesgo de
    # duplicar aunque se repita la migracion. El endpoint es un ViewSet
    # normal (paginado): "uno por usuario" es una regla del create(), no una
    # forma de respuesta especial en el GET de lista.
    objetivos = _intentar(informe, 'leer objetivo de peso local', lambda: local.get_todo('/api/v2/salaz/weight-goal/'))
    objetivo = objetivos[0] if objetivos else None
    if objetivo and objetivo.get('goal_type'):
        if dry_run:
            print(f'    (dry-run) se pondria el objetivo de peso: {objetivo}')
            informe.creado('objetivo de peso (dry-run)')
        else:
            _intentar(
                informe,
                'poner objetivo de peso remoto',
                lambda: remoto.post(
                    '/api/v2/salaz/weight-goal/',
                    {
                        'goal_type': objetivo['goal_type'],
                        'target_weight': objetivo.get('target_weight'),
                        'target_date': objetivo.get('target_date'),
                    },
                ),
            )
            informe.creado('objetivo de peso')


# ------------------------------------------------------------------- entreno


def migrar_entreno(
    local: Sesion,
    remoto: Sesion,
    informe: Informe,
    resolver_ej: ResolverEjercicios,
    dry_run: bool,
) -> tuple[dict[int, int], dict[int, int]]:
    """
    Recrea cada rutina (dias, slots, entries y sus configs) por POST, en el
    mismo orden que usa el propio frontend al duplicar una rutina (ver
    recrearRutinaDesdeEstructura en web/src/features/entreno/api.ts) -- wger
    no tiene un endpoint de "clonar", asi que es leer con GET .../structure/
    y volver a construir todo con POST.

    Devuelve (mapa_rutinas, mapa_dias): id local -> id remoto, para que
    migrar_reprogramaciones pueda traducir las referencias de
    WorkoutReschedule/WorkoutDaySkip.
    """
    print('\n== Entreno (rutinas, dias y ejercicios) ==')
    rutinas = _intentar(informe, 'leer rutinas locales', lambda: local.get_todo('/api/v2/routine/'))
    if not rutinas:
        print('  no hay rutinas que migrar')
        return {}, {}

    rutinas_remotas_existentes = _intentar(
        informe, 'leer rutinas remotas', lambda: remoto.get_todo('/api/v2/routine/')
    ) or []
    firmas_existentes = {(r['name'], r['start'], r['end']) for r in rutinas_remotas_existentes}

    mapa_rutinas: dict[int, int] = {}
    mapa_dias: dict[int, int] = {}

    for rutina in rutinas:
        firma = (rutina['name'], rutina['start'], rutina['end'])
        if firma in firmas_existentes:
            print(f'  rutina "{rutina["name"]}" ya existe en el remoto (mismo nombre y fechas), se omite')
            informe.omitido('rutinas (ya existian)')
            continue

        estructura = _intentar(
            informe,
            f'leer estructura de la rutina "{rutina["name"]}"',
            lambda r=rutina: local.get(f'/api/v2/routine/{r["id"]}/structure/'),
        )
        if estructura is None:
            continue

        if dry_run:
            n_dias = len(estructura.get('days', []))
            n_entries = sum(len(s['entries']) for d in estructura['days'] for s in d['slots'])
            print(f'    (dry-run) se crearia la rutina "{rutina["name"]}" con {n_dias} dias y {n_entries} ejercicios')
            informe.creado('rutinas (dry-run)')
            continue

        print(f'  recreando rutina "{rutina["name"]}"...')
        nueva_rutina = _intentar(
            informe,
            f'crear rutina "{rutina["name"]}"',
            lambda r=rutina: remoto.post(
                '/api/v2/routine/',
                {
                    'name': r['name'],
                    'description': r.get('description', ''),
                    'start': r['start'],
                    'end': r['end'],
                    'fit_in_week': r.get('fit_in_week', False),
                    'is_template': False,
                },
            ),
        )
        if nueva_rutina is None:
            continue
        mapa_rutinas[rutina['id']] = nueva_rutina['id']
        informe.creado('rutinas')

        for dia in sorted(estructura.get('days', []), key=lambda d: d['order']):
            nuevo_dia = _intentar(
                informe,
                f'crear dia "{dia["name"]}" de "{rutina["name"]}"',
                lambda d=dia, nr=nueva_rutina: remoto.post(
                    '/api/v2/day/',
                    {
                        'routine': nr['id'],
                        'name': d['name'],
                        'description': d.get('description', ''),
                        'type': d.get('type', 'custom'),
                        'is_rest': d['is_rest'],
                        'need_logs_to_advance': d.get('need_logs_to_advance', False),
                        'order': d['order'],
                    },
                ),
            )
            if nuevo_dia is None:
                continue
            mapa_dias[dia['id']] = nuevo_dia['id']
            informe.creado('dias')

            for slot in sorted(dia.get('slots', []), key=lambda s: s['order']):
                nuevo_slot = _intentar(
                    informe,
                    f'crear bloque de ejercicios del dia "{dia["name"]}"',
                    lambda s=slot, nd=nuevo_dia: remoto.post(
                        '/api/v2/slot/', {'day': nd['id'], 'order': s['order'], 'comment': s.get('comment', '')}
                    ),
                )
                if nuevo_slot is None:
                    continue

                for entry in sorted(slot.get('entries', []), key=lambda e: e['order']):
                    ejercicio_remoto = resolver_ej.resolver(entry['exercise'])
                    if ejercicio_remoto is None:
                        continue  # ya se registro el fallo en el resolver
                    nueva_entry = _intentar(
                        informe,
                        f'anadir ejercicio al dia "{dia["name"]}"',
                        lambda e=entry, ns=nuevo_slot, ex=ejercicio_remoto: remoto.post(
                            '/api/v2/slot-entry/',
                            {
                                'slot': ns['id'],
                                'exercise': ex,
                                'order': e['order'],
                                'type': e.get('type', 'normal'),
                                'comment': e.get('comment', ''),
                            },
                        ),
                    )
                    if nueva_entry is None:
                        continue
                    informe.creado('ejercicios en rutinas')

                    for clave, endpoint in (
                        ('set_nr_configs', '/api/v2/sets-config/'),
                        ('repetitions_configs', '/api/v2/repetitions-config/'),
                        ('weight_configs', '/api/v2/weight-config/'),
                        ('rest_configs', '/api/v2/rest-config/'),
                        ('rir_configs', '/api/v2/rir-config/'),
                    ):
                        for cfg in entry.get(clave, []):
                            _intentar(
                                informe,
                                f'copiar {clave} de un ejercicio',
                                lambda c=cfg, ne=nueva_entry, ep=endpoint: remoto.post(
                                    ep, {'slot_entry': ne['id'], 'iteration': c['iteration'], 'value': c['value']}
                                ),
                            )

    # ---- Historial real: sesiones y series ya hechas ----
    print('  copiando el historial de sesiones y series realizadas...')
    sesiones = _intentar(informe, 'leer sesiones locales', lambda: local.get_todo('/api/v2/workoutsession/')) or []
    sesiones_remotas_existentes = _intentar(
        informe, 'leer sesiones remotas', lambda: remoto.get_todo('/api/v2/workoutsession/')
    ) or []
    fechas_sesion_existentes = {s['date'] for s in sesiones_remotas_existentes}

    mapa_sesiones: dict[str, str] = {}
    for sesion in sesiones:
        if sesion['date'] in fechas_sesion_existentes:
            informe.omitido('sesiones de entreno (ya existia esa fecha)')
            continue
        rutina_remota = mapa_rutinas.get(sesion['routine']) if sesion.get('routine') else None
        dia_remoto = mapa_dias.get(sesion['day']) if sesion.get('day') else None
        if dry_run:
            informe.creado('sesiones de entreno (dry-run)')
            continue
        nueva_sesion = _intentar(
            informe,
            f'crear sesion del {sesion["date"]}',
            lambda s=sesion, rr=rutina_remota, dr=dia_remoto: remoto.post(
                '/api/v2/workoutsession/',
                {
                    'routine': rr,
                    'day': dr,
                    'date': s['date'],
                    'notes': s.get('notes') or '',
                    'impression': s.get('impression'),
                    'time_start': s.get('time_start'),
                    'time_end': s.get('time_end'),
                },
            ),
        )
        if nueva_sesion is not None:
            mapa_sesiones[sesion['id']] = nueva_sesion['id']
            informe.creado('sesiones de entreno')

    logs = _intentar(informe, 'leer series locales', lambda: local.get_todo('/api/v2/workoutlog/')) or []
    for log in logs:
        sesion_remota = mapa_sesiones.get(log['session']) if log.get('session') else None
        if log.get('session') and sesion_remota is None:
            # La sesion de esta serie no se migro (fecha ya existente en el
            # remoto, o fallo al crearla): no hay donde colgar la serie.
            informe.omitido('series (su sesion no se migro)')
            continue
        ejercicio_remoto = resolver_ej.resolver(log['exercise'])
        if ejercicio_remoto is None:
            continue
        rutina_remota = mapa_rutinas.get(log['routine']) if log.get('routine') else None
        if dry_run:
            informe.creado('series de entreno (dry-run)')
            continue
        creado = _intentar(
            informe,
            f'crear serie del {log["date"]}',
            lambda l=log, sr=sesion_remota, rr=rutina_remota, ex=ejercicio_remoto: remoto.post(
                '/api/v2/workoutlog/',
                {
                    'date': l['date'],
                    'session': sr,
                    'routine': rr,
                    # slot_entry NO se traduce: es un detalle de que fila
                    # exacta de la rutina se marco, y no afecta a lo que se
                    # ve (exercise, weight, reps, rir). Se manda vacio antes
                    # que apuntar, por error, a la entry de otra rutina.
                    'slot_entry': None,
                    'exercise': ex,
                    'repetitions': l.get('repetitions'),
                    'weight': l.get('weight'),
                    'rir': l.get('rir'),
                    'rest': l.get('rest'),
                },
            ),
        )
        if creado is not None:
            informe.creado('series de entreno')

    return mapa_rutinas, mapa_dias


def migrar_reprogramaciones(
    local: Sesion,
    remoto: Sesion,
    informe: Informe,
    mapa_rutinas: dict[int, int],
    mapa_dias: dict[int, int],
    dry_run: bool,
) -> None:
    print('\n== Dias movidos / saltados (calendario de Entreno) ==')
    reprogramaciones = _intentar(
        informe, 'leer reprogramaciones locales', lambda: local.get_todo('/api/v2/salaz/workout-reschedule/')
    ) or []
    for r in reprogramaciones:
        cuerpo = {
            'origin_date': r['origin_date'],
            'target_date': r['target_date'],
            'origin_routine': mapa_rutinas.get(r['origin_routine']) if r.get('origin_routine') else None,
            'origin_day': mapa_dias.get(r['origin_day']) if r.get('origin_day') else None,
            'target_routine': mapa_rutinas.get(r['target_routine']) if r.get('target_routine') else None,
            'target_day': mapa_dias.get(r['target_day']) if r.get('target_day') else None,
        }
        if dry_run:
            informe.creado('dias movidos (dry-run)')
            continue
        creado = _intentar(informe, 'crear un dia movido', lambda c=cuerpo: remoto.post('/api/v2/salaz/workout-reschedule/', c))
        if creado is not None:
            informe.creado('dias movidos')

    saltados = _intentar(
        informe, 'leer dias saltados locales', lambda: local.get_todo('/api/v2/salaz/workout-day-skip/')
    ) or []
    for s in saltados:
        if dry_run:
            informe.creado('dias saltados (dry-run)')
            continue
        creado = _intentar(
            informe, 'crear un dia saltado', lambda fecha=s['date']: remoto.post('/api/v2/salaz/workout-day-skip/', {'date': fecha})
        )
        if creado is not None:
            informe.creado('dias saltados')


# ----------------------------------------------------------------- nutricion


def migrar_nutricion(
    local: Sesion,
    remoto: Sesion,
    informe: Informe,
    resolver_ing: ResolverIngredientes,
    dry_run: bool,
) -> None:
    print('\n== Nutricion (planes, comidas y diario) ==')
    planes = _intentar(informe, 'leer planes locales', lambda: local.get_todo('/api/v2/nutritionplan/')) or []
    if not planes:
        print('  no hay planes de nutricion que migrar')
        return

    planes_remotos_existentes = _intentar(
        informe, 'leer planes remotos', lambda: remoto.get_todo('/api/v2/nutritionplan/')
    ) or []
    descripciones_existentes = {p['description'] for p in planes_remotos_existentes}

    for plan in planes:
        if plan['description'] in descripciones_existentes:
            print(f'  plan "{plan["description"]}" ya existe en el remoto (misma descripcion), se omite')
            informe.omitido('planes de nutricion (ya existian)')
            continue

        info = _intentar(
            informe,
            f'leer el plan "{plan["description"]}" con sus comidas',
            lambda p=plan: local.get(f'/api/v2/nutritionplaninfo/{p["id"]}/'),
        )
        if info is None:
            continue

        if dry_run:
            n_comidas = len(info.get('meals', []))
            n_items = sum(len(m['meal_items']) for m in info.get('meals', []))
            print(f'    (dry-run) se crearia el plan "{plan["description"]}" con {n_comidas} comidas y {n_items} alimentos')
            informe.creado('planes de nutricion (dry-run)')
            continue

        print(f'  recreando plan "{plan["description"]}"...')
        nuevo_plan = _intentar(
            informe,
            f'crear plan "{plan["description"]}"',
            lambda p=plan: remoto.post(
                '/api/v2/nutritionplan/',
                {
                    'description': p['description'],
                    'only_logging': p['only_logging'],
                    'goal_energy': p.get('goal_energy'),
                    'goal_protein': p.get('goal_protein'),
                    'goal_carbohydrates': p.get('goal_carbohydrates'),
                    'goal_fat': p.get('goal_fat'),
                    'goal_fiber': p.get('goal_fiber'),
                },
            ),
        )
        if nuevo_plan is None:
            continue
        informe.creado('planes de nutricion')

        mapa_comidas: dict[str, str] = {}
        for comida in info.get('meals', []):
            nueva_comida = _intentar(
                informe,
                f'crear comida "{comida["name"]}"',
                lambda c=comida, np=nuevo_plan: remoto.post(
                    '/api/v2/meal/', {'plan': np['id'], 'name': c['name'], 'time': c.get('time')}
                ),
            )
            if nueva_comida is None:
                continue
            mapa_comidas[comida['id']] = nueva_comida['id']
            informe.creado('comidas')

            for item in comida.get('meal_items', []):
                ingrediente_remoto = resolver_ing.resolver(item['ingredient'])
                if ingrediente_remoto is None:
                    continue
                creado = _intentar(
                    informe,
                    'anadir alimento a una comida',
                    lambda it=item, nc=nueva_comida, ing=ingrediente_remoto: remoto.post(
                        '/api/v2/mealitem/',
                        {
                            'meal': nc['id'],
                            'ingredient': ing,
                            'weight_unit': it.get('weight_unit'),
                            'amount': it['amount'],
                        },
                    ),
                )
                if creado is not None:
                    informe.creado('alimentos en comidas')

        # Diario: lo que se ha anotado realmente comido, dia a dia.
        diario = _intentar(
            informe,
            f'leer el diario del plan "{plan["description"]}"',
            lambda p=plan: local.get_todo(f'/api/v2/nutritiondiary/?plan={p["id"]}'),
        )
        for entrada in diario or []:
            ingrediente_remoto = resolver_ing.resolver(entrada['ingredient'])
            if ingrediente_remoto is None:
                continue
            comida_remota = mapa_comidas.get(entrada['meal']) if entrada.get('meal') else None
            creado = _intentar(
                informe,
                'crear entrada del diario',
                lambda e=entrada, np=nuevo_plan, mr=comida_remota, ing=ingrediente_remoto: remoto.post(
                    '/api/v2/nutritiondiary/',
                    {
                        'plan': np['id'],
                        'meal': mr,
                        'ingredient': ing,
                        'weight_unit': e.get('weight_unit'),
                        'amount': e['amount'],
                        'datetime': e['datetime'],
                    },
                ),
            )
            if creado is not None:
                informe.creado('entradas del diario')

    # Favoritos y recientes (upsert, sin riesgo de duplicar).
    for etiqueta, ruta in (
        ('favoritos', '/api/v2/salaz/favorite-ingredient/'),
        ('recientes', '/api/v2/salaz/recent-ingredient/'),
    ):
        filas = _intentar(informe, f'leer alimentos {etiqueta} locales', lambda r=ruta: local.get_todo(r)) or []
        for fila in filas:
            ingrediente_remoto = resolver_ing.resolver(fila['ingredient'])
            if ingrediente_remoto is None:
                continue
            if dry_run:
                informe.creado(f'alimentos {etiqueta} (dry-run)')
                continue
            creado = _intentar(
                informe, f'marcar alimento {etiqueta}', lambda r=ruta, ing=ingrediente_remoto: remoto.post(r, {'ingredient': ing})
            )
            if creado is not None:
                informe.creado(f'alimentos {etiqueta}')


# --------------------------------------------------------------------- compra


def resolver_household(
    local: Sesion, remoto: Sesion, informe: Informe, household_local_id: int | None, dry_run: bool
) -> tuple[int, int] | None:
    """
    Todo lo de Compra cuelga de un Household. Se usa el primero del que el
    usuario local es dueno (o el indicado con --household-local), y en el
    remoto se reutiliza uno con el mismo nombre si ya existe, o se crea.
    Devuelve (id_local, id_remoto), o None si no hay nada que migrar.
    """
    hogares_locales = _intentar(informe, 'leer hogares locales', lambda: local.get_todo('/api/v2/salaz/household/')) or []
    if not hogares_locales:
        print('  no hay ningun hogar local: se omite todo lo de Compra')
        return None

    if household_local_id is not None:
        hogar_local = next((h for h in hogares_locales if h['id'] == household_local_id), None)
        if hogar_local is None:
            informe.fallo(f'--household-local {household_local_id} no existe en local')
            return None
    else:
        propios = [h for h in hogares_locales if h.get('owner') == local.user_id]
        hogar_local = propios[0] if propios else hogares_locales[0]
        if len(hogares_locales) > 1:
            print(
                f'  hay {len(hogares_locales)} hogares locales, se usa "{hogar_local["name"]}" '
                '-- usa --household-local <id> para elegir otro'
            )

    hogares_remotos = _intentar(informe, 'leer hogares remotos', lambda: remoto.get_todo('/api/v2/salaz/household/')) or []
    existente = next((h for h in hogares_remotos if h['name'] == hogar_local['name']), None)
    if existente:
        print(f'  hogar "{hogar_local["name"]}" ya existe en el remoto, se reutiliza')
        return hogar_local['id'], existente['id']

    if dry_run:
        print(f'  (dry-run) se crearia el hogar "{hogar_local["name"]}" en el remoto')
        return hogar_local['id'], -1  # id ficticio solo para que el resto del dry-run pueda seguir

    nuevo = _intentar(
        informe, 'crear hogar remoto', lambda h=hogar_local: remoto.post('/api/v2/salaz/household/', {'name': h['name']})
    )
    return (hogar_local['id'], nuevo['id']) if nuevo else None


def migrar_compra(
    local: Sesion,
    remoto: Sesion,
    informe: Informe,
    resolver_ing: ResolverIngredientes,
    household_local_id: int | None,
    dry_run: bool,
) -> None:
    print('\n== Compra (despensa, recetas y tickets) ==')
    resuelto = resolver_household(local, remoto, informe, household_local_id, dry_run)
    if resuelto is None:
        return
    household_local_id, household_remoto = resuelto

    # ---- Despensa ----
    despensa = _intentar(
        informe, 'leer despensa local',
        lambda: local.get_todo(f'/api/v2/salaz/pantry-item/?household={household_local_id}'),
    ) or []
    for item in despensa:
        ingrediente_remoto = resolver_ing.resolver(item['ingredient']) if item.get('ingredient') else None
        if dry_run:
            informe.creado('alimentos en despensa (dry-run)')
            continue
        creado = _intentar(
            informe,
            f'crear en despensa "{item.get("name") or item.get("ingredient")}"',
            lambda it=item, ing=ingrediente_remoto: remoto.post(
                '/api/v2/salaz/pantry-item/',
                {
                    'household': household_remoto,
                    'ingredient': ing,
                    'name': it.get('name') or '',
                    'unit': it['unit'],
                    'amount': it['amount'],
                },
            ),
        )
        if creado is not None:
            informe.creado('alimentos en despensa')

    # ---- Recetas ----
    recetas = _intentar(
        informe, 'leer recetas locales', lambda: local.get_todo(f'/api/v2/salaz/recipe/?household={household_local_id}')
    ) or []
    for receta in recetas:
        if dry_run:
            informe.creado('recetas (dry-run)')
            continue
        nueva = _intentar(
            informe,
            f'crear receta "{receta["name"]}"',
            lambda r=receta: remoto.post(
                '/api/v2/salaz/recipe/',
                {
                    'household': household_remoto,
                    'name': r['name'],
                    'servings': r['servings'],
                    'instructions': r.get('instructions') or '',
                },
            ),
        )
        if nueva is None:
            continue
        informe.creado('recetas')

        ingredientes_receta = _intentar(
            informe, f'leer ingredientes de "{receta["name"]}"',
            lambda r=receta: local.get_todo(f'/api/v2/salaz/recipe-ingredient/?recipe={r["id"]}'),
        ) or []
        for ri in ingredientes_receta:
            ingrediente_remoto = resolver_ing.resolver(ri['ingredient'])
            if ingrediente_remoto is None:
                continue
            creado = _intentar(
                informe,
                'anadir ingrediente a una receta',
                lambda item=ri, nr=nueva, ing=ingrediente_remoto: remoto.post(
                    '/api/v2/salaz/recipe-ingredient/',
                    {'recipe': nr['id'], 'ingredient': ing, 'amount': item['amount']},
                ),
            )
            if creado is not None:
                informe.creado('ingredientes de receta')

    # ---- Compras ya hechas (historial de gasto), con sus lineas ----
    compras = _intentar(
        informe, 'leer compras locales', lambda: local.get_todo(f'/api/v2/salaz/purchase/?household={household_local_id}')
    ) or []
    for compra in compras:
        if dry_run:
            informe.creado('compras (dry-run)')
            continue
        nueva_compra = _intentar(
            informe,
            f'crear compra del {compra["date"]}',
            lambda c=compra: remoto.post(
                '/api/v2/salaz/purchase/',
                {
                    'household': household_remoto,
                    'date': c['date'],
                    'description': c.get('description') or '',
                    'supermarket': c.get('supermarket') or '',
                    'covers_days': c.get('covers_days'),
                },
            ),
        )
        if nueva_compra is None:
            continue
        informe.creado('compras')

        lineas = _intentar(
            informe, f'leer lineas de la compra del {compra["date"]}',
            lambda c=compra: local.get_todo(f'/api/v2/salaz/purchase-item/?purchase={c["id"]}'),
        ) or []
        for linea in lineas:
            ingrediente_remoto = resolver_ing.resolver(linea['ingredient']) if linea.get('ingredient') else None
            creado = _intentar(
                informe,
                'anadir linea a una compra',
                lambda l=linea, nc=nueva_compra, ing=ingrediente_remoto: remoto.post(
                    '/api/v2/salaz/purchase-item/',
                    {
                        'purchase': nc['id'],
                        'ingredient': ing,
                        'name': l.get('name') or '',
                        'amount': l['amount'],
                        'unit': l['unit'],
                        'price': l.get('price'),
                        'purchased': l.get('purchased', True),
                        'is_shared': l.get('is_shared', True),
                    },
                ),
            )
            if creado is not None:
                informe.creado('lineas de compra')

    # ---- Tickets ya confirmados: se copia el texto y se re-analiza/confirma
    # en el remoto en vez de copiar los campos calculados, para no arrastrar
    # ids de ingrediente que ya no valen en el otro lado. ----
    tickets = _intentar(
        informe, 'leer tickets locales', lambda: local.get_todo(f'/api/v2/salaz/receipt/?household={household_local_id}')
    ) or []
    for ticket in tickets:
        if not ticket.get('markdown'):
            informe.omitido('tickets (sin texto transcrito)')
            continue
        if dry_run:
            informe.creado('tickets (dry-run)')
            continue
        nuevo = _intentar(
            informe,
            'crear ticket',
            lambda t=ticket: remoto.post(
                '/api/v2/salaz/receipt/', {'household': household_remoto, 'markdown': t['markdown']}
            ),
        )
        if nuevo is None:
            continue
        analizado = _intentar(
            informe, 'analizar ticket', lambda n=nuevo: remoto.post(f'/api/v2/salaz/receipt/{n["id"]}/analizar/', {})
        )
        if analizado is None:
            continue
        if ticket.get('status') == 'confirmado':
            _intentar(
                informe, 'confirmar ticket', lambda n=nuevo: remoto.post(f'/api/v2/salaz/receipt/{n["id"]}/confirmar/', {})
            )
        informe.creado('tickets')


# ---------------------------------------------------------------------- main


DOMINIOS_DISPONIBLES = ['perfil', 'peso', 'entreno', 'nutricion', 'compra']


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--local', required=True, help='URL del backend local, p.ej. http://localhost:8000')
    parser.add_argument('--usuario-local', required=True)
    parser.add_argument('--clave-local', required=True)
    parser.add_argument('--remoto', required=True, help='URL del backend remoto (el tunel)')
    parser.add_argument('--usuario-remoto', default='salaz1')
    parser.add_argument('--clave-remota', required=True)
    parser.add_argument(
        '--dominios',
        default=','.join(DOMINIOS_DISPONIBLES),
        help=f'lista separada por comas, de entre: {", ".join(DOMINIOS_DISPONIBLES)}',
    )
    parser.add_argument('--household-local', type=int, default=None, help='id del hogar local a usar (si tienes mas de uno)')
    parser.add_argument(
        '--dry-run', action='store_true',
        help='lee todo y dice lo que haria, sin escribir nada en el remoto (recomendado la primera vez)',
    )
    args = parser.parse_args()

    dominios = [d.strip() for d in args.dominios.split(',') if d.strip()]
    desconocidos = set(dominios) - set(DOMINIOS_DISPONIBLES)
    if desconocidos:
        print(f'Dominio(s) desconocido(s): {", ".join(desconocidos)}. Validos: {", ".join(DOMINIOS_DISPONIBLES)}')
        return 1

    print('Iniciando sesion...')
    local = Sesion(args.local, 'local')
    remoto = Sesion(args.remoto, 'remoto')
    try:
        local.login(args.usuario_local, args.clave_local)
        remoto.login(args.usuario_remoto, args.clave_remota)
    except ErrorApi as e:
        print(f'No se ha podido iniciar sesion: {e}')
        return 1

    if args.dry_run:
        print('\n*** DRY RUN: no se escribe nada en el remoto, solo se informa ***')

    informe = Informe()
    resolver_ej = ResolverEjercicios(local, remoto, informe)
    resolver_ing = ResolverIngredientes(local, remoto, informe, args.dry_run)

    if 'perfil' in dominios:
        migrar_perfil(local, remoto, informe, args.dry_run)
    if 'peso' in dominios:
        migrar_peso(local, remoto, informe, args.dry_run)
    mapa_rutinas: dict[int, int] = {}
    mapa_dias: dict[int, int] = {}
    if 'entreno' in dominios:
        mapa_rutinas, mapa_dias = migrar_entreno(local, remoto, informe, resolver_ej, args.dry_run)
        migrar_reprogramaciones(local, remoto, informe, mapa_rutinas, mapa_dias, args.dry_run)
    if 'nutricion' in dominios:
        migrar_nutricion(local, remoto, informe, resolver_ing, args.dry_run)
    if 'compra' in dominios:
        migrar_compra(local, remoto, informe, resolver_ing, args.household_local, args.dry_run)

    print('\n========================= RESUMEN =========================')
    print(informe.resumen())
    if informe.fallos:
        print('\nAlgunas filas no se han podido migrar (detalle mas arriba). El resto si se ha aplicado.')
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
