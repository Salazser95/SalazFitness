from django.urls import include, path
from rest_framework import routers

from salaz.api import views

router = routers.DefaultRouter()
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

urlpatterns = [
    path('api/v2/', include(router.urls)),
]
