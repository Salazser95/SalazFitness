"""
Reparto de la lista de la compra en tandas segun lo que aguanta cada producto.

Escrita a mano (no con makemigrations) porque el modulo salaz solo se puede
importar con el backend de wger en el PYTHONPATH, y esta migracion no depende
de nada de wger: solo anade columnas propias.
"""

from django.db import migrations, models

import salaz.frescura


class Migration(migrations.Migration):
    dependencies = [
        ('salaz', '0002_recipe_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='shoppinglist',
            name='nutrition_plan',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='shoppinglist',
            name='days',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='shoppinglistitem',
            name='category',
            field=models.CharField(
                blank=True,
                choices=[(c, c) for c in salaz.frescura.CATEGORIAS],
                default='',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='shoppinglistitem',
            name='shelf_life_days',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='shoppinglistitem',
            name='trip',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='shoppinglistitem',
            name='buy_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='shoppinglistitem',
            name='days_covered',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='shoppinglistitem',
            name='freeze_on_arrival',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='shoppinglistitem',
            name='source',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='shoppinglistitem',
            name='note',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AlterModelOptions(
            name='shoppinglistitem',
            options={'ordering': ['trip', 'category', 'id']},
        ),
    ]
