"""
Identificador de grupo estable para juntar las tandas de un mismo producto.

El backfill es una migracion de datos (RunPython), no el `default=` de
AddField: AddField evalua un default una sola vez y lo aplica igual a TODAS
las filas existentes, lo que juntaria por error productos distintos de listas
generadas antes de este cambio. El RunPython genera un uuid4 nuevo fila a
fila, asi que cada linea vieja nace como su propio grupo de una sola linea
(el mismo comportamiento de borrado que tenian hasta ahora), sin arriesgarse
a agrupar dos productos que no tienen nada que ver.
"""

import uuid

from django.db import migrations, models

import salaz.models.shopping_list_item


def rellenar_claves_de_grupo(apps, schema_editor):
    ShoppingListItem = apps.get_model('salaz', 'ShoppingListItem')
    # updated uno a uno a proposito: cada fila necesita un uuid DISTINTO.
    for item in ShoppingListItem.objects.all():
        item.group_key = str(uuid.uuid4())
        item.save(update_fields=['group_key'])


def deshacer(apps, schema_editor):
    # No hay nada que deshacer: quitar el campo ya lo hace AddField al revertir.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('salaz', '0005_sincronizacion_multidispositivo'),
    ]

    operations = [
        migrations.AddField(
            model_name='shoppinglistitem',
            name='group_key',
            field=models.CharField(db_index=True, default='', editable=False, max_length=36),
        ),
        migrations.RunPython(rellenar_claves_de_grupo, deshacer),
        # El default real del campo (una uuid4 nueva por fila) solo se puede
        # declarar AHORA, como AlterField: si el AddField de arriba ya llevara
        # este default callable, Django lo evaluaria una sola vez para
        # rellenar TODAS las filas existentes con el mismo valor (ver el
        # docstring del modulo). El RunPython de encima ya evito ese problema
        # fila a fila; este AlterField solo deja el estado de la migracion
        # igual que el modelo, para que makemigrations --check no vea diferencia.
        migrations.AlterField(
            model_name='shoppinglistitem',
            name='group_key',
            field=models.CharField(
                db_index=True,
                default=salaz.models.shopping_list_item._nueva_clave_grupo,
                editable=False,
                max_length=36,
            ),
        ),
    ]
