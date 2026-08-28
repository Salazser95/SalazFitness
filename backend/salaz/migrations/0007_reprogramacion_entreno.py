# Escrita a mano, igual que las anteriores del modulo: no toca nada de wger,
# solo anade dos tablas propias (ver la nota de arquitectura en
# salaz/models/workout_reschedule.py sobre por que no llevan FK a Routine/Day
# de wger).
#
# WorkoutReschedule: mover el entreno de una fecha a otra sin tocar la
# rutina. WorkoutDaySkip: marcar una fecha como "omitida a proposito", para
# no confundir la ausencia de datos con "no entrene".

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('salaz', '0006_shoppinglistitem_group_key'),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkoutDaySkip',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name='salaz_workout_day_skips',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={'ordering': ['-date']},
        ),
        migrations.AddConstraint(
            model_name='workoutdayskip',
            constraint=models.UniqueConstraint(
                fields=('user', 'date'), name='salaz_day_skip_unique_user_date'
            ),
        ),
        migrations.CreateModel(
            name='WorkoutReschedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('origin_date', models.DateField()),
                ('target_date', models.DateField()),
                ('origin_routine', models.IntegerField(blank=True, null=True)),
                ('origin_day', models.IntegerField(blank=True, null=True)),
                ('target_routine', models.IntegerField(blank=True, null=True)),
                ('target_day', models.IntegerField(blank=True, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name='salaz_workout_reschedules',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={'ordering': ['-created']},
        ),
        migrations.AddConstraint(
            model_name='workoutreschedule',
            constraint=models.UniqueConstraint(
                fields=('user', 'origin_date'), name='salaz_reschedule_unique_origin'
            ),
        ),
        migrations.AddConstraint(
            model_name='workoutreschedule',
            constraint=models.UniqueConstraint(
                fields=('user', 'target_date'), name='salaz_reschedule_unique_target'
            ),
        ),
    ]
