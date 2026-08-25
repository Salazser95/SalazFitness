from datetime import date, timedelta
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from salaz import frescura
from salaz.api.serializers import (
    HouseholdMemberSerializer,
    HouseholdSerializer,
    IngredientPriceSerializer,
    PurchaseItemSerializer,
    PurchaseSerializer,
    RecipeIngredientSerializer,
    RecipeSerializer,
    ShoppingListItemSerializer,
    ShoppingListSerializer,
)
from salaz.generador_lista import anadir_cesta, generar_lista, productos_del_plan
from salaz.models import (
    Household,
    HouseholdMember,
    IngredientPrice,
    Purchase,
    PurchaseItem,
    Recipe,
    RecipeIngredient,
    ShoppingList,
    ShoppingListItem,
)
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


class ShoppingListViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingListSerializer
    is_private = True
    filterset_fields = ('household',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return ShoppingList.objects.none()
        return ShoppingList.objects.filter(household__owner=self.request.user)

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
