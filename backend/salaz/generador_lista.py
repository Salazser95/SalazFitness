"""
De los platos del plan de nutricion a la lista de la compra, por tandas.

Esto es lo que faltaba para que Nutricion y Compra sean la misma cosa. Hasta
ahora la lista se generaba desde las recetas del modulo de compra, que son un
catalogo aparte: lo que el usuario apunta en Desayuno / Comida / Cena / Snacks
no llegaba nunca al supermercado.

Aqui se lee el plan de nutricion de wger (sus `Meal` y sus `MealItem`, que son
la plantilla de lo que toca comer cada dia), se multiplica por los dias del
periodo y se reparte en tandas segun lo que aguante cada producto
(ver salaz/frescura.py).

La cuenta de una linea es siempre la misma:

    gramos de la tanda = gramos al dia x dias que cubre esa tanda

asi que las cuatro tandas de moras de un periodo de 12 dias suman exactamente
los mismos gramos que una sola linea de 12 dias, pero repartidos en cuatro
compras pequenas con su fecha.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from salaz import frescura
from salaz.models import IngredientPrice, ShoppingList, ShoppingListItem
from wger.nutrition.models import Ingredient, Meal, MealItem


CIEN = Decimal('100')


@dataclass
class Producto:
    """Un alimento que hay que comprar, con lo que hace falta al dia."""

    nombre: str
    gramos_dia: Decimal
    ingredient_id: int | None = None
    #: De donde sale: las comidas del plan, o la cesta de fruta y verdura.
    origenes: list[str] = field(default_factory=list)
    nota: str = ''

    @property
    def origen(self) -> str:
        return ', '.join(dict.fromkeys(self.origenes))


def _gramos_de(item: MealItem) -> Decimal:
    """
    Gramos de un `MealItem`.

    `amount` esta en gramos salvo que la entrada use una unidad de peso propia
    del alimento (`weight_unit`: "1 rebanada", "1 vaso"), en cuyo caso hay que
    convertir con los gramos que declara esa unidad. Se hace con getattr porque
    el modelo de wger no forma parte de este repositorio y no conviene atarse a
    la forma exacta de una version concreta: si la conversion no esta
    disponible, se usa `amount` tal cual.
    """
    cantidad = Decimal(item.amount or 0)
    unidad = getattr(item, 'weight_unit', None)
    if unidad is None:
        return cantidad
    gramos_por_unidad = getattr(unidad, 'gram', None)
    amount_unidad = getattr(unidad, 'amount', None) or 1
    if gramos_por_unidad:
        return cantidad * Decimal(gramos_por_unidad) / Decimal(amount_unidad)
    return cantidad


def productos_del_plan(plan_id: str) -> list[Producto]:
    """
    Los alimentos de la plantilla de un plan de nutricion, en gramos al dia.

    Un mismo alimento en dos comidas (el yogur del desayuno y el de la cena) se
    suma en un solo producto, y se guarda de que comidas viene para poder
    ensenarlo en la lista.
    """
    comidas = list(Meal.objects.filter(plan_id=plan_id).order_by('order'))
    if not comidas:
        return []

    por_comida = {comida.id: (comida.name or f'Comida {comida.order}') for comida in comidas}
    items = MealItem.objects.filter(meal_id__in=list(por_comida)).select_related('ingredient')

    agregados: dict[int, Producto] = {}
    for item in items:
        gramos = _gramos_de(item)
        if gramos <= 0:
            continue
        producto = agregados.get(item.ingredient_id)
        if producto is None:
            # El nombre se copia AQUI, no se deja para el frontend: una linea
            # sin `name` sale en blanco en el supermercado.
            nombre = item.ingredient.name if item.ingredient else f'Ingrediente #{item.ingredient_id}'
            if item.ingredient and item.ingredient.brand:
                nombre = f'{nombre} ({item.ingredient.brand})'
            producto = Producto(nombre=nombre, gramos_dia=Decimal('0'), ingredient_id=item.ingredient_id)
            agregados[item.ingredient_id] = producto
        producto.gramos_dia += gramos
        producto.origenes.append(por_comida[item.meal_id])

    return list(agregados.values())


def _ingrediente_por_nombre(nombre: str) -> Ingredient | None:
    """
    El alimento de wger que mejor case con un nombre suelto de la cesta.

    Sirve para que la fruta y la verdura que se anaden por defecto puedan
    llevar precio y macros como cualquier otra linea. Si no hay nada parecido,
    la linea se queda como texto libre, que es suficiente para la compra.
    """
    return (
        Ingredient.objects.filter(name__iexact=nombre).first()
        or Ingredient.objects.filter(name__istartswith=nombre).order_by('name').first()
    )


def anadir_cesta(productos: list[Producto], fruta_roja: bool = True) -> list[Producto]:
    """
    Completa la lista con la fruta y la verdura del dia a dia.

    El plan de nutricion casi nunca las tiene apuntadas plato a plato, y son
    justo lo que luego falta en la nevera. Solo se anade lo que no este ya en
    la lista, para no comprar dos veces el mismo tomate.
    """
    ya_estan = {frescura.normalizar_nombre(p.nombre) for p in productos}
    salida = list(productos)

    for entrada in frescura.cesta_fruta_verdura(fruta_roja=fruta_roja):
        clave = frescura.normalizar_nombre(entrada.nombre)
        if any(clave in nombre or nombre in clave for nombre in ya_estan):
            continue
        ingrediente = _ingrediente_por_nombre(entrada.nombre)
        salida.append(
            Producto(
                nombre=ingrediente.name if ingrediente else entrada.nombre,
                gramos_dia=Decimal(entrada.gramos_dia),
                ingredient_id=ingrediente.id if ingrediente else None,
                origenes=['Fruta y verdura'],
                nota=entrada.motivo,
            )
        )
    return salida


def _precio_por_100g(household_id: int, ingredient_id: int | None) -> Decimal | None:
    if ingredient_id is None:
        return None
    precio = (
        IngredientPrice.objects.filter(
            household_id=household_id,
            ingredient_id=ingredient_id,
            is_current=True,
        )
        .order_by('-date')
        .first()
    )
    return precio.price_per_100g if precio else None


def generar_lista(
    *,
    household,
    productos: list[Producto],
    start_date: date,
    days: int,
    nombre: str,
    nutrition_plan: str = '',
    congelar: bool | None = None,
) -> ShoppingList:
    """
    Crea la lista y sus lineas, ya repartidas en tandas de compra.

    Devuelve la `ShoppingList` guardada. Cada linea sabe de que tanda es, que
    dia toca comprarla, cuantos dias cubre y si hay que congelarla al llegar.
    """
    days = max(1, int(days))
    lista = ShoppingList.objects.create(
        household=household,
        name=nombre,
        start_date=start_date,
        end_date=start_date + timedelta(days=days - 1),
        nutrition_plan=nutrition_plan,
        days=days,
    )

    lineas: list[ShoppingListItem] = []
    for producto in productos:
        if producto.gramos_dia <= 0:
            continue
        perfil = frescura.perfil_para(producto.nombre)
        plan = frescura.planificar_compra(days, perfil, congelar=congelar)
        precio_100g = _precio_por_100g(household.id, producto.ingredient_id)

        for tanda in plan.tandas:
            gramos = (producto.gramos_dia * tanda.dias_cubiertos).quantize(
                Decimal('1'), rounding=ROUND_HALF_UP
            )
            if gramos <= 0:
                continue
            estimado = None
            if precio_100g is not None:
                estimado = (precio_100g / CIEN * gramos).quantize(Decimal('0.01'))

            nota = ' '.join(x for x in (plan.motivo, producto.nota or perfil.nota) if x).strip()
            lineas.append(
                ShoppingListItem(
                    shopping_list=lista,
                    ingredient_id=producto.ingredient_id,
                    name=producto.nombre,
                    amount=gramos,
                    unit=IngredientPrice.UNIT_GRAM,
                    estimated_price=estimado,
                    purchased=False,
                    supermarket='',
                    category=perfil.categoria,
                    shelf_life_days=perfil.dias,
                    trip=tanda.indice,
                    buy_date=start_date + timedelta(days=tanda.dia_offset),
                    days_covered=tanda.dias_cubiertos,
                    freeze_on_arrival=plan.congelar,
                    source=producto.origen,
                    note=nota[:255],
                )
            )

    ShoppingListItem.objects.bulk_create(lineas)
    return lista
