# Enlaza la lista de la compra (generada desde nutricion o recetas) con las
# compras reales: Purchase.shopping_list/trip identifica la Purchase que
# representa una tanda concreta de una lista, y PurchaseItem.shopping_list_item
# (uno a uno) evita duplicar la linea si se vuelve a marcar/desmarcar la misma
# linea de la lista como comprada. Ver _sincronizar_compra_real en api/views.py.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('salaz', '0010_pantryitem'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchase',
            name='shopping_list',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='purchases_realizadas', to='salaz.shoppinglist'),
        ),
        migrations.AddField(
            model_name='purchase',
            name='trip',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='purchaseitem',
            name='shopping_list_item',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='purchase_item', to='salaz.shoppinglistitem'),
        ),
    ]
