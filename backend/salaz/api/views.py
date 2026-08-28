from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from salaz import frescura
from salaz.api.serializers import (
    DeviceStateSerializer,
    FavoriteIngredientSerializer,
    HouseholdMemberSerializer,
    HouseholdSerializer,
    IngredientPriceSerializer,
    PurchaseItemSerializer,
    PurchaseSerializer,
    RecentIngredientSerializer,
    RecipeIngredientSerializer,
    RecipeSerializer,
    ShoppingListItemSerializer,
    ShoppingListSerializer,
    WaterLogSerializer,
    WeeklyPlanSerializer,
    WeightGoalSerializer,
    WorkoutDaySkipSerializer,
    WorkoutRescheduleSerializer,
    WorkoutSessionDraftSerializer,
)
from salaz.generador_lista import anadir_cesta, generar_lista, productos_del_plan
from salaz.models import (
    DeviceState,
    FavoriteIngredient,
    Household,
    HouseholdMember,
    IngredientPrice,
    Purchase,
    PurchaseItem,
    RecentIngredient,
    Recipe,
    RecipeIngredient,
    ShoppingList,
    ShoppingListItem,
    WaterLog,
    WeeklyPlan,
    WeightGoal,
    WorkoutDaySkip,
    WorkoutReschedule,
    WorkoutSessionDraft,
)
from salaz.models.recent_ingredient import MAX_RECIENTES
from wger.nutrition.models import Ingredient, Meal, MealItem, NutritionPlan


def _parse_date(valor) -> date | None:
    """Una fecha YYYY-MM-DD del cuerpo o de la query, o None si no es valida."""
    if not valor:
        return None
    try:
        return date.fromisoformat(str(valor))
    except ValueError:
        return None


def _flag(datos, clave: str, por_defecto: bool) -> bool:
    """
    Un booleano del cuerpo de la peticion, tolerando texto.

    Un cliente que manda JSON envia `true`, pero uno que manda un formulario
    envia la cadena "true", y `bool("false")` es True. De ahi la comprobacion
    explicita.
    """
    valor = datos.get(clave, por_defecto)
    if isinstance(valor, bool):
        return valor
    return str(valor).strip().lower() in ('1', 'true', 'yes', 'si', 'on')


class HouseholdViewSet(viewsets.ModelViewSet):
    """API endpoint for households. Only ever shows/edits households owned by the caller."""

    serializer_class = HouseholdSerializer
    is_private = True

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Household.objects.none()
        return Household.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        household = self.get_object()
        try:
            days = int(request.query_params.get('days', 30))
        except (TypeError, ValueError):
            return Response({'detail': 'days must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if days <= 0:
            return Response({'detail': 'days must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        start = timezone.now().date() - timedelta(days=days)
        purchases = list(household.purchases.filter(date__gte=start))

        total = sum((p.total_cost for p in purchases), Decimal('0.00'))
        daily = (total / days).quantize(Decimal('0.01'))

        per_person_totals = {}
        for purchase in purchases:
            for member_id, amount in purchase.cost_per_person.items():
                per_person_totals[member_id] = per_person_totals.get(member_id, Decimal('0.00')) + amount

        per_person = [
            {
                'member': member.id,
                'name': member.name,
                'share': member.consumption_share,
                'amount': per_person_totals.get(member.id, Decimal('0.00')).quantize(Decimal('0.01')),
            }
            for member in household.members.all()
        ]

        return Response(
            {
                'total': total.quantize(Decimal('0.01')),
                'per_person': per_person,
                'daily': daily,
                'weekly': (daily * 7).quantize(Decimal('0.01')),
                'biweekly': (daily * 14).quantize(Decimal('0.01')),
                'monthly_estimate': (daily * 30).quantize(Decimal('0.01')),
                'shares_valid': household.validate_shares(),
            }
        )


class HouseholdMemberViewSet(viewsets.ModelViewSet):
    serializer_class = HouseholdMemberSerializer
    is_private = True

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return HouseholdMember.objects.none()
        return HouseholdMember.objects.filter(household__owner=self.request.user)


class IngredientPriceViewSet(viewsets.ModelViewSet):
    serializer_class = IngredientPriceSerializer
    is_private = True
    filterset_fields = ('household', 'ingredient', 'is_current')

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return IngredientPrice.objects.none()
        return IngredientPrice.objects.filter(household__owner=self.request.user)


class PurchaseViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseSerializer
    is_private = True
    filterset_fields = ('household',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Purchase.objects.none()
        return Purchase.objects.filter(household__owner=self.request.user)

    @action(detail=True, methods=['get'])
    def breakdown(self, request, pk=None):
        purchase = self.get_object()
        cost_map = purchase.cost_per_person
        cost_per_person = [
            {
                'member': member.id,
                'name': member.name,
                'share': member.consumption_share,
                'amount': cost_map.get(member.id, Decimal('0.00')),
            }
            for member in purchase.household.members.all()
        ]
        return Response(
            {
                'total': purchase.total_cost,
                'cost_per_day': purchase.cost_per_day,
                'cost_per_person': cost_per_person,
                'shared_total': purchase.shared_total,
                'individual_total': purchase.individual_total,
            }
        )


class PurchaseItemViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseItemSerializer
    is_private = True
    filterset_fields = ('purchase',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return PurchaseItem.objects.none()
        return PurchaseItem.objects.filter(purchase__household__owner=self.request.user)


class RecipeViewSet(viewsets.ModelViewSet):
    serializer_class = RecipeSerializer
    is_private = True
    filterset_fields = ('household',)
    # wger fija DEFAULT_PARSER_CLASSES a solo JSON; los endpoints que
    # reciben un fichero (la foto de la receta) declaran sus propios
    # parsers, igual que hace wger.gallery.api.views.GalleryImageViewSet.
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Recipe.objects.none()
        return Recipe.objects.filter(household__owner=self.request.user)

    def create(self, request, *args, **kwargs):
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # `household` es un campo normal del serializer (no read_only), asi
        # que sin esto cualquiera podria crear una receta bajo el hogar de
        # otro con solo adivinar su id. Mismo patron que WeeklyPlanViewSet.
        get_object_or_404(Household, pk=household_id, owner=request.user)
        return super().create(request, *args, **kwargs)

    @action(detail=True, methods=['get'])
    def cost(self, request, pk=None):
        recipe = self.get_object()
        servings = recipe.servings or 1
        return Response(
            {
                'total_cost': recipe.total_cost,
                'cost_per_serving': recipe.cost_per_serving,
                'macros_per_serving': {
                    'energy': (recipe.energy / servings).quantize(Decimal('0.01')),
                    'protein': (recipe.protein / servings).quantize(Decimal('0.01')),
                    'carbohydrates': (recipe.carbohydrates / servings).quantize(Decimal('0.01')),
                    'fat': (recipe.fat / servings).quantize(Decimal('0.01')),
                },
            }
        )


class RecipeIngredientViewSet(viewsets.ModelViewSet):
    serializer_class = RecipeIngredientSerializer
    is_private = True
    filterset_fields = ('recipe',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return RecipeIngredient.objects.none()
        return RecipeIngredient.objects.filter(recipe__household__owner=self.request.user)

    def create(self, request, *args, **kwargs):
        recipe_id = request.data.get('recipe')
        if not recipe_id:
            return Response({'detail': 'recipe is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # Mismo motivo que en RecipeViewSet.create: `recipe` es escribible en
        # el serializer, sin esto se podria anadir un ingrediente a la receta
        # de otro con solo adivinar su id.
        get_object_or_404(Recipe, pk=recipe_id, household__owner=request.user)
        return super().create(request, *args, **kwargs)


class ShoppingListViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingListSerializer
    is_private = True
    filterset_fields = ('household',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ShoppingList.objects.none()
        # prefetch obligatorio: el serializer expone `trips`, que recorre las
        # lineas de cada lista. Sin esto, listar N listas hace N consultas.
        return ShoppingList.objects.filter(household__owner=self.request.user).prefetch_related(
            'items'
        )

    @action(detail=False, methods=['post'], url_path='from-nutrition')
    def from_nutrition(self, request):
        """
        Genera la lista de la compra a partir de los platos del plan de nutricion.

        Es el enlace que faltaba entre las dos mitades de la app: lo que el
        usuario apunta en Desayuno / Comida / Cena / Snacks es exactamente lo
        que hay que comprar, sin volver a teclearlo como receta.

        Cuerpo:
            household     (obligatorio) id del hogar
            plan          (opcional) id del plan de nutricion; por defecto, el
                          mas reciente del usuario
            start_date    (opcional) YYYY-MM-DD, por defecto hoy
            days          (opcional) 12 por defecto
            include_produce (opcional, true) anade fruta y verdura del dia a dia
            red_fruit     (opcional, true) incluye moras, fresas y arandanos
            freeze        (opcional) true/false fuerza congelar o no; sin este
                          campo lo decide la vida util de cada producto

        Devuelve la lista creada, con sus tandas.
        """
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        household = get_object_or_404(Household, pk=household_id, owner=request.user)

        plan_id = request.data.get('plan')
        if plan_id:
            plan = NutritionPlan.objects.filter(pk=plan_id, user=request.user).first()
        else:
            plan = NutritionPlan.objects.filter(user=request.user).order_by('-creation_date').first()
        if plan is None:
            return Response(
                {'detail': 'No nutrition plan found for this user.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            days = int(request.data.get('days', frescura.DIAS_POR_DEFECTO))
        except (TypeError, ValueError):
            return Response({'detail': 'days must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        if days <= 0 or days > 60:
            return Response(
                {'detail': 'days must be between 1 and 60.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_date = _parse_date(request.data.get('start_date')) or timezone.now().date()

        productos = productos_del_plan(str(plan.pk))
        if _flag(request.data, 'include_produce', True):
            productos = anadir_cesta(productos, fruta_roja=_flag(request.data, 'red_fruit', True))

        if not productos:
            return Response(
                {
                    'detail': (
                        'El plan de nutricion no tiene alimentos en sus comidas, '
                        'y no hay nada que comprar.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        congelar = request.data.get('freeze')
        if congelar is not None:
            congelar = _flag(request.data, 'freeze', True)

        lista = generar_lista(
            household=household,
            productos=productos,
            start_date=start_date,
            days=days,
            nombre=f'Compra de {days} dias desde {start_date.isoformat()}',
            nutrition_plan=str(plan.pk),
            congelar=congelar,
        )
        return Response(self.get_serializer(lista).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def coverage(self, request, pk=None):
        """
        Que hay comprado ya para una fecha, comida a comida.

        Lo consume la pantalla de Nutricion: al abrir el diario de un dia, cada
        plato puede decir si sus alimentos estan comprados, a medias o sin
        comprar, sin que el usuario tenga que ir a la pestana de Compra.

        Una linea de la lista cubre una fecha si esa fecha cae dentro de los
        dias que la tanda compra (`buy_date` incluido, `buy_date + days_covered`
        excluido).
        """
        lista = self.get_object()
        fecha = _parse_date(request.query_params.get('date')) or timezone.now().date()

        # Estado de compra de cada alimento en esa fecha. Un alimento puede
        # aparecer en varias tandas; la que manda es la que cubre la fecha.
        estado: dict[int, bool] = {}
        for item in lista.items.all():
            if item.ingredient_id is None or item.buy_date is None:
                continue
            fin = item.buy_date + timedelta(days=item.days_covered or 1)
            if item.buy_date <= fecha < fin:
                estado[item.ingredient_id] = item.purchased

        comidas = []
        if lista.nutrition_plan:
            for comida in Meal.objects.filter(plan_id=lista.nutrition_plan).order_by('order'):
                ingredientes = list(
                    MealItem.objects.filter(meal_id=comida.id).values_list('ingredient_id', flat=True)
                )
                conocidos = [i for i in ingredientes if i in estado]
                comprados = [i for i in conocidos if estado[i]]
                if not conocidos:
                    situacion = 'sin_datos'
                elif len(comprados) == len(conocidos):
                    situacion = 'comprado'
                elif comprados:
                    situacion = 'parcial'
                else:
                    situacion = 'pendiente'
                comidas.append(
                    {
                        'meal': str(comida.id),
                        'name': comida.name or f'Comida {comida.order}',
                        'status': situacion,
                        'total': len(conocidos),
                        'purchased': len(comprados),
                    }
                )

        return Response(
            {
                'date': fecha,
                'shopping_list': lista.id,
                'nutrition_plan': lista.nutrition_plan,
                'meals': comidas,
                'ingredients': [
                    {'ingredient': k, 'purchased': v} for k, v in sorted(estado.items())
                ],
            }
        )

    @action(detail=False, methods=['post'])
    def generate(self, request):
        household_id = request.data.get('household')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')
        recipe_ids = request.data.get('recipe_ids', [])

        if not household_id or not start_date or not end_date:
            return Response(
                {'detail': 'household, start_date and end_date are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        household = get_object_or_404(Household, pk=household_id, owner=request.user)

        shopping_list = ShoppingList.objects.create(
            household=household,
            name=f'Lista {start_date} - {end_date}',
            start_date=start_date,
            end_date=end_date,
        )

        aggregated = {}
        for recipe in Recipe.objects.filter(id__in=recipe_ids, household=household):
            for recipe_ingredient in recipe.ingredients.all():
                aggregated[recipe_ingredient.ingredient_id] = (
                    aggregated.get(recipe_ingredient.ingredient_id, Decimal('0'))
                    + recipe_ingredient.amount
                )

        for ingredient_id, amount in aggregated.items():
            price = (
                IngredientPrice.objects.filter(
                    household=household,
                    ingredient_id=ingredient_id,
                    is_current=True,
                )
                .order_by('-date')
                .first()
            )
            estimated_price = None
            if price is not None and price.price_per_100g is not None:
                estimated_price = (price.price_per_100g / Decimal('100') * amount).quantize(
                    Decimal('0.01')
                )
            # Sin `name` la linea sale en blanco en la app: el frontend pinta
            # item.name, no el nombre del ingrediente relacionado. Se copia
            # aqui para que la lista sea legible en el supermercado.
            ingrediente = Ingredient.objects.filter(pk=ingredient_id).first()
            nombre = ingrediente.name if ingrediente else ''
            if ingrediente is not None and ingrediente.brand:
                nombre = f'{ingrediente.name} ({ingrediente.brand})'

            ShoppingListItem.objects.create(
                shopping_list=shopping_list,
                ingredient_id=ingredient_id,
                name=nombre,
                amount=amount,
                unit=IngredientPrice.UNIT_GRAM,
                estimated_price=estimated_price,
            )

        serializer = self.get_serializer(shopping_list)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ShoppingListItemViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingListItemSerializer
    is_private = True
    filterset_fields = ('shopping_list',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ShoppingListItem.objects.none()
        return ShoppingListItem.objects.filter(shopping_list__household__owner=self.request.user)

    @action(detail=False, methods=['delete'], url_path='by-group/(?P<group_key>[^/.]+)')
    def by_group(self, request, group_key=None):
        """
        Quita un producto de TODA la lista de una vez: todas sus tandas
        (ver group_key en el modelo), no solo la fila que se toco.

        Una sola peticion atomica en vez de una por fila (el patron anterior,
        N DELETE seguidos desde el cliente): si el movil pierde la conexion a
        mitad, con N peticiones sueltas el producto queda a medio borrar en
        unas tandas si y en otras no. Con una transaccion, o se borra entero
        o no se borra nada.

        get_queryset ya filtra por el usuario que llama, asi que esto nunca
        toca lineas de un hogar ajeno aunque alguien adivine el group_key.
        """
        lineas = list(self.get_queryset().filter(group_key=group_key))
        if not lineas:
            return Response({'detail': 'Ese grupo no existe.'}, status=status.HTTP_404_NOT_FOUND)

        shopping_list_id = lineas[0].shopping_list_id
        with transaction.atomic():
            self.get_queryset().filter(group_key=group_key).delete()

        return Response(
            {'shopping_list': shopping_list_id, 'deleted': len(lineas)},
            status=status.HTTP_200_OK,
        )


# ----------------------------------------------------------------------------
# Datos que antes solo vivian en el localStorage del navegador (ver la tarea
# de sincronizacion entre PC, Android e iPhone del dueno). Todos comparten dos
# rasgos:
#
#   - get_queryset filtra SIEMPRE por el usuario que llama, igual que el resto
#     del modulo: nunca se expone una fila de otro usuario.
#   - `create()` hace un upsert (get_or_create + actualizar) en vez de fallar
#     con un IntegrityError si ya existia una fila para esa clave. El cliente
#     no tiene que acordarse de si ya mando este dato antes: manda lo que
#     tiene y el servidor decide crear o pisar. Esto es justo lo que hace
#     "ultima escritura gana" simple de implementar en el cliente.
# ----------------------------------------------------------------------------


class WaterLogViewSet(viewsets.ModelViewSet):
    """Agua bebida por dia. Un registro por (usuario, fecha); escribir el mismo dia lo actualiza."""

    serializer_class = WaterLogSerializer
    is_private = True
    filterset_fields = ('date',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return WaterLog.objects.none()
        return WaterLog.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        fecha = _parse_date(request.data.get('date'))
        if fecha is None:
            return Response(
                {'detail': 'date is required and must be YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance, _ = WaterLog.objects.get_or_create(user=request.user, date=fecha)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class WeightGoalViewSet(viewsets.ModelViewSet):
    """El objetivo de peso vigente del usuario. Uno solo: crear vuelve a escribir el mismo."""

    serializer_class = WeightGoalSerializer
    is_private = True

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return WeightGoal.objects.none()
        return WeightGoal.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        instance, _ = WeightGoal.objects.get_or_create(user=request.user)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class WeeklyPlanViewSet(viewsets.ModelViewSet):
    """El plan semanal vigente de un hogar. Uno solo: crear vuelve a escribir el mismo."""

    serializer_class = WeeklyPlanSerializer
    is_private = True
    filterset_fields = ('household',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return WeeklyPlan.objects.none()
        return WeeklyPlan.objects.filter(household__owner=self.request.user)

    def create(self, request, *args, **kwargs):
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # Solo un hogar del propio usuario puede recibir un plan: sin esto,
        # cualquiera podria escribir el plan semanal de un hogar ajeno con
        # solo adivinar su id.
        household = get_object_or_404(Household, pk=household_id, owner=request.user)
        instance = WeeklyPlan.objects.filter(household=household).first()
        if instance is None:
            for campo in ('start_date', 'end_date'):
                if not request.data.get(campo):
                    return Response(
                        {'detail': f'{campo} is required.'}, status=status.HTTP_400_BAD_REQUEST
                    )
            instance = WeeklyPlan(household=household)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class FavoriteIngredientViewSet(viewsets.ModelViewSet):
    """Alimentos marcados como favoritos por el usuario."""

    serializer_class = FavoriteIngredientSerializer
    is_private = True
    filterset_fields = ('ingredient',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return FavoriteIngredient.objects.none()
        return FavoriteIngredient.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        ingredient_id = request.data.get('ingredient')
        if not ingredient_id:
            return Response({'detail': 'ingredient is required.'}, status=status.HTTP_400_BAD_REQUEST)
        ingredient = get_object_or_404(Ingredient, pk=ingredient_id)
        # Marcar dos veces el mismo favorito no es un error: simplemente ya
        # estaba. Sin esto, el segundo POST desde otro dispositivo rompia con
        # un IntegrityError por la unicidad (usuario, ingrediente).
        instance, _ = FavoriteIngredient.objects.get_or_create(user=request.user, ingredient=ingredient)
        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class RecentIngredientViewSet(viewsets.ModelViewSet):
    """
    Ultimos alimentos usados por el usuario. Tope de MAX_RECIENTES, orden por
    fecha de uso: registrar uno que ya estaba lo sube al principio en vez de
    duplicarlo, e igual que en el cliente (ver recent_ingredient.py) se
    recorta lo mas viejo al pasarse del tope.
    """

    serializer_class = RecentIngredientSerializer
    is_private = True
    filterset_fields = ('ingredient',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return RecentIngredient.objects.none()
        return RecentIngredient.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        ingredient_id = request.data.get('ingredient')
        if not ingredient_id:
            return Response({'detail': 'ingredient is required.'}, status=status.HTTP_400_BAD_REQUEST)
        ingredient = get_object_or_404(Ingredient, pk=ingredient_id)
        instance, created = RecentIngredient.objects.get_or_create(user=request.user, ingredient=ingredient)
        if not created:
            # auto_now en updated_at hace el resto: guardar sin cambios ya
            # sube este registro al principio de la lista ordenada por fecha.
            instance.save()

        ids_a_conservar = list(
            RecentIngredient.objects.filter(user=request.user)
            .order_by('-updated_at')
            .values_list('id', flat=True)[:MAX_RECIENTES]
        )
        RecentIngredient.objects.filter(user=request.user).exclude(id__in=ids_a_conservar).delete()

        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkoutRescheduleViewSet(viewsets.ModelViewSet):
    """
    Intercambiar el entreno de una fecha con el de otra. Ver la nota completa
    en salaz/models/workout_reschedule.py: es un intercambio de dos mitades,
    no un mover a secas, y la rutina/dia de cada mitad se congelan en el
    momento de crear la fila (no se recalculan despues).

    Deshacer un movimiento es un DELETE normal sobre la fila: no hay un
    estado que cambiar, cada movimiento nuevo es su propia fila.
    """

    serializer_class = WorkoutRescheduleSerializer
    is_private = True

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return WorkoutReschedule.objects.none()
        return WorkoutReschedule.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        origen = _parse_date(request.data.get('origin_date'))
        destino = _parse_date(request.data.get('target_date'))
        if origen is None or destino is None:
            return Response(
                {'detail': 'origin_date and target_date are required and must be YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if origen == destino:
            return Response(
                {'detail': 'origin_date and target_date must be different.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Ninguna de las dos fechas puede estar ya metida en otro movimiento
        # activo, ni como origen ni como destino: las UniqueConstraint del
        # modelo solo cubren una columna cada una, esto cubre el cruce entre
        # las dos (una constraint de base de datos no puede comparar
        # origin_date de una fila nueva contra target_date de una existente).
        # Si una fecha ya esta movida, hay que deshacer esa fila primero.
        fechas = (origen, destino)
        ya_movida = WorkoutReschedule.objects.filter(user=request.user).filter(
            Q(origin_date__in=fechas) | Q(target_date__in=fechas)
        )
        if ya_movida.exists():
            return Response(
                {'detail': 'One of these dates is already part of another reschedule. Undo it first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkoutDaySkipViewSet(viewsets.ModelViewSet):
    """
    Marca una fecha como omitida a proposito (ver la nota completa en
    salaz/models/workout_day_skip.py sobre por que esto no es lo mismo que
    la ausencia de datos). Una sola fila por (usuario, fecha).
    """

    serializer_class = WorkoutDaySkipSerializer
    is_private = True
    filterset_fields = ('date',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return WorkoutDaySkip.objects.none()
        return WorkoutDaySkip.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        fecha = _parse_date(request.data.get('date'))
        if fecha is None:
            return Response(
                {'detail': 'date is required and must be YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Marcar dos veces la misma fecha no es un error: ya estaba omitida.
        instance, _ = WorkoutDaySkip.objects.get_or_create(user=request.user, date=fecha)
        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkoutSessionDraftViewSet(viewsets.ModelViewSet):
    """Progreso guardado de una sesion de entrenamiento aun sin terminar. Uno por (usuario, fecha)."""

    serializer_class = WorkoutSessionDraftSerializer
    is_private = True
    filterset_fields = ('date',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return WorkoutSessionDraft.objects.none()
        return WorkoutSessionDraft.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        fecha = _parse_date(request.data.get('date'))
        if fecha is None:
            return Response(
                {'detail': 'date is required and must be YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        instance, _ = WorkoutSessionDraft.objects.get_or_create(user=request.user, date=fecha)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class DeviceStateViewSet(viewsets.ModelViewSet):
    """
    Preferencias clave/valor que cruzan dispositivos (rutina activa, plan de
    nutricion activo). Ver la nota completa sobre "ultima escritura gana" en
    salaz/models/device_state.py.
    """

    serializer_class = DeviceStateSerializer
    is_private = True
    filterset_fields = ('key',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return DeviceState.objects.none()
        return DeviceState.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        key = request.data.get('key')
        if key not in dict(DeviceState.KEY_CHOICES):
            return Response({'detail': 'key must be one of rutina_activa, plan_activo.'}, status=status.HTTP_400_BAD_REQUEST)
        instance, _ = DeviceState.objects.get_or_create(user=request.user, key=key)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
