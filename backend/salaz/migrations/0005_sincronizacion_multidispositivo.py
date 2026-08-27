# Escrita a mano, igual que 0003 y 0004: el modulo salaz solo se importa con
# wger en el PYTHONPATH, y esta migracion no toca nada de wger salvo la FK a
# Ingredient que ya usan IngredientPrice, PurchaseItem, etc. desde 0001.
#
# Anade los modelos que sacan del localStorage del navegador los siete datos
# que antes vivian solo alli (agua, objetivo de peso, plan semanal,
# favoritos/recientes de alimentos, sesion de entreno en curso y las dos
# preferencias que cruzan dispositivo). Ver la nota de "ultima escritura gana"
# en salaz/models/device_state.py.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('nutrition', '0037_powersync_synced_ingredient_tables'),
        ('salaz', '0004_account_verification'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeviceState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                (
                    'key',
                    models.CharField(
                        choices=[
                            ('rutina_activa', 'Rutina activa'),
                            ('plan_activo', 'Plan de nutricion activo'),
                        ],
                        max_length=30,
                    ),
                ),
                ('value', models.CharField(blank=True, default='', max_length=64)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salaz_device_states',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={'ordering': ['key']},
        ),
        migrations.AddConstraint(
            model_name='devicestate',
            constraint=models.UniqueConstraint(fields=('user', 'key'), name='salaz_device_state_unique_user_key'),
        ),
        migrations.CreateModel(
            name='FavoriteIngredient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'ingredient',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salaz_favorited_by',
                        to='nutrition.ingredient',
                    ),
                ),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salaz_favorite_ingredients',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={'ordering': ['-created']},
        ),
        migrations.AddConstraint(
            model_name='favoriteingredient',
            constraint=models.UniqueConstraint(
                fields=('user', 'ingredient'), name='salaz_favorite_unique_user_ingredient'
            ),
        ),
        migrations.CreateModel(
            name='RecentIngredient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'ingredient',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salaz_recently_used_by',
                        to='nutrition.ingredient',
                    ),
                ),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salaz_recent_ingredients',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={'ordering': ['-updated_at']},
        ),
        migrations.AddConstraint(
            model_name='recentingredient',
            constraint=models.UniqueConstraint(
                fields=('user', 'ingredient'), name='salaz_recent_unique_user_ingredient'
            ),
        ),
        migrations.CreateModel(
            name='WaterLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('milliliters', models.PositiveIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salaz_water_logs',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={'ordering': ['-date']},
        ),
        migrations.AddConstraint(
            model_name='waterlog',
            constraint=models.UniqueConstraint(fields=('user', 'date'), name='salaz_waterlog_unique_user_date'),
        ),
        migrations.CreateModel(
            name='WeeklyPlan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('selection', models.JSONField(blank=True, default=list)),
                ('by_day', models.JSONField(blank=True, default=list)),
                ('ingredient_origins', models.JSONField(blank=True, default=dict)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'household',
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='weekly_plan',
                        to='salaz.household',
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name='WeightGoal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                (
                    'goal_type',
                    models.CharField(
                        blank=True,
                        choices=[
                            ('perder_peso', 'Perder peso'),
                            ('mantener_peso', 'Mantener peso'),
                            ('ganar_peso', 'Ganar peso'),
                            ('ganar_masa_muscular', 'Ganar masa muscular'),
                            ('mejorar_fuerza', 'Mejorar fuerza'),
                            ('recomposicion_corporal', 'Recomposicion corporal'),
                        ],
                        default='',
                        max_length=30,
                    ),
                ),
                ('target_weight', models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                ('target_date', models.DateField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'user',
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salaz_weight_goal',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name='WorkoutSessionDraft',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('content', models.JSONField(blank=True, default=dict)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='salaz_workout_session_drafts',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={'ordering': ['-date']},
        ),
        migrations.AddConstraint(
            model_name='workoutsessiondraft',
            constraint=models.UniqueConstraint(
                fields=('user', 'date'), name='salaz_workout_draft_unique_user_date'
            ),
        ),
    ]
