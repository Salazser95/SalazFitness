"""
Signals que alimentan ChangeFeed: cada guardado o borrado de un modelo con
ambito de hogar deja una fila diciendo "en esta entidad, de este hogar, ha
pasado algo". Es lo que lee el endpoint SSE (ver eventos_sse en
salaz/api/views.py) para avisar a los clientes conectados de que toca
refrescar. Ver tambien la nota larga en salaz/models/change_feed.py sobre
por que esto es una tabla y no un pub/sub en memoria.

Se conectan desde SalazConfig.ready() (salaz/apps.py), que es el sitio que
recomienda Django para registrar signals: importar este modulo ahi tiene el
efecto de ejecutar conectar_signals() de mas abajo.
"""

import threading
from datetime import timedelta

from django.db.models.signals import post_delete, post_save, pre_delete
from django.utils import timezone

from salaz.models import (
    ChangeFeed,
    Household,
    HouseholdMember,
    IngredientPrice,
    PantryItem,
    Purchase,
    PurchaseItem,
    Receipt,
    Recipe,
    RecipeIngredient,
    ShoppingList,
    ShoppingListItem,
    WeeklyPlan,
)

# Nombre de entidad -> (modelo, funcion que saca el Household de una
# instancia de ese modelo). El frontend depende literalmente de estos
# nombres de entidad, no se pueden cambiar sin avisar al otro lado.
#
# Deliberadamente no incluye ChangeFeed: conectar esta misma tabla a sus
# propios signals crearia una fila por cada fila creada, sin fin.
MAPA_ENTIDADES = {
    'household': (Household, lambda i: i),
    'household-member': (HouseholdMember, lambda i: i.household),
    'purchase': (Purchase, lambda i: i.household),
    'purchase-item': (PurchaseItem, lambda i: i.purchase.household),
    'pantry-item': (PantryItem, lambda i: i.household),
    'shopping-list': (ShoppingList, lambda i: i.household),
    'shopping-list-item': (ShoppingListItem, lambda i: i.shopping_list.household),
    'recipe': (Recipe, lambda i: i.household),
    'recipe-ingredient': (RecipeIngredient, lambda i: i.recipe.household),
    'ingredient-price': (IngredientPrice, lambda i: i.household),
    'weekly-plan': (WeeklyPlan, lambda i: i.household),
    'receipt': (Receipt, lambda i: i.household),
}

# El mapa inverso, para que el receiver generico sepa que entidad es a
# partir del `sender` que le manda Django.
_ENTIDAD_POR_MODELO = {modelo: entidad for entidad, (modelo, _) in MAPA_ENTIDADES.items()}


#: Hogares que se estan borrando ahora mismo en este hilo. Ver
#: _antes_de_borrar_hogar para por que hace falta.
_estado = threading.local()


def _hogares_en_borrado() -> set:
    if not hasattr(_estado, 'hogares'):
        _estado.hogares = set()
    return _estado.hogares


def _antes_de_borrar_hogar(sender, instance, **kwargs) -> None:
    """
    Marca el hogar antes de que empiece su borrado, para que no se escriba
    ninguna fila de ChangeFeed apuntando a el.

    Sin esto, borrar un hogar rompe de verdad: el borrado en cascada dispara
    el post_delete de cada hijo (compras, despensa, listas...), cada uno
    escribe su fila de ChangeFeed con household=<el hogar que se esta
    borrando>, y esas filas NO las limpia la cascada -- Django ya habia
    calculado que borrar antes de que existieran. Al comprobar las claves
    ajenas al cerrar la transaccion, la base de datos encuentra filas
    apuntando a un hogar que ya no esta y aborta la operacion entera.

    El try/except de _registrar_cambio no salva de esto porque el INSERT si
    funciona: lo que falla es la comprobacion de integridad, mas tarde.

    Django manda TODOS los pre_delete antes de cualquier borrado y de
    cualquier post_delete, asi que cuando llegan los post_delete de los
    hijos la marca ya esta puesta.
    """
    _hogares_en_borrado().add(instance.pk)


def _tras_borrar_hogar(sender, instance, **kwargs) -> None:
    """Quita la marca: el hilo se reutiliza para las siguientes peticiones."""
    _hogares_en_borrado().discard(instance.pk)


def _registrar_cambio(entity: str, instance) -> None:
    """
    Escribe una fila de ChangeFeed para esta entidad/instancia.

    Todo el cuerpo va deliberadamente en un try/except de proposito general,
    por dos motivos que conviven en la misma linea de defensa:

    1. Un fallo aqui NUNCA debe tirar abajo la operacion real del usuario.
       Perder un aviso de refresco es solo molesto (el cliente se entera un
       poco mas tarde, en el siguiente latido o al reconectar); perder la
       compra, la receta o el ticket que se estaba guardando de verdad si
       que es inaceptable. Guardar el ChangeFeed es siempre secundario a la
       escritura que lo dispara.
    2. En un post_delete que viene de un borrado en cascada (por ejemplo,
       borrar una Purchase borra sus PurchaseItem), el objeto intermedio
       necesario para llegar al household puede no resolverse igual segun
       el orden de borrado; acceder a el puede lanzar ObjectDoesNotExist (o,
       si el borrado ya limpio la referencia en memoria, AttributeError). En
       ese caso simplemente no hay nada que escribir: no se pierde
       informacion util, porque el borrado del padre ya genera su propio
       aviso para el mismo hogar.
    """
    try:
        _, obtener_household = MAPA_ENTIDADES[entity]
        household = obtener_household(instance)
        if household is None:
            return
        # Un hogar que se esta borrando no admite filas nuevas: quedarian
        # colgando y romperian la integridad al cerrar la transaccion (ver
        # _antes_de_borrar_hogar). Tampoco hay a quien avisar: el hogar
        # entero desaparece, y el cliente se entera al recargar.
        if household.pk in _hogares_en_borrado():
            return
        fila = ChangeFeed.objects.create(household=household, entity=entity)
        _podar_de_vez_en_cuando(fila.pk)
    except Exception:
        pass


def _en_cambio(sender, instance, **kwargs):
    """Receiver generico para post_save: vale para cualquier modelo del mapa."""
    _registrar_cambio(_ENTIDAD_POR_MODELO[sender], instance)


def _en_borrado(sender, instance, **kwargs):
    """Receiver generico para post_delete: vale para cualquier modelo del mapa."""
    entity = _ENTIDAD_POR_MODELO[sender]
    if entity == 'household':
        # Borrar el propio Household es el unico caso en el que "el
        # household de este cambio" es la misma fila que se esta borrando.
        # Escribir aqui una fila de ChangeFeed que apunta (via FK) a un
        # household que esta desapareciendo en la misma transaccion es
        # ademas peligroso: en SQLite la comprobacion de claves foraneas es
        # diferida, asi que el INSERT "funciona" en este momento pero la
        # violacion revienta al cerrar la transaccion de borrado, fuera de
        # cualquier try/except que pongamos aqui (ver el intento anterior,
        # que rompia test_owner_can_delete_own_household). Y tampoco hay a
        # quien avisar: quien tuviera acceso al hogar ya lo pierde con el
        # borrado en si, sin necesidad de que nadie refresque nada.
        return
    _registrar_cambio(entity, instance)


def conectar_signals() -> None:
    """Conecta post_save/post_delete de cada modelo del mapa. Llamado desde SalazConfig.ready()."""
    for entity, (modelo, _) in MAPA_ENTIDADES.items():
        # dispatch_uid evita conectar el mismo receiver dos veces si Django
        # llega a importar/ejecutar ready() mas de una vez (p.ej. en tests
        # que hacen varios setups de la app).
        post_save.connect(_en_cambio, sender=modelo, dispatch_uid=f'changefeed-save-{entity}')
        post_delete.connect(_en_borrado, sender=modelo, dispatch_uid=f'changefeed-delete-{entity}')

    # Aparte del mapa: marcar y desmarcar el hogar que se esta borrando.
    pre_delete.connect(_antes_de_borrar_hogar, sender=Household, dispatch_uid='changefeed-hogar-pre')
    post_delete.connect(_tras_borrar_hogar, sender=Household, dispatch_uid='changefeed-hogar-post')


def _podar_de_vez_en_cuando(pk) -> None:
    """
    Llama a podar_cambios_viejos() solo para 1 de cada 50 filas escritas.

    Podar en cada escritura anadiria un DELETE contra ChangeFeed a cada
    compra, receta o linea de lista que se guarda en el hogar, justo lo
    contrario de por que esta tabla existe (que esas escrituras sean
    baratas y frecuentes). Usar el propio pk (en vez de, por ejemplo, un
    contador o una marca de tiempo en memoria del proceso) evita tener que
    guardar y sincronizar un estado global entre los varios workers de
    gunicorn: la autonumeracion de la tabla ya reparte las podas sin que
    ningun worker necesite saber lo que hicieron los demas.
    """
    if pk is not None and pk % 50 == 0:
        podar_cambios_viejos()


def podar_cambios_viejos() -> int:
    """
    Borra las filas de ChangeFeed de mas de una hora. Devuelve cuantas borro.

    Una hora es mucho mas que el tope de vida de una conexion SSE (~5
    minutos, ver eventos_sse en api/views.py) mas el tiempo que tarda un
    cliente en reconectar tras una caida de red: ninguna fila mas vieja que
    eso puede ya hacer falta, asi que no hay razon para guardarla.
    """
    limite = timezone.now() - timedelta(hours=1)
    borradas, _ = ChangeFeed.objects.filter(created__lt=limite).delete()
    return borradas
