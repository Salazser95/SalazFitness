# Una cuenta de usuario solo puede representar a un HouseholdMember: sin
# esto, "el hogar accesible por este usuario" (ver salaz/api/views.py,
# _acceso_hogar) dejaria de tener un sentido unico si alguien se vinculara
# sin querer a dos filas. NULL (miembro sin cuenta vinculada) no cuenta para
# esta restriccion, asi que no rompe los miembros ya existentes sin vincular.

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('salaz', '0007_reprogramacion_entreno'),
    ]

    operations = [
        migrations.AlterField(
            model_name='householdmember',
            name='user',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name='salaz_household_memberships',
                to=settings.AUTH_USER_MODEL,
                unique=True,
            ),
        ),
    ]
