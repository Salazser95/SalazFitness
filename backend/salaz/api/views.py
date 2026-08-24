from datetime import timedelta
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

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
from wger.nutrition.models import Ingredient


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
