# PantryItem: cuanto queda en la despensa de un hogar. Se rellena a mano
# desde la pantalla de despensa, y en automatico al marcar/desmarcar una
# linea de compra como comprada (ver PurchaseItemViewSet en api/views.py).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('nutrition', '0037_powersync_synced_ingredient_tables'),
        ('salaz', '0009_purchaseitem_purchased'),
    ]

    operations = [
        migrations.CreateModel(
            name='PantryItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(blank=True, default='', help_text="Used when there is no matching ingredient, e.g. 'verduras varias'.", max_length=255)),
                ('unit', models.CharField(choices=[('g', 'g'), ('kg', 'kg'), ('ml', 'ml'), ('l', 'l'), ('unit', 'unit')], max_length=10)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('household', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pantry_items', to='salaz.household')),
                ('ingredient', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='salaz_pantry_items', to='nutrition.ingredient')),
            ],
            options={
                'ordering': ['id'],
            },
        ),
    ]
