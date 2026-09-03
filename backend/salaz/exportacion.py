"""
Exportar/importar el contenido de una cuenta entera (entreno, nutricion,
compra, peso y perfil) como un unico JSON, para poder llevarlo de una
instalacion a otra (por ejemplo, del wger local al servidor del tunel) sin
tener que rellenarlo todo a mano otra vez.

Mismo problema que scripts/migrar_a_remoto.py y misma solucion: dos
instalaciones independientes pueden tener numeraciones de ejercicio o de
alimento distintas para la misma cosa, asi que copiar los ids tal cual
dejaria rutinas y comidas apuntando a lo que no toca, en silencio. Aqui la
exportacion incluye el NOMBRE de cada ejercicio y el alimento completo (no
solo su id), y la importacion resuelve cada uno contra el catalogo de la
instalacion donde se importa antes de escribir nada que dependa de el.

Por que via los mismos ViewSets/serializers de wger (llamados directamente,
ver ClienteInterno mas abajo) y no leyendo/escribiendo los modelos
directamente: reutiliza toda la logica ya probada y en produccion (las
mismas rutas que usa el frontend, ver web/src/features/entreno/api.ts,
nutricion/api.ts y docs/API-CONTRACT.md), en vez de reconstruir a mano la
logica de creacion y arriesgarse a que un campo obligatorio o un efecto
colateral del ViewSet real (por ejemplo, quien crea un Household queda como
su owner automaticamente) se quede sin replicar.

Por que ClienteInterno (django.urls.resolve + APIRequestFactory) y no
rest_framework.test.APIClient: las dos hacen lo mismo en lo esencial (llaman
a la vista con force_authenticate), pero APIClient ejecuta la peticion a
traves de TODA la cadena de middleware de Django -- exactamente donde viven
las diferencias entre el entorno local y el del tunel (ALLOWED_HOSTS,
SECURE_SSL_REDIRECT, y lo que se vaya anadiendo a salaz_settings_prod.py en
el futuro). Ya nos ha mordido dos veces: un ALLOWED_HOSTS que rechazaba el
Host de pruebas por defecto de APIClient, y despues un SECURE_SSL_REDIRECT
que respondia una redireccion 301 en vez de ejecutar la vista, porque este
cliente nunca pasa por nginx y nunca lleva las cabeceras que pone el proxy
de verdad. django.urls.resolve() + APIRequestFactory llama directamente al
callable de la vista (lo mismo que hace, por debajo, BaseHandler._get_response
tras resolver la URL), sin ejecutar NINGUN middleware -- asi que ninguna
diferencia de configuracion de seguridad entre local y produccion puede
volver a colarse por ahi. force_authenticate deja suplantar al usuario sin
pasar por login, igual que ya hace el resto de la suite de pruebas de este
proyecto (ver salaz/tests/test_api.py).
"""

from __future__ import annotations

from importlib import import_module
from typing import Any, Callable
from urllib.parse import urlparse

from django.conf import settings
from django.urls import Resolver404, resolve
from rest_framework.test import APIRequestFactory, force_authenticate

VERSION_EXPORTACION = 1


class ClienteInterno:
    """
    Llama directamente al ViewSet de una ruta de la API, sin pasar por el
    manejador WSGI ni por ningun middleware (ver el docstring del modulo
    para el porque). Expone solo get/post/patch: lo unico que usa este
    fichero de un APIClient normal.

    Saltarse el middleware tiene un precio: lo que el middleware pondria en
    la peticion (sesion, idioma activo...) no esta a menos que se ponga a
    mano. request.session ya se rellena aqui (ver __init__/_llamar) porque
    codigo de wger lo usa de verdad (RoutineViewSet, por la funcion de
    entrenador personal). Si aparece otro AttributeError de un atributo que
    normalmente pone el middleware, el arreglo es el mismo patron: ponerlo a
    mano aqui, no volver a APIClient.
    """

    def __init__(self, user, host: str):
        self.user = user
        self.factory = APIRequestFactory()
        # SessionMiddleware es quien normalmente pone request.session; al no
        # ejecutar middleware, sin esto ni siquiera existe el atributo.
        # request_user_or_trainer_q() de wger (usada por RoutineViewSet,
        # entre otras) lo lee (request.session.get('trainer.identity')) --
        # confirmado con un traceback real: 'Request' object has no
        # attribute 'session'. Una SessionStore vacia sin guardar es
        # exactamente lo que tendria un visitante anonimo sin cookie de
        # sesion, que es lo que es este cliente.
        self._motor_sesion = import_module(settings.SESSION_ENGINE).SessionStore
        self.cabeceras = {
            # HTTP_HOST, no SERVER_NAME: SERVER_NAME hace que Django
            # reconstruya el Host pegandole el puerto (get_host(), en
            # django/http/request.py), y si `host` ya trae uno (por ejemplo
            # "localhost:8000") queda duplicado ("localhost:8000:80") y
            # ALLOWED_HOSTS lo rechaza incluso estando en '*'. HTTP_HOST se
            # usa tal cual, igual que hace nginx con la cabecera Host real.
            'HTTP_HOST': host,
            # request.scheme la lee para construir URIs absolutas (los
            # enlaces next/previous de la paginacion, entre otras cosas):
            # sin esto saldrian en http aunque el tunel sea https. Ya no
            # hace falta para esquivar SecurityMiddleware (no se ejecuta),
            # pero si para que esas URLs sean coherentes.
            'HTTP_X_FORWARDED_PROTO': 'https',
            # Sin cabecera Accept, la negociacion de contenido de DRF puede
            # elegir el renderer navegable (HTML) en vez de JSON segun el
            # orden de DEFAULT_RENDERER_CLASSES -- ademas de mas pesado,
            # get_extra_action_url_map() de ese renderer revienta si
            # request.resolver_match es None (ver mas abajo).
            'HTTP_ACCEPT': 'application/json',
        }

    def _llamar(self, metodo: str, ruta: str, cuerpo=None, formato: str = 'json'):
        try:
            match = resolve(ruta.split('?')[0])
        except Resolver404:
            raise ValueError(f'{metodo.upper()} {ruta}: la ruta no existe') from None

        if metodo == 'get':
            peticion = self.factory.get(ruta, **self.cabeceras)
        else:
            peticion = getattr(self.factory, metodo)(ruta, cuerpo, format=formato, **self.cabeceras)

        # BaseHandler.resolve_request lo rellena en una peticion real antes
        # de llamar a la vista; sin el, algunos metodos de ViewSetMixin
        # (get_extra_action_url_map) revientan con AttributeError.
        peticion.resolver_match = match
        # Ver el comentario de _motor_sesion en __init__.
        peticion.session = self._motor_sesion()
        force_authenticate(peticion, user=self.user)

        respuesta = match.func(peticion, *match.args, **match.kwargs)
        if hasattr(respuesta, 'render'):
            respuesta.render()
        return respuesta

    def get(self, ruta: str):
        return self._llamar('get', ruta)

    def post(self, ruta: str, cuerpo, format: str = 'json'):
        return self._llamar('post', ruta, cuerpo, format)

    def patch(self, ruta: str, cuerpo, format: str = 'json'):
        return self._llamar('patch', ruta, cuerpo, format)


def _cliente_para(user, host: str) -> ClienteInterno:
    return ClienteInterno(user, host)


def _detalle(res) -> str:
    # Red de seguridad: res.data solo existe en un Response de DRF. Si
    # alguna vista devolviera algo que no lo es, esto evita que el propio
    # mensaje de error reviente con un AttributeError que tapa la causa real
    # (nos paso dos veces con el APIClient anterior).
    datos = getattr(res, 'data', None)
    return str(datos) if datos is not None else res.content[:300].decode('utf-8', 'replace')


def _get(cliente: ClienteInterno, ruta: str) -> Any:
    res = cliente.get(ruta)
    if res.status_code != 200:
        raise ValueError(f'GET {ruta} -> {res.status_code}: {_detalle(res)}')
    return res.data


def _get_todo(cliente: ClienteInterno, ruta: str, limite_paginas: int = 200) -> list[dict]:
    elementos: list[dict] = []
    siguiente: str | None = ruta
    for _ in range(limite_paginas):
        if siguiente is None:
            break
        if siguiente.startswith('http'):
            siguiente = urlparse(siguiente)._replace(scheme='', netloc='').geturl()
        datos = _get(cliente, siguiente)
        if isinstance(datos, dict):
            elementos.extend(datos.get('results', []))
            siguiente = datos.get('next')
        else:
            elementos.extend(datos)
            siguiente = None
    return elementos


def normalizar(texto: str) -> str:
    return ' '.join((texto or '').strip().lower().split())


# ---------------------------------------------------------------- exportar


def _nombre_ejercicio(cliente: ClienteInterno, exercise_id: int) -> str | None:
    resultados = _get_todo(cliente, f'/api/v2/exercise-translation/?exercise={exercise_id}')
    es = next((t for t in resultados if t['language'] == 4), None)
    en = next((t for t in resultados if t['language'] == 2), None)
    elegido = es or en or (resultados[0] if resultados else None)
    return elegido['name'] if elegido else None


def _exportar_entreno(cliente: ClienteInterno) -> dict:
    rutinas_export = []
    nombres_ejercicio: dict[int, str | None] = {}

    def nombre_de(exercise_id: int) -> str | None:
        if exercise_id not in nombres_ejercicio:
            nombres_ejercicio[exercise_id] = _nombre_ejercicio(cliente, exercise_id)
        return nombres_ejercicio[exercise_id]

    for rutina in _get_todo(cliente, '/api/v2/routine/'):
        estructura = _get(cliente, f'/api/v2/routine/{rutina["id"]}/structure/')
        dias = []
        for dia in estructura.get('days', []):
            slots = []
            for slot in dia.get('slots', []):
                entries = []
                for entry in slot.get('entries', []):
                    entries.append({
                        **entry,
                        'exercise_nombre': nombre_de(entry['exercise']),
                    })
                slots.append({**slot, 'entries': entries})
            dias.append({**dia, 'slots': slots})
        rutinas_export.append({**rutina, 'dias': dias})

    sesiones = _get_todo(cliente, '/api/v2/workoutsession/')
    logs = []
    for log in _get_todo(cliente, '/api/v2/workoutlog/'):
        logs.append({**log, 'exercise_nombre': nombre_de(log['exercise'])})

    return {
        'rutinas': rutinas_export,
        'sesiones': sesiones,
        'series': logs,
        'reprogramaciones': _get_todo(cliente, '/api/v2/salaz/workout-reschedule/'),
        'saltados': _get_todo(cliente, '/api/v2/salaz/workout-day-skip/'),
    }


def _ingrediente_completo(cliente: ClienteInterno, cache: dict[int, dict], ingredient_id: int | None) -> dict | None:
    if ingredient_id is None:
        return None
    if ingredient_id not in cache:
        cache[ingredient_id] = _get(cliente, f'/api/v2/ingredient/{ingredient_id}/')
    return cache[ingredient_id]


def _exportar_nutricion(cliente: ClienteInterno) -> dict:
    cache_ing: dict[int, dict] = {}
    planes_export = []
    diario_export = []

    for plan in _get_todo(cliente, '/api/v2/nutritionplan/'):
        info = _get(cliente, f'/api/v2/nutritionplaninfo/{plan["id"]}/')
        comidas = []
        for comida in info.get('meals', []):
            items = []
            for item in comida.get('meal_items', []):
                items.append({
                    **item,
                    'ingrediente': _ingrediente_completo(cliente, cache_ing, item['ingredient']),
                })
            comidas.append({**comida, 'meal_items': items})
        planes_export.append({**plan, 'comidas': comidas})

        for entrada in _get_todo(cliente, f'/api/v2/nutritiondiary/?plan={plan["id"]}'):
            diario_export.append({
                **entrada,
                'ingrediente': _ingrediente_completo(cliente, cache_ing, entrada['ingredient']),
            })

    favoritos = []
    for fila in _get_todo(cliente, '/api/v2/salaz/favorite-ingredient/'):
        favoritos.append({**fila, 'ingrediente': _ingrediente_completo(cliente, cache_ing, fila['ingredient'])})

    recientes = []
    for fila in _get_todo(cliente, '/api/v2/salaz/recent-ingredient/'):
        recientes.append({**fila, 'ingrediente': _ingrediente_completo(cliente, cache_ing, fila['ingredient'])})

    return {
        'planes': planes_export,
        'diario': diario_export,
        'favoritos': favoritos,
        'recientes': recientes,
    }


def _exportar_compra(cliente: ClienteInterno, user) -> dict | None:
    hogares = _get_todo(cliente, '/api/v2/salaz/household/')
    propios = [h for h in hogares if h.get('owner') == user.id]
    if not propios:
        return None
    hogar = propios[0]
    hid = hogar['id']
    cache_ing: dict[int, dict] = {}

    def con_ingrediente(fila: dict) -> dict:
        ing_id = fila.get('ingredient')
        return {**fila, 'ingrediente': _ingrediente_completo(cliente, cache_ing, ing_id) if ing_id else None}

    despensa = [con_ingrediente(f) for f in _get_todo(cliente, f'/api/v2/salaz/pantry-item/?household={hid}')]

    recetas_export = []
    for receta in _get_todo(cliente, f'/api/v2/salaz/recipe/?household={hid}'):
        ingredientes = [
            con_ingrediente(f)
            for f in _get_todo(cliente, f'/api/v2/salaz/recipe-ingredient/?recipe={receta["id"]}')
        ]
        recetas_export.append({**receta, 'ingredientes': ingredientes})

    compras_export = []
    for compra in _get_todo(cliente, f'/api/v2/salaz/purchase/?household={hid}'):
        lineas = [
            con_ingrediente(f)
            for f in _get_todo(cliente, f'/api/v2/salaz/purchase-item/?purchase={compra["id"]}')
        ]
        compras_export.append({**compra, 'lineas': lineas})

    tickets = list(_get_todo(cliente, f'/api/v2/salaz/receipt/?household={hid}'))

    return {
        'hogar_nombre': hogar['name'],
        'despensa': despensa,
        'recetas': recetas_export,
        'compras': compras_export,
        'tickets': tickets,
    }


def exportar_datos_usuario(user, host: str) -> dict:
    """
    Vuelca todo el contenido de `user`: entreno, nutricion, compra, peso y
    perfil. `host` es el de la peticion original (request.get_host() en la
    vista que llama) -- lo necesita el cliente interno, ver _cliente_para.
    """
    cliente = _cliente_para(user, host)

    peso_entradas = _get_todo(cliente, '/api/v2/weightentry/')
    objetivos_peso = _get_todo(cliente, '/api/v2/salaz/weight-goal/')

    return {
        'version': VERSION_EXPORTACION,
        'usuario': user.username,
        'perfil': _get(cliente, '/api/v2/userprofile/'),
        'peso': {
            'entradas': peso_entradas,
            'objetivo': objetivos_peso[0] if objetivos_peso else None,
        },
        'entreno': _exportar_entreno(cliente),
        'nutricion': _exportar_nutricion(cliente),
        'compra': _exportar_compra(cliente, user),
    }


# ---------------------------------------------------------------- importar


class Informe:
    def __init__(self):
        self.creados: dict[str, int] = {}
        self.omitidos: dict[str, int] = {}
        self.fallos: list[str] = []

    def creado(self, que: str, n: int = 1) -> None:
        self.creados[que] = self.creados.get(que, 0) + n

    def omitido(self, que: str, n: int = 1) -> None:
        self.omitidos[que] = self.omitidos.get(que, 0) + n

    def fallo(self, mensaje: str) -> None:
        self.fallos.append(mensaje)

    def as_dict(self) -> dict:
        return {'creados': self.creados, 'omitidos': self.omitidos, 'fallos': self.fallos}


def _intentar(informe: Informe, contexto: str, fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except Exception as e:  # noqa: BLE001 - una fila mal formada no debe tirar el resto abajo
        informe.fallo(f'{contexto}: {type(e).__name__}: {e}')
        return None


def _post(cliente: ClienteInterno, informe: Informe, contexto: str, ruta: str, cuerpo: dict) -> dict | None:
    def hacer():
        res = cliente.post(ruta, cuerpo, format='json')
        if res.status_code not in (200, 201):
            raise ValueError(f'POST {ruta} -> {res.status_code}: {_detalle(res)}')
        return res.data

    return _intentar(informe, contexto, hacer)


class ResolverEjercicios:
    """Empareja por nombre; nunca crea un ejercicio nuevo (catalogo de la comunidad)."""

    def __init__(self, cliente: ClienteInterno, informe: Informe):
        self.cliente = cliente
        self.informe = informe
        self._indice: dict[str, int] | None = None

    def _construir_indice(self) -> dict[str, int]:
        if self._indice is None:
            indice: dict[str, int] = {}
            for t in _get_todo(self.cliente, '/api/v2/exercise-translation/?limit=999', 30):
                indice.setdefault(normalizar(t['name']), t['exercise'])
            self._indice = indice
        return self._indice

    def resolver(self, nombre: str | None) -> int | None:
        if not nombre:
            return None
        resultado = self._construir_indice().get(normalizar(nombre))
        if resultado is None:
            self.informe.fallo(f'ejercicio "{nombre}" no tiene equivalente exacto aqui -- se omite lo que dependa de el')
        return resultado


class ResolverIngredientes:
    """Empareja por codigo de barras o nombre; crea el alimento si no existe (a peticion del usuario)."""

    def __init__(self, cliente: ClienteInterno, informe: Informe):
        self.cliente = cliente
        self.informe = informe
        self._cache: dict[str, int | None] = {}

    def resolver(self, ingrediente: dict | None) -> int | None:
        if ingrediente is None:
            return None
        clave = ingrediente.get('code') or normalizar(ingrediente['name'])
        if clave in self._cache:
            return self._cache[clave]

        resultado: int | None = None
        if ingrediente.get('code'):
            filas = _get_todo(self.cliente, f'/api/v2/ingredient/?code={ingrediente["code"]}')
            if filas:
                resultado = filas[0]['id']
        if resultado is None:
            objetivo = normalizar(ingrediente['name'])
            filas = _get_todo(self.cliente, f'/api/v2/ingredient/?name__search={ingrediente["name"]}&limit=50', 10)
            coincidencia = next((f for f in filas if normalizar(f['name']) == objetivo), None)
            resultado = coincidencia['id'] if coincidencia else None

        if resultado is None:
            creado = _post(
                self.cliente,
                self.informe,
                f'crear alimento "{ingrediente["name"]}"',
                '/api/v2/ingredient/',
                {
                    'name': ingrediente['name'],
                    'code': ingrediente.get('code'),
                    'common_name': ingrediente.get('common_name') or '',
                    'brand': ingrediente.get('brand') or '',
                    'energy': ingrediente['energy'],
                    'protein': ingrediente['protein'],
                    'carbohydrates': ingrediente['carbohydrates'],
                    'carbohydrates_sugar': ingrediente.get('carbohydrates_sugar'),
                    'fat': ingrediente['fat'],
                    'fat_saturated': ingrediente.get('fat_saturated'),
                    'fiber': ingrediente.get('fiber'),
                    'sodium': ingrediente.get('sodium'),
                    # Obligatorios en el modelo de wger, no expuestos en el
                    # tipo de la app (ver web/src/features/nutricion/api.ts):
                    # confirmado en salaz/tests/test_api.py:make_ingredient.
                    'language': 4,
                    'license_author': ingrediente.get('license_author') or 'SalazFitness',
                },
            )
            if creado is not None:
                resultado = creado['id']
                self.informe.creado('alimentos nuevos')

        self._cache[clave] = resultado
        return resultado


def _importar_perfil(cliente: ClienteInterno, informe: Informe, datos: dict) -> None:
    perfil = datos.get('perfil')
    if not perfil:
        return
    campos = [
        'age', 'birthdate', 'height', 'gender',
        'sleep_hours', 'work_hours', 'work_intensity',
        'sport_hours', 'sport_intensity', 'freetime_hours', 'freetime_intensity',
        'calories', 'weight_unit', 'num_days_weight_reminder',
        'weight_rounding', 'repetitions_rounding',
        'workout_reminder_active', 'workout_reminder', 'workout_duration',
    ]
    cuerpo = {c: perfil[c] for c in campos if c in perfil}

    def hacer():
        res = cliente.patch('/api/v2/userprofile/', cuerpo, format='json')
        if res.status_code != 200:
            raise ValueError(f'PATCH userprofile -> {res.status_code}: {_detalle(res)}')

    _intentar(informe, 'actualizar perfil', hacer)
    informe.creado('perfil actualizado')


def _importar_peso(cliente: ClienteInterno, informe: Informe, datos: dict) -> None:
    peso = datos.get('peso') or {}
    existentes = {e['date'] for e in _get_todo(cliente, '/api/v2/weightentry/')}
    for entrada in peso.get('entradas', []):
        if entrada['date'] in existentes:
            informe.omitido('pesajes (ya existia esa fecha)')
            continue
        if _post(cliente, informe, f'crear pesaje {entrada["date"]}', '/api/v2/weightentry/',
                 {'date': entrada['date'], 'weight': entrada['weight']}) is not None:
            informe.creado('pesajes')

    objetivo = peso.get('objetivo')
    if objetivo and objetivo.get('goal_type'):
        if _post(cliente, informe, 'poner objetivo de peso', '/api/v2/salaz/weight-goal/', {
            'goal_type': objetivo['goal_type'],
            'target_weight': objetivo.get('target_weight'),
            'target_date': objetivo.get('target_date'),
        }) is not None:
            informe.creado('objetivo de peso')


def _importar_entreno(cliente: ClienteInterno, informe: Informe, datos: dict, resolver_ej: ResolverEjercicios) -> tuple[dict, dict]:
    entreno = datos.get('entreno') or {}
    rutinas_existentes = {(r['name'], r['start'], r['end']) for r in _get_todo(cliente, '/api/v2/routine/')}
    mapa_rutinas: dict[int, int] = {}
    mapa_dias: dict[int, int] = {}

    for rutina in entreno.get('rutinas', []):
        firma = (rutina['name'], rutina['start'], rutina['end'])
        if firma in rutinas_existentes:
            informe.omitido('rutinas (ya existian)')
            continue

        nueva_rutina = _post(cliente, informe, f'crear rutina "{rutina["name"]}"', '/api/v2/routine/', {
            'name': rutina['name'],
            'description': rutina.get('description', ''),
            'start': rutina['start'],
            'end': rutina['end'],
            'fit_in_week': rutina.get('fit_in_week', False),
            'is_template': False,
        })
        if nueva_rutina is None:
            continue
        mapa_rutinas[rutina['id']] = nueva_rutina['id']
        informe.creado('rutinas')

        for dia in sorted(rutina.get('dias', []), key=lambda d: d['order']):
            nuevo_dia = _post(cliente, informe, f'crear dia "{dia["name"]}"', '/api/v2/day/', {
                'routine': nueva_rutina['id'],
                'name': dia['name'],
                'description': dia.get('description', ''),
                'type': dia.get('type', 'custom'),
                'is_rest': dia['is_rest'],
                'need_logs_to_advance': dia.get('need_logs_to_advance', False),
                'order': dia['order'],
            })
            if nuevo_dia is None:
                continue
            mapa_dias[dia['id']] = nuevo_dia['id']
            informe.creado('dias')

            for slot in sorted(dia.get('slots', []), key=lambda s: s['order']):
                nuevo_slot = _post(cliente, informe, 'crear bloque de ejercicios', '/api/v2/slot/', {
                    'day': nuevo_dia['id'], 'order': slot['order'], 'comment': slot.get('comment', ''),
                })
                if nuevo_slot is None:
                    continue

                for entry in sorted(slot.get('entries', []), key=lambda e: e['order']):
                    ejercicio_id = resolver_ej.resolver(entry.get('exercise_nombre'))
                    if ejercicio_id is None:
                        continue
                    nueva_entry = _post(cliente, informe, 'anadir ejercicio', '/api/v2/slot-entry/', {
                        'slot': nuevo_slot['id'],
                        'exercise': ejercicio_id,
                        'order': entry['order'],
                        'type': entry.get('type', 'normal'),
                        'comment': entry.get('comment', ''),
                    })
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
                            _post(cliente, informe, 'copiar configuracion de un ejercicio', endpoint, {
                                'slot_entry': nueva_entry['id'], 'iteration': cfg['iteration'], 'value': cfg['value'],
                            })

    fechas_sesion_existentes = {s['date'] for s in _get_todo(cliente, '/api/v2/workoutsession/')}
    mapa_sesiones: dict[str, str] = {}
    for sesion in entreno.get('sesiones', []):
        if sesion['date'] in fechas_sesion_existentes:
            informe.omitido('sesiones de entreno (ya existia esa fecha)')
            continue
        nueva = _post(cliente, informe, f'crear sesion del {sesion["date"]}', '/api/v2/workoutsession/', {
            'routine': mapa_rutinas.get(sesion['routine']) if sesion.get('routine') else None,
            'day': mapa_dias.get(sesion['day']) if sesion.get('day') else None,
            'date': sesion['date'],
            'notes': sesion.get('notes') or '',
            'impression': sesion.get('impression'),
            'time_start': sesion.get('time_start'),
            'time_end': sesion.get('time_end'),
        })
        if nueva is not None:
            mapa_sesiones[sesion['id']] = nueva['id']
            informe.creado('sesiones de entreno')

    for log in entreno.get('series', []):
        sesion_id = mapa_sesiones.get(log['session']) if log.get('session') else None
        if log.get('session') and sesion_id is None:
            informe.omitido('series (su sesion no se importo)')
            continue
        ejercicio_id = resolver_ej.resolver(log.get('exercise_nombre'))
        if ejercicio_id is None:
            continue
        if _post(cliente, informe, f'crear serie del {log["date"]}', '/api/v2/workoutlog/', {
            'date': log['date'],
            'session': sesion_id,
            'routine': mapa_rutinas.get(log['routine']) if log.get('routine') else None,
            'slot_entry': None,
            'exercise': ejercicio_id,
            'repetitions': log.get('repetitions'),
            'weight': log.get('weight'),
            'rir': log.get('rir'),
            'rest': log.get('rest'),
        }) is not None:
            informe.creado('series de entreno')

    for r in entreno.get('reprogramaciones', []):
        _post(cliente, informe, 'crear un dia movido', '/api/v2/salaz/workout-reschedule/', {
            'origin_date': r['origin_date'],
            'target_date': r['target_date'],
            'origin_routine': mapa_rutinas.get(r['origin_routine']) if r.get('origin_routine') else None,
            'origin_day': mapa_dias.get(r['origin_day']) if r.get('origin_day') else None,
            'target_routine': mapa_rutinas.get(r['target_routine']) if r.get('target_routine') else None,
            'target_day': mapa_dias.get(r['target_day']) if r.get('target_day') else None,
        })

    for s in entreno.get('saltados', []):
        _post(cliente, informe, 'crear un dia saltado', '/api/v2/salaz/workout-day-skip/', {'date': s['date']})

    return mapa_rutinas, mapa_dias


def _importar_nutricion(cliente: ClienteInterno, informe: Informe, datos: dict, resolver_ing: ResolverIngredientes) -> None:
    nutricion = datos.get('nutricion') or {}
    # Por descripcion, no por id: el id de un plan ya existente en este
    # servidor no tiene por que coincidir con el del export.
    planes_existentes = {p['description']: p['id'] for p in _get_todo(cliente, '/api/v2/nutritionplan/')}

    mapa_comidas: dict[str, str] = {}
    mapa_planes: dict[str, str] = {}
    for plan in nutricion.get('planes', []):
        if plan['description'] in planes_existentes:
            # No se recrean sus comidas (podria duplicarlas si ya las
            # tiene), pero SI se registra su id: si no, las entradas del
            # diario de ESTE plan se perderian por completo solo porque el
            # plan en si ya existia, que es peor que omitir el plan.
            mapa_planes[plan['id']] = planes_existentes[plan['description']]
            informe.omitido('planes de nutricion (ya existian)')
            continue

        nuevo_plan = _post(cliente, informe, f'crear plan "{plan["description"]}"', '/api/v2/nutritionplan/', {
            'description': plan['description'],
            'only_logging': plan['only_logging'],
            'goal_energy': plan.get('goal_energy'),
            'goal_protein': plan.get('goal_protein'),
            'goal_carbohydrates': plan.get('goal_carbohydrates'),
            'goal_fat': plan.get('goal_fat'),
            'goal_fiber': plan.get('goal_fiber'),
        })
        if nuevo_plan is None:
            continue
        mapa_planes[plan['id']] = nuevo_plan['id']
        informe.creado('planes de nutricion')

        for comida in plan.get('comidas', []):
            nueva_comida = _post(cliente, informe, f'crear comida "{comida["name"]}"', '/api/v2/meal/', {
                'plan': nuevo_plan['id'], 'name': comida['name'], 'time': comida.get('time'),
            })
            if nueva_comida is None:
                continue
            mapa_comidas[comida['id']] = nueva_comida['id']
            informe.creado('comidas')

            for item in comida.get('meal_items', []):
                ingrediente_id = resolver_ing.resolver(item.get('ingrediente'))
                if ingrediente_id is None:
                    continue
                if _post(cliente, informe, 'anadir alimento a una comida', '/api/v2/mealitem/', {
                    'meal': nueva_comida['id'], 'ingredient': ingrediente_id,
                    'weight_unit': item.get('weight_unit'), 'amount': item['amount'],
                }) is not None:
                    informe.creado('alimentos en comidas')

    for entrada in nutricion.get('diario', []):
        ingrediente_id = resolver_ing.resolver(entrada.get('ingrediente'))
        if ingrediente_id is None:
            continue
        comida_id = mapa_comidas.get(entrada['meal']) if entrada.get('meal') else None
        # El plan de la entrada es el ORIGINAL del export: si ese plan se
        # omitio por ya existir (mapa_planes no lo tiene), no hay plan nuevo
        # al que colgar el diario. Se omite en silencio (mismo criterio que
        # las sesiones sin rutina en _importar_entreno).
        plan_nuevo_id = mapa_planes.get(entrada['plan'])
        if plan_nuevo_id is None:
            informe.omitido('entradas del diario (su plan no se importo)')
            continue
        if _post(cliente, informe, 'crear entrada del diario', '/api/v2/nutritiondiary/', {
            'plan': plan_nuevo_id, 'meal': comida_id, 'ingredient': ingrediente_id,
            'weight_unit': entrada.get('weight_unit'), 'amount': entrada['amount'], 'datetime': entrada['datetime'],
        }) is not None:
            informe.creado('entradas del diario')

    for etiqueta, ruta in (('favoritos', '/api/v2/salaz/favorite-ingredient/'), ('recientes', '/api/v2/salaz/recent-ingredient/')):
        for fila in nutricion.get(etiqueta, []):
            ingrediente_id = resolver_ing.resolver(fila.get('ingrediente'))
            if ingrediente_id is None:
                continue
            if _post(cliente, informe, f'marcar alimento {etiqueta}', ruta, {'ingredient': ingrediente_id}) is not None:
                informe.creado(f'alimentos {etiqueta}')


def _resolver_household(cliente: ClienteInterno, informe: Informe, nombre_deseado: str) -> int | None:
    hogares = _get_todo(cliente, '/api/v2/salaz/household/')
    existente = next((h for h in hogares if h['name'] == nombre_deseado), None)
    if existente:
        return existente['id']
    creado = _post(cliente, informe, 'crear hogar', '/api/v2/salaz/household/', {'name': nombre_deseado})
    return creado['id'] if creado else None


def _importar_compra(cliente: ClienteInterno, informe: Informe, datos: dict, resolver_ing: ResolverIngredientes) -> None:
    compra = datos.get('compra')
    if not compra:
        return
    household_id = _resolver_household(cliente, informe, compra['hogar_nombre'])
    if household_id is None:
        return

    for item in compra.get('despensa', []):
        ingrediente_id = resolver_ing.resolver(item.get('ingrediente'))
        if _post(cliente, informe, 'anadir a la despensa', '/api/v2/salaz/pantry-item/', {
            'household': household_id, 'ingredient': ingrediente_id,
            'name': item.get('name') or '', 'unit': item['unit'], 'amount': item['amount'],
        }) is not None:
            informe.creado('alimentos en despensa')

    for receta in compra.get('recetas', []):
        nueva = _post(cliente, informe, f'crear receta "{receta["name"]}"', '/api/v2/salaz/recipe/', {
            'household': household_id, 'name': receta['name'],
            'servings': receta['servings'], 'instructions': receta.get('instructions') or '',
        })
        if nueva is None:
            continue
        informe.creado('recetas')
        for ri in receta.get('ingredientes', []):
            ingrediente_id = resolver_ing.resolver(ri.get('ingrediente'))
            if ingrediente_id is None:
                continue
            if _post(cliente, informe, 'anadir ingrediente a una receta', '/api/v2/salaz/recipe-ingredient/', {
                'recipe': nueva['id'], 'ingredient': ingrediente_id, 'amount': ri['amount'],
            }) is not None:
                informe.creado('ingredientes de receta')

    for compra_hecha in compra.get('compras', []):
        nueva = _post(cliente, informe, f'crear compra del {compra_hecha["date"]}', '/api/v2/salaz/purchase/', {
            'household': household_id, 'date': compra_hecha['date'],
            'description': compra_hecha.get('description') or '', 'supermarket': compra_hecha.get('supermarket') or '',
            'covers_days': compra_hecha.get('covers_days'),
        })
        if nueva is None:
            continue
        informe.creado('compras')
        for linea in compra_hecha.get('lineas', []):
            ingrediente_id = resolver_ing.resolver(linea.get('ingrediente'))
            if _post(cliente, informe, 'anadir linea a una compra', '/api/v2/salaz/purchase-item/', {
                'purchase': nueva['id'], 'ingredient': ingrediente_id, 'name': linea.get('name') or '',
                'amount': linea['amount'], 'unit': linea['unit'], 'price': linea.get('price'),
                'purchased': linea.get('purchased', True), 'is_shared': linea.get('is_shared', True),
            }) is not None:
                informe.creado('lineas de compra')

    for ticket in compra.get('tickets', []):
        if not ticket.get('markdown'):
            informe.omitido('tickets (sin texto transcrito)')
            continue
        nuevo = _post(cliente, informe, 'crear ticket', '/api/v2/salaz/receipt/', {
            'household': household_id, 'markdown': ticket['markdown'],
        })
        if nuevo is None:
            continue
        analizado = _post(cliente, informe, 'analizar ticket', f'/api/v2/salaz/receipt/{nuevo["id"]}/analizar/', {})
        if analizado is None:
            continue
        if ticket.get('status') == 'confirmado':
            _post(cliente, informe, 'confirmar ticket', f'/api/v2/salaz/receipt/{nuevo["id"]}/confirmar/', {})
        informe.creado('tickets')


def importar_datos_usuario(user, datos: dict, host: str) -> dict:
    """
    Recrea para `user` todo el contenido de un JSON generado por
    exportar_datos_usuario. `host` es el de la peticion original
    (request.get_host() en la vista que llama), ver _cliente_para.
    """
    cliente = _cliente_para(user, host)
    informe = Informe()

    if datos.get('version') != VERSION_EXPORTACION:
        informe.fallo(
            f'version del fichero ({datos.get("version")}) no coincide con la esperada '
            f'({VERSION_EXPORTACION}) -- puede que algo no encaje'
        )

    resolver_ej = ResolverEjercicios(cliente, informe)
    resolver_ing = ResolverIngredientes(cliente, informe)

    _importar_perfil(cliente, informe, datos)
    _importar_peso(cliente, informe, datos)
    _importar_entreno(cliente, informe, datos, resolver_ej)
    _importar_nutricion(cliente, informe, datos, resolver_ing)
    _importar_compra(cliente, informe, datos, resolver_ing)

    return informe.as_dict()
