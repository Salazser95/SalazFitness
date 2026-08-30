# ChangeFeed: tabla de avisos "algo ha cambiado" que alimenta la
# sincronizacion en tiempo real por SSE (endpoint /api/v2/salaz/events/).
# Ver la nota larga en salaz/models/change_feed.py sobre por que es una
# tabla y no un pub/sub en memoria (varios workers de gunicorn).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('salaz', '0012_receipt'),
    ]

    operations = [
        migrations.CreateModel(
            name='ChangeFeed',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('entity', models.CharField(max_length=40)),
                ('created', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('household', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='changes', to='salaz.household')),
            ],
            options={
                'ordering': ['id'],
            },
        ),
        migrations.AddIndex(
            model_name='changefeed',
            index=models.Index(fields=['household', 'id'], name='salaz_chang_househo_06c30d_idx'),
        ),
    ]
