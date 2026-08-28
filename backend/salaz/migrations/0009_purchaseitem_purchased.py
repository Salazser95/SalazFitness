# PurchaseItem gana el mismo campo `purchased` que ya tenia ShoppingListItem.
# Antes esto solo vivia en localStorage del navegador (ver la nota que habia
# en web/src/features/compra/CompraDetalle.tsx): sin sincronizar entre
# dispositivos ni sobrevivir a borrar datos del navegador. Sin backfill
# especial: todas las filas existentes empiezan sin marcar (False), igual que
# empezaria un Set vacio de localStorage en un dispositivo nuevo.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('salaz', '0008_household_member_user_unico'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseitem',
            name='purchased',
            field=models.BooleanField(default=False),
        ),
    ]
