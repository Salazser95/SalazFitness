from decimal import Decimal

from django.db import models
from django.db.models import Sum


class ShoppingList(models.Model):
    """A shopping list for a household, covering a date range."""

    household = models.ForeignKey(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='shopping_lists',
    )
    name = models.CharField(max_length=255)
    start_date = models.DateField()
    end_date = models.DateField()
    created = models.DateTimeField(auto_now_add=True)

    #: Id del plan de nutricion de wger del que salio la lista (UUID en texto),
    #: vacio si la lista se genero desde recetas o a mano. Es lo que permite
    #: que Nutricion y Compra hablen de lo mismo: el diario sabe si lo que toca
    #: comer hoy esta comprado mirando la lista que salio de su propio plan.
    nutrition_plan = models.CharField(max_length=64, blank=True, default='')
    #: Dias que cubre el plan (12 por defecto, ver frescura.DIAS_POR_DEFECTO).
    days = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-created']

    def __str__(self):
        return self.name

    def get_owner_object(self):
        return self.household

    @property
    def estimated_total(self) -> Decimal:
        total = self.items.aggregate(total=Sum('estimated_price'))['total']
        return total if total is not None else Decimal('0.00')

    @property
    def trips(self) -> list[dict]:
        """
        Resumen de cada tanda de compra: que dia toca, cuanto cuesta y si ya
        esta hecha. La app pinta la lista agrupada por esto en vez de soltar
        los 12 dias de una vez.
        """
        por_tanda: dict[int, dict] = {}
        for item in self.items.all():
            resumen = por_tanda.setdefault(
                item.trip,
                {
                    'trip': item.trip,
                    'buy_date': item.buy_date,
                    'items': 0,
                    'purchased': 0,
                    'estimated_total': Decimal('0.00'),
                },
            )
            resumen['items'] += 1
            if item.purchased:
                resumen['purchased'] += 1
            if item.estimated_price:
                resumen['estimated_total'] += item.estimated_price
            # La fecha de la tanda es la mas temprana de sus lineas.
            if item.buy_date and (resumen['buy_date'] is None or item.buy_date < resumen['buy_date']):
                resumen['buy_date'] = item.buy_date

        for resumen in por_tanda.values():
            resumen['done'] = resumen['items'] > 0 and resumen['purchased'] == resumen['items']
        return [por_tanda[k] for k in sorted(por_tanda)]
