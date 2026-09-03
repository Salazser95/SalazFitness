from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class HouseholdMember(models.Model):
    """A person belonging to a household. May or may not have a wger user account."""

    household = models.ForeignKey(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='members',
    )
    name = models.CharField(max_length=200)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='salaz_household_memberships',
        null=True,
        blank=True,
        # Una cuenta no puede representar a mas de un miembro a la vez (en
        # este hogar o en otro): si no, "el hogar accesible por este
        # usuario" dejaria de tener un sentido unico. NULL no cuenta para
        # esta restriccion (varios miembros sin cuenta vinculada conviven
        # sin problema).
        unique=True,
    )
    consumption_share = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        blank=True,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
        help_text='Percentage (0-100) of the shared household costs this member covers.',
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.household.name})'

    def get_owner_object(self):
        return self.household

    def save(self, *args, **kwargs):
        """
        If no share was given, default to an equal split among the members of
        the household (including this one). This only sets a value for the
        member being saved; it does not retroactively rebalance the others.
        """
        if self.consumption_share is None:
            existing_count = (
                HouseholdMember.objects.filter(household_id=self.household_id)
                .exclude(pk=self.pk)
                .count()
            )
            total_members = existing_count + 1
            self.consumption_share = (Decimal('100') / total_members).quantize(Decimal('0.01'))
        super().save(*args, **kwargs)
