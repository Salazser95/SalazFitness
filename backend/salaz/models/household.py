from decimal import Decimal

from django.conf import settings
from django.db import models


class Household(models.Model):
    """A household (group of people sharing groceries and cooking)."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_households',
    )
    name = models.CharField(max_length=200)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def user(self):
        """Alias so this model satisfies WgerPermission's owner_object.user check."""
        return self.owner

    def get_owner_object(self):
        """Used by wger.utils.permissions.WgerPermission for object-level access checks."""
        return self

    def validate_shares(self) -> bool:
        """
        Check that the consumption shares of all members of this household add up
        to 100. Deliberately not enforced as a DB constraint: it is a soft
        validation that the API surfaces so the frontend can warn the user.

        A household with no members yet is considered valid (nothing to check).
        """
        members = list(self.members.all())
        if not members:
            return True
        total = sum((member.consumption_share for member in members), Decimal('0'))
        return total == Decimal('100')
