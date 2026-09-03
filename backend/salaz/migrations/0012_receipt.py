# Receipt: el ticket de la compra subido como foto, con su transcripcion en
# texto (`markdown`) y el resultado de analizarla (`parsed`). Ver la nota
# larga en salaz/models/receipt.py sobre por que el texto intermedio se
# guarda y se deja editable.

import django.db.models.deletion
from django.db import migrations, models

import salaz.models.receipt


class Migration(migrations.Migration):
    dependencies = [
        ('salaz', '0011_lista_a_compra'),
    ]

    operations = [
        migrations.CreateModel(
            name='Receipt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.ImageField(blank=True, null=True, upload_to=salaz.models.receipt.receipt_image_upload_dir)),
                ('markdown', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('pendiente', 'Pendiente de analizar'), ('analizado', 'Analizado, pendiente de confirmar'), ('confirmado', 'Confirmado, ya volcado a la compra'), ('error', 'No se ha podido analizar')], default='pendiente', max_length=20)),
                ('supermarket', models.CharField(blank=True, default='', max_length=200)),
                ('date', models.DateField(blank=True, null=True)),
                ('total', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('parsed', models.JSONField(blank=True, default=dict)),
                ('error', models.TextField(blank=True, default='')),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('household', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='receipts', to='salaz.household')),
                ('purchase', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='receipt', to='salaz.purchase')),
            ],
            options={
                'ordering': ['-created'],
            },
        ),
    ]
