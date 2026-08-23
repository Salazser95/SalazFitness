from rest_framework import serializers

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


class HouseholdSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    shares_valid = serializers.SerializerMethodField()

    class Meta:
        model = Household
        fields = ['id', 'owner', 'name', 'created', 'shares_valid']
        read_only_fields = ['id', 'owner', 'created']

    def get_shares_valid(self, obj) -> bool:
        return obj.validate_shares()


class HouseholdMemberSerializer(serializers.ModelSerializer):
    consumption_share = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=0,
        max_value=100,
    )

    class Meta:
        model = HouseholdMember
        fields = ['id', 'household', 'name', 'user', 'consumption_share']


class IngredientPriceSerializer(serializers.ModelSerializer):
    price_per_100g = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = IngredientPrice
        fields = [
            'id',
            'ingredient',
            'household',
            'price',
            'amount',
            'unit',
            'supermarket',
            'date',
            'is_current',
            'price_per_100g',
        ]


class PurchaseSerializer(serializers.ModelSerializer):
    total_cost = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    cost_per_day = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Purchase
        fields = [
            'id',
            'household',
            'date',
            'description',
            'supermarket',
            'covers_days',
            'total_cost',
            'cost_per_day',
        ]


class PurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseItem
        fields = [
            'id',
            'purchase',
            'ingredient',
            'name',
            'amount',
            'unit',
            'price',
            'is_shared',
            'member',
        ]

    def validate(self, attrs):
        ingredient = attrs.get('ingredient', getattr(self.instance, 'ingredient', None))
        name = attrs.get('name', getattr(self.instance, 'name', ''))
        if not ingredient and not name:
            raise serializers.ValidationError('Either ingredient or name must be set.')
        return attrs


class RecipeSerializer(serializers.ModelSerializer):
    total_cost = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    cost_per_serving = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    energy = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    protein = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    carbohydrates = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    fat = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Recipe
        fields = [
            'id',
            'household',
            'name',
            'servings',
            'instructions',
            'image',
            'total_cost',
            'cost_per_serving',
            'energy',
            'protein',
            'carbohydrates',
            'fat',
        ]


class RecipeIngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecipeIngredient
        fields = ['id', 'recipe', 'ingredient', 'amount']


class ShoppingListSerializer(serializers.ModelSerializer):
    estimated_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = ShoppingList
        fields = [
            'id',
            'household',
            'name',
            'start_date',
            'end_date',
            'created',
            'estimated_total',
        ]


class ShoppingListItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShoppingListItem
        fields = [
            'id',
            'shopping_list',
            'ingredient',
            'name',
            'amount',
            'unit',
            'estimated_price',
            'purchased',
            'supermarket',
        ]
