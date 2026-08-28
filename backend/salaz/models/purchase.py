from decimal import Decimal

from django.db import models
from django.db.models import Sum


class Purchase(models.Model):
    """A single shopping trip for a household."""

    household = models.ForeignKey(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='purchases',
    )
    date = models.DateField()
    description = models.CharField(max_length=255)
    supermarket = models.CharField(max_length=200, blank=True, default='')
    covers_days = models.PositiveIntegerField(default=7)
    # Puestos solo por el backend (ver _sincronizar_compra_real en
    # api/views.py) cuando esta Purchase nace de marcar como comprada una
    # linea de una ShoppingList (la lista generada desde nutricion o
    # recetas): una por tanda, para no crear una Purchase nueva cada vez que
    # se marca otra linea de la misma tanda. Null en una compra creada a
    # mano desde la pantalla de Compras, que no viene de ninguna lista.
    shopping_list = models.ForeignKey(
        'salaz.ShoppingList',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchases_realizadas',
    )
    trip = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-date']

    def __str__(self):
        return f'{self.description} ({self.date})'

    def get_owner_object(self):
        return self.household

    @property
    def total_cost(self) -> Decimal:
        total = self.items.aggregate(total=Sum('price'))['total']
        return total if total is not None else Decimal('0.00')

    @property
    def cost_per_day(self) -> Decimal:
        if not self.covers_days:
            return Decimal('0.00')
        return (self.total_cost / self.covers_days).quantize(Decimal('0.01'))

    @property
    def shared_total(self) -> Decimal:
        total = self.items.filter(is_shared=True).aggregate(total=Sum('price'))['total']
        return total if total is not None else Decimal('0.00')

    @property
    def individual_total(self) -> Decimal:
        total = self.items.filter(is_shared=False).aggregate(total=Sum('price'))['total']
        return total if total is not None else Decimal('0.00')

    @property
    def cost_per_person(self) -> dict:
        """
        Returns {member_id: Decimal amount}, applying each member's
        consumption_share to the shared items and adding whatever individual
        (is_shared=False) items were assigned directly to them.
        """
        result = {}
        shared = self.shared_total
        for member in self.household.members.all():
            share_amount = (shared * member.consumption_share / Decimal('100')).quantize(
                Decimal('0.01')
            )
            individual = self.items.filter(is_shared=False, member=member).aggregate(
                total=Sum('price')
            )['total'] or Decimal('0.00')
            result[member.id] = (share_amount + individual).quantize(Decimal('0.01'))
        return result
