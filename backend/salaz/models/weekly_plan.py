"""
Planificacion semanal/quincenal de recetas de un hogar.

Antes vivia entera en localStorage bajo `salaz.plan.semana` (ver
web/src/features/compra/planLocal.ts): que receta toca cada dia, que recetas
entraron en la ultima lista generada y de que receta sale cada ingrediente de
esa lista. Un plan por hogar, igual que alli: generar un plan nuevo
reemplaza al anterior, no se acumulan.

Las tres estructuras libres (`selection`, `by_day`, `ingredient_origins`) se
guardan tal cual en JSONField porque son las mismas formas que ya define
PlanSemana en el frontend; no hay ganancia en normalizarlas en tablas propias
para algo que se lee y escribe siempre entero, nunca fila a fila.
"""

from django.db import models


class WeeklyPlan(models.Model):
    """El plan semanal vigente de un hogar. Uno solo, se sobreescribe."""

    household = models.OneToOneField(
        'salaz.Household',
        on_delete=models.CASCADE,
        related_name='weekly_plan',
    )
    start_date = models.DateField()
    end_date = models.DateField()
    #: RecetaEnPlan[]: que recetas entraron en la ultima lista generada y
    #: cuantas tandas de cada una.
    selection = models.JSONField(default=list, blank=True)
    #: AsignacionDia[]: que receta toca comer cada dia del rango.
    by_day = models.JSONField(default=list, blank=True)
    #: Record<id de Ingredient de wger, string[]>: de que recetas sale cada
    #: ingrediente, segun el ultimo plan generado.
    ingredient_origins = models.JSONField(default=dict, blank=True)
    #: Ultima escritura gana entre dispositivos. Ver la nota completa en
    #: device_state.py.
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Plan de {self.household.name} ({self.start_date} - {self.end_date})'

    def get_owner_object(self):
        return self.household
