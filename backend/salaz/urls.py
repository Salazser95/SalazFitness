from django.urls import include, path
from rest_framework import routers

from salaz.api import cuentas, views

router = routers.DefaultRouter()
router.register(r'salaz/account', cuentas.AccountViewSet, basename='salaz-account')
router.register(r'salaz/household', views.HouseholdViewSet, basename='salaz-household')
router.register(
    r'salaz/household-member',
    views.HouseholdMemberViewSet,
    basename='salaz-household-member',
)
router.register(
    r'salaz/ingredient-price',
    views.IngredientPriceViewSet,
    basename='salaz-ingredient-price',
)
router.register(r'salaz/pantry-item', views.PantryItemViewSet, basename='salaz-pantry-item')
router.register(r'salaz/purchase', views.PurchaseViewSet, basename='salaz-purchase')
router.register(r'salaz/purchase-item', views.PurchaseItemViewSet, basename='salaz-purchase-item')
router.register(r'salaz/recipe', views.RecipeViewSet, basename='salaz-recipe')
router.register(
    r'salaz/recipe-ingredient',
    views.RecipeIngredientViewSet,
    basename='salaz-recipe-ingredient',
)
router.register(r'salaz/shopping-list', views.ShoppingListViewSet, basename='salaz-shopping-list')
router.register(
    r'salaz/shopping-list-item',
    views.ShoppingListItemViewSet,
    basename='salaz-shopping-list-item',
)
router.register(r'salaz/water-log', views.WaterLogViewSet, basename='salaz-water-log')
router.register(r'salaz/weight-goal', views.WeightGoalViewSet, basename='salaz-weight-goal')
router.register(r'salaz/weekly-plan', views.WeeklyPlanViewSet, basename='salaz-weekly-plan')
router.register(
    r'salaz/favorite-ingredient',
    views.FavoriteIngredientViewSet,
    basename='salaz-favorite-ingredient',
)
router.register(
    r'salaz/recent-ingredient',
    views.RecentIngredientViewSet,
    basename='salaz-recent-ingredient',
)
router.register(
    r'salaz/workout-reschedule',
    views.WorkoutRescheduleViewSet,
    basename='salaz-workout-reschedule',
)
router.register(
    r'salaz/workout-day-skip',
    views.WorkoutDaySkipViewSet,
    basename='salaz-workout-day-skip',
)
router.register(
    r'salaz/workout-session-draft',
    views.WorkoutSessionDraftViewSet,
    basename='salaz-workout-session-draft',
)
router.register(r'salaz/device-state', views.DeviceStateViewSet, basename='salaz-device-state')

urlpatterns = [
    path('api/v2/', include(router.urls)),
]
