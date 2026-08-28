import uuid

from django.db import models

from salaz import frescura
from salaz.models.ingredient_price import IngredientPrice
from wger.nutrition.models import Ingredient


def _nueva_clave_grupo() -> str:
    """Identificador de grupo para una linea recien creada.

    Se llama una vez por cada `ShoppingListItem(...)` construido en Python sin
    pasarle `group_key` explicito (el `default=` de un campo de Django se
    evalua por instancia, no una sola vez para todas). Por eso una linea suelta
    creada a mano en la app siempre nace con su propio grupo de una sola linea,
    y solo `generador_lista.generar_lista()` la sobreescribe a proposito para
    que las tandas de un mismo producto compartan grupo.
    """
    return str(uuid.uuid4())


class ShoppingListItem(models.Model):
    """A single line item within a ShoppingList."""

    shopping_list = models.ForeignKey(
        'salaz.ShoppingList',
        on_delete=models.CASCADE,
        related_name='items',
    )
    ingredient = models.ForeignKey(
        Ingredient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='salaz_shopping_list_items',
    )
    name = models.CharField(max_length=255, blank=True, default='')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=10, choices=IngredientPrice.UNIT_CHOICES)
    estimated_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    purchased = models.BooleanField(default=False)
    supermarket = models.CharField(max_length=200, blank=True, default='')

    # Identifica "el mismo producto" a traves de sus varias tandas de compra,
    # para poder quitarlo de la lista entera de una vez sin depender de
    # comparar nombres (fragil: dos productos de texto libre con el mismo
    # nombre en la misma lista no son necesariamente la misma cosa que
    # comprar). No es la clave primaria porque varias filas (una por tanda)
    # comparten el mismo group_key a proposito.
    group_key = models.CharField(
        max_length=36,
        default=_nueva_clave_grupo,
        editable=False,
        db_index=True,
    )

    # ------------------------------------------------------------ frescura
    # Una lista de 12 dias no es una sola compra: lo seco se compra una vez y
    # lo fresco se repone. Estos campos guardan a que tanda pertenece cada
    # linea, para que la app pueda ensenar "hoy toca comprar esto" en vez de
    # las 12 dias de golpe. Ver salaz/frescura.py.
    category = models.CharField(
        max_length=20,
        choices=[(c, c) for c in frescura.CATEGORIAS],
        blank=True,
        default='',
    )
    #: Dias que aguanta el producto, copiados del perfil de frescura.
    shelf_life_days = models.PositiveIntegerField(null=True, blank=True)
    #: 1 = compra grande del primer dia; 2, 3... reposiciones de fresco.
    trip = models.PositiveIntegerField(default=1)
    #: Dia en que toca comprar esta linea. Null en listas antiguas.
    buy_date = models.DateField(null=True, blank=True)
    #: Cuantos dias del plan cubre esta linea concreta.
    days_covered = models.PositiveIntegerField(default=0)
    #: True si hay que meterlo en el congelador nada mas llegar a casa.
    freeze_on_arrival = models.BooleanField(default=False)
    #: De donde sale la linea: 'Desayuno', 'Cena', 'Fruta y verdura'...
    source = models.CharField(max_length=120, blank=True, default='')
    note = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['trip', 'category', 'id']

    def __str__(self):
        label = self.ingredient.name if self.ingredient else self.name
        return f'{label} ({self.amount}{self.unit})'

    def get_owner_object(self):
        return self.shopping_list.household

    def aplicar_frescura(self, dias_del_plan: int) -> None:
        """
        Rellena categoria, vida util y nota a partir del nombre del producto.

        Para las lineas que se crean a mano desde la app (las que genera el
        endpoint ya vienen con todo puesto). No toca `trip` ni `buy_date`: una
        linea suelta pertenece a la tanda que le haya dicho el usuario.
        """
        perfil = frescura.perfil_para(self.name or (self.ingredient.name if self.ingredient else ''))
        self.category = perfil.categoria
        self.shelf_life_days = perfil.dias
        if not self.days_covered:
            self.days_covered = dias_del_plan
        if not self.note:
            self.note = perfil.nota
