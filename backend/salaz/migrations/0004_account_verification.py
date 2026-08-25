"""
Confirmacion de la cuenta por correo.

Escrita a mano, igual que 0003: el modulo solo se importa con wger en el
PYTHONPATH y aqui no hace falta nada de wger, solo el modelo de usuario.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import salaz.models.account


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('salaz', '0003_frescura_y_tandas'),
    ]

    operations = [
        migrations.CreateModel(
            name='AccountVerification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.CharField(default=salaz.models.account.nuevo_token, max_length=64, unique=True)),
                ('verified', models.BooleanField(default=False)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('emails_sent', models.PositiveIntegerField(default=0)),
                (
                    'user',
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salaz_verification',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={'ordering': ['-created']},
        ),
    ]
