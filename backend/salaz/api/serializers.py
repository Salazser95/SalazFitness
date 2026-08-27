from rest_framework import serializers

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
    WorkoutSessionDraft,
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


class TripSerializer(serializers.Serializer):
    """Resumen de una tanda de compra. Solo lectura, lo calcula el modelo."""

    trip = serializers.IntegerField()
    buy_date = serializers.DateField(allow_null=True)
    items = serializers.IntegerField()
    purchased = serializers.IntegerField()
    estimated_total = serializers.DecimalField(max_digits=10, decimal_places=2)
    done = serializers.BooleanField()


class ShoppingListSerializer(serializers.ModelSerializer):
    estimated_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    trips = TripSerializer(many=True, read_only=True)

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
            'nutrition_plan',
            'days',
            'trips',
        ]
        read_only_fields = ['id', 'created']


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
            'category',
            'shelf_life_days',
            'trip',
            'buy_date',
            'days_covered',
            'freeze_on_arrival',
            'source',
            'note',
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        """
        Una linea creada a mano desde la app llega sin categoria ni vida util.
        Se rellenan aqui a partir del nombre para que agrupe y avise igual que
        las que genera el endpoint de nutricion.
        """
        item = ShoppingListItem(**validated_data)
        if not item.category:
            item.aplicar_frescura(item.shopping_list.days or 0)
        item.save()
        return item


# --------------------------------------------------------------------------
# Datos que antes solo vivian en localStorage (ver la tarea de sincronizacion
# entre PC, Android e iPhone). Todos exponen `updated_at` en solo lectura:
# es la pieza que deja decidir "ultima escritura gana" al cliente, ver la nota
# en salaz/models/device_state.py.
# --------------------------------------------------------------------------


class WaterLogSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = WaterLog
        fields = ['id', 'user', 'date', 'milliliters', 'updated_at']
        read_only_fields = ['id', 'user', 'updated_at']


class WeightGoalSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = WeightGoal
        fields = ['id', 'user', 'goal_type', 'target_weight', 'target_date', 'updated_at']
        read_only_fields = ['id', 'user', 'updated_at']


class WeeklyPlanSerializer(serializers.ModelSerializer):
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = WeeklyPlan
        fields = [
            'id',
            'household',
            'start_date',
            'end_date',
            'selection',
            'by_day',
            'ingredient_origins',
            'updated_at',
        ]
        read_only_fields = ['id', 'household', 'updated_at']


class FavoriteIngredientSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = FavoriteIngredient
        fields = ['id', 'user', 'ingredient', 'created', 'updated_at']
        read_only_fields = ['id', 'user', 'created', 'updated_at']


class RecentIngredientSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = RecentIngredient
        fields = ['id', 'user', 'ingredient', 'updated_at']
        read_only_fields = ['id', 'user', 'updated_at']


class WorkoutSessionDraftSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = WorkoutSessionDraft
        fields = ['id', 'user', 'date', 'content', 'updated_at']
        read_only_fields = ['id', 'user', 'updated_at']


class DeviceStateSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = DeviceState
        fields = ['id', 'user', 'key', 'value', 'updated_at']
        read_only_fields = ['id', 'user', 'updated_at']
