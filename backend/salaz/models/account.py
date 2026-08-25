"""
Confirmacion de la cuenta por correo.

Sin esto cualquiera puede darse de alta y ponerse a pedir datos al servidor, y
un servidor domestico se satura con muy poco. La cuenta se crea desactivada
(`is_active=False`) y solo se activa al pinchar el enlace que llega al correo,
asi que hasta entonces el login de wger la rechaza sin que haya que tocar nada
de wger.

`salaz1` es la excepcion pedida: cuenta de prueba, verificada de entrada, sin
correo de por medio (ver la orden `crear_usuario`).
"""

import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


def nuevo_token() -> str:
    """Token de un solo uso para el enlace del correo."""
    return secrets.token_urlsafe(32)


class AccountVerification(models.Model):
    """Estado de confirmacion del correo de un usuario."""

    #: Horas que vale el enlace del correo antes de caducar.
    HORAS_VALIDEZ = 48

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salaz_verification',
    )
    token = models.CharField(max_length=64, unique=True, default=nuevo_token)
    verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    #: Cuando se mando el ultimo correo. Limita los reenvios.
    sent_at = models.DateTimeField(null=True, blank=True)
    emails_sent = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-created']

    def __str__(self):
        estado = 'verificada' if self.verified else 'pendiente'
        return f'{self.user.username} ({estado})'

    @property
    def expired(self) -> bool:
        """True si el enlace ya no vale. Una cuenta ya verificada nunca caduca."""
        if self.verified:
            return False
        referencia = self.sent_at or self.created
        if referencia is None:
            return False
        return timezone.now() - referencia > timedelta(hours=self.HORAS_VALIDEZ)

    def regenerar_token(self) -> str:
        """Token nuevo para un reenvio: el anterior deja de valer."""
        self.token = nuevo_token()
        self.sent_at = timezone.now()
        self.emails_sent += 1
        self.save(update_fields=['token', 'sent_at', 'emails_sent'])
        return self.token

    def confirmar(self) -> None:
        """Marca la cuenta como verificada y la activa para poder entrar."""
        self.verified = True
        self.verified_at = timezone.now()
        self.save(update_fields=['verified', 'verified_at'])
        if not self.user.is_active:
            self.user.is_active = True
            self.user.save(update_fields=['is_active'])
