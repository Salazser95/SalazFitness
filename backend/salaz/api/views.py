from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from salaz import frescura, tickets
from salaz.api.serializers import (
    DeviceStateSerializer,
    FavoriteIngredientSerializer,
    HouseholdMemberSerializer,
    HouseholdSerializer,
    IngredientPriceSerializer,
    PantryItemSerializer,
    PurchaseItemSerializer,
    PurchaseSerializer,
    ReceiptSerializer,
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
    PantryItem,
    Purchase,
    PurchaseItem,
    Receipt,
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


def _decimal_o_cero(valor) -> Decimal:
    """
    Un decimal del JSON del ticket, redondeado a dos cifras.

    El parser puede dar tres decimales en los pesos ('0.760 kg'), y los
    campos de PurchaseItem son de dos: sin cuantizar aqui, guardar depende
    del motor de base de datos (unos redondean y otros truncan). Un valor
    ilegible cuenta como cero en vez de reventar el volcado entero: el
    usuario revisa las lineas antes de confirmar.
    """
    try:
        return Decimal(str(valor)).quantize(Decimal('0.01'))
    except (TypeError, ValueError, ArithmeticError):
        return Decimal('0.00')


User = get_user_model()

#: Centinela para "no se mando link_username en esta peticion": distinto de
#: None, que aqui significa "desvincular a proposito" (ver _resolver_vinculo).
_SIN_CAMBIO = object()


def _acceso_hogar(user, prefijo: str = '') -> Q:
    """
    Filtro Q para "el usuario tiene acceso a este hogar": es el dueno, o es
    un HouseholdMember de ese hogar con su cuenta vinculada (`user` no nulo).

    `prefijo` es la ruta de campos hasta `household` en el modelo que se
    esta filtrando: vacio si el modelo tiene `household` como FK directa
    (Recipe, Purchase...), o algo como 'purchase__'/'recipe__' si household
    esta detras de otra FK (PurchaseItem, RecipeIngredient...).

    Todo QuerySet filtrado con esto necesita `.distinct()`: el OR fuerza un
    JOIN contra household_member incluso cuando la fila ya encaja por
    `owner`, y con mas de un miembro eso duplica filas.
    """
    return Q(**{f'{prefijo}household__owner': user}) | Q(**{f'{prefijo}household__members__user': user})


def _accesible_o_404(queryset, pk, user, prefijo: str = ''):
    """
    Como get_object_or_404, pero acepta tanto al dueno del hogar como a un
    miembro con la cuenta vinculada. Vale tanto para Household directamente
    (prefijo vacio, campos `owner`/`members__user`) como para un modelo que
    cuelga de un hogar (prefijo no vacio, ver _acceso_hogar).
    """
    if queryset.model is Household:
        condicion = Q(owner=user) | Q(members__user=user)
    else:
        condicion = _acceso_hogar(user, prefijo)
    return get_object_or_404(queryset.filter(condicion).distinct(), pk=pk)


def _resolver_vinculo(datos, instance=None):
    """
    Traduce `link_username` del cuerpo de la peticion al usuario real que
    hay que guardar en HouseholdMember.user, o a _SIN_CAMBIO si no se mando
    esa clave (para no tocar el vinculo que ya hubiera en un PATCH parcial).

    Solo se acepta un username exacto, nunca un id de usuario en crudo:
    aceptar un id dejaria vincular la cuenta de cualquiera con solo
    adivinarlo. Cadena vacia desvincula a proposito.

    `instance` es la fila que se esta editando (None al crear), para que
    comprobar "esa cuenta ya esta vinculada" no choque contra si misma al
    volver a guardar sin cambiar el vinculo.
    """
    if 'link_username' not in datos:
        return _SIN_CAMBIO
    username = str(datos.get('link_username') or '').strip()
    if not username:
        return None
    usuario = User.objects.filter(username__iexact=username, is_active=True).first()
    if usuario is None:
        raise ValidationError({'link_username': ['No existe ninguna cuenta activa con ese nombre de usuario.']})
    ya_vinculado = HouseholdMember.objects.filter(user=usuario)
    if instance is not None:
        ya_vinculado = ya_vinculado.exclude(pk=instance.pk)
    if ya_vinculado.exists():
        raise ValidationError({'link_username': ['Esa cuenta ya está vinculada a otro miembro.']})
    return usuario


class HouseholdViewSet(viewsets.ModelViewSet):
    """
    Un hogar es visible (listar, ver, /summary) tanto por su dueno como por
    cualquier miembro con la cuenta vinculada -- es la base de "hogar
    multiusuario": la pareja/companero de piso que se vincula ve el mismo
    hogar, no uno propio vacio. Renombrarlo o borrarlo sigue siendo solo
    cosa del dueno (ver perform_update/perform_destroy): dejar que un
    miembro cualquiera borrara el hogar entero seria demasiado poder para
    alguien que solo se anadio para compartir la compra.
    """

    serializer_class = HouseholdSerializer
    is_private = True

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Household.objects.none()
        user = self.request.user
        return Household.objects.filter(Q(owner=user) | Q(members__user=user)).distinct()

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.owner_id != self.request.user.id:
            raise PermissionDenied('Solo el dueño del hogar puede editarlo.')
        serializer.save()

    def perform_destroy(self, instance):
        if instance.owner_id != self.request.user.id:
            raise PermissionDenied('Solo el dueño del hogar puede eliminarlo.')
        instance.delete()

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
    """
    Lectura abierta a cualquiera con acceso al hogar (dueno o miembro
    vinculado): todos pueden ver quien mas hay. Anadir, editar o quitar un
    miembro -- y vincular o desvincular su cuenta -- sigue siendo solo cosa
    del dueno: es la unica gestion del hogar que no se comparte, para que un
    miembro no pueda quitar a otro (ni vincularse el sitio de alguien) sin
    que el dueno lo decida.
    """

    serializer_class = HouseholdMemberSerializer
    is_private = True

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return HouseholdMember.objects.none()
        return HouseholdMember.objects.filter(_acceso_hogar(self.request.user)).distinct()

    def create(self, request, *args, **kwargs):
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # Deliberadamente estricto (solo dueno, no _accesible_o_404): anadir
        # miembros es gestion del hogar, no dato compartido.
        get_object_or_404(Household, pk=household_id, owner=request.user)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # `link_username` no es un campo del modelo (se resuelve aparte a
        # `user`, ver _resolver_vinculo): sin quitarlo de validated_data,
        # ModelSerializer.create() se lo pasaria tal cual a
        # HouseholdMember.objects.create() y rompe con un TypeError.
        serializer.validated_data.pop('link_username', None)
        vinculo = _resolver_vinculo(request.data)
        serializer.save(user=None if vinculo is _SIN_CAMBIO else vinculo)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_update(self, serializer):
        if serializer.instance.household.owner_id != self.request.user.id:
            raise PermissionDenied('Solo el dueño del hogar puede editar a sus miembros.')
        serializer.validated_data.pop('link_username', None)
        vinculo = _resolver_vinculo(self.request.data, instance=serializer.instance)
        if vinculo is _SIN_CAMBIO:
            serializer.save()
        else:
            serializer.save(user=vinculo)

    def perform_destroy(self, instance):
        if instance.household.owner_id != self.request.user.id:
            raise PermissionDenied('Solo el dueño del hogar puede eliminar a sus miembros.')
        instance.delete()


class IngredientPriceViewSet(viewsets.ModelViewSet):
    serializer_class = IngredientPriceSerializer
    is_private = True
    filterset_fields = ('household', 'ingredient', 'is_current')

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return IngredientPrice.objects.none()
        return IngredientPrice.objects.filter(_acceso_hogar(self.request.user)).distinct()

    def create(self, request, *args, **kwargs):
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # Mismo motivo: `household` es escribible, sin esto se podria anadir
        # un precio al hogar de otro con solo adivinar su id. Dueno O
        # miembro vinculado: es un dato compartido, no gestion del hogar.
        _accesible_o_404(Household.objects.all(), household_id, request.user)
        return super().create(request, *args, **kwargs)


class PantryItemViewSet(viewsets.ModelViewSet):
    """
    Stock de despensa de un hogar: cuanto queda de cada producto. Dueno o
    miembro vinculado puede ver, anadir a mano, corregir la cantidad (segun
    se va gastando) o quitar una linea -- es un dato compartido del hogar,
    igual que las recetas o las listas de la compra, no gestion.

    Ademas de la gestion manual, PurchaseItemViewSet suma o resta aqui en
    automatico cuando se marca/desmarca o se borra una linea de compra ya
    marcada como comprada (ver _ajustar_despensa mas abajo).
    """

    serializer_class = PantryItemSerializer
    is_private = True
    filterset_fields = ('household',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return PantryItem.objects.none()
        return PantryItem.objects.filter(_acceso_hogar(self.request.user)).distinct()

    def create(self, request, *args, **kwargs):
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # Mismo motivo que en el resto del modulo: `household` es escribible,
        # sin esto se podria anadir una linea a la despensa de otro con solo
        # adivinar su id. Dueno O miembro vinculado.
        _accesible_o_404(Household.objects.all(), household_id, request.user)
        return super().create(request, *args, **kwargs)


def _buscar_linea_despensa(household, purchase_item):
    """La fila de PantryItem que representa el mismo producto que esta
    linea de compra: mismo ingrediente (o mismo nombre si no hay
    ingrediente) y misma unidad. Cantidades en unidades distintas del mismo
    producto (1 kg de arroz frente a 500 g) no se mezclan en una sola fila:
    seria falsear el stock en vez de sumarlo."""
    qs = PantryItem.objects.filter(household=household, unit=purchase_item.unit)
    if purchase_item.ingredient_id:
        qs = qs.filter(ingredient_id=purchase_item.ingredient_id)
    else:
        qs = qs.filter(ingredient__isnull=True, name=purchase_item.name)
    return qs.first()


def _ajustar_despensa(purchase_item, *, sumar: bool):
    """
    Suma (al marcar una linea de compra como comprada) o resta (al
    desmarcarla, o al borrarla si seguia marcada) su cantidad al stock de
    despensa del hogar, sin bajar nunca de cero.
    """
    household = purchase_item.purchase.household
    despensa = _buscar_linea_despensa(household, purchase_item)
    if despensa is None:
        if not sumar:
            return
        despensa = PantryItem(
            household=household,
            ingredient_id=purchase_item.ingredient_id,
            name=purchase_item.name,
            unit=purchase_item.unit,
            amount=Decimal('0'),
        )
    delta = purchase_item.amount if sumar else -purchase_item.amount
    despensa.amount = max(Decimal('0'), despensa.amount + delta)
    despensa.save()


def _sincronizar_compra_real(item, *, comprado: bool):
    """
    Cuando se marca/desmarca como comprada una linea de una ShoppingList (la
    lista generada desde nutricion o desde recetas), crea o actualiza su
    reflejo real en Compras: una PurchaseItem, dentro de la Purchase que
    representa esa tanda de esa lista. Sin esto, "comprado" en la Lista se
    quedaba solo en un check que no contaba ni en Compras ni (por lo tanto,
    ver _ajustar_despensa) en la despensa.

    Volver a marcar la misma linea reutiliza siempre la misma PurchaseItem
    (uno a uno via shopping_list_item) en vez de duplicarla, y todas las
    lineas de la misma tanda de la misma lista comparten una unica Purchase
    (una por tanda, no una por linea).

    Desmarcar no borra la PurchaseItem ni la Purchase: solo pone
    purchased=False, igual que se haria a mano en Compras. La compra real ya
    hecha no se deshace solo porque se desmarque el check.
    """
    if comprado:
        purchase, _ = Purchase.objects.get_or_create(
            household=item.shopping_list.household,
            shopping_list=item.shopping_list,
            trip=item.trip,
            defaults={
                'date': item.buy_date or timezone.now().date(),
                'description': f'{item.shopping_list.name} - tanda {item.trip}',
                'covers_days': item.days_covered or 1,
            },
        )
        purchase_item, creada = PurchaseItem.objects.get_or_create(
            shopping_list_item=item,
            defaults={
                'purchase': purchase,
                'ingredient': item.ingredient,
                'name': item.name,
                'amount': item.amount,
                'unit': item.unit,
                'price': item.estimated_price or Decimal('0'),
                'purchased': True,
            },
        )
        if creada:
            _ajustar_despensa(purchase_item, sumar=True)
        elif not purchase_item.purchased:
            purchase_item.purchased = True
            purchase_item.save()
            _ajustar_despensa(purchase_item, sumar=True)
    else:
        purchase_item = PurchaseItem.objects.filter(shopping_list_item=item).first()
        if purchase_item is not None and purchase_item.purchased:
            purchase_item.purchased = False
            purchase_item.save()
            _ajustar_despensa(purchase_item, sumar=False)


class PurchaseViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseSerializer
    is_private = True
    filterset_fields = ('household',)

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Purchase.objects.none()
        return Purchase.objects.filter(_acceso_hogar(self.request.user)).distinct()

    def create(self, request, *args, **kwargs):
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # Mismo motivo: `household` es escribible, sin esto se podria crear
        # una compra bajo el hogar de otro con solo adivinar su id. Dueno O
        # miembro vinculado.
        _accesible_o_404(Household.objects.all(), household_id, request.user)
        return super().create(request, *args, **kwargs)

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
        return PurchaseItem.objects.filter(_acceso_hogar(self.request.user, 'purchase__')).distinct()

    def create(self, request, *args, **kwargs):
        purchase_id = request.data.get('purchase')
        if not purchase_id:
            return Response({'detail': 'purchase is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # `purchase` es escribible en el serializer: sin esto se podria
        # anadir una linea a la compra de otro con solo adivinar su id.
        # Dueno O miembro vinculado.
        _accesible_o_404(Purchase.objects.all(), purchase_id, request.user)
        return super().create(request, *args, **kwargs)

    def perform_update(self, serializer):
        # `serializer.instance` es la fila tal cual estaba en la base de
        # datos hasta este punto: ModelSerializer.save() la muta en el
        # mismo objeto Python, asi que hay que leer `purchased` ANTES de
        # guardar para saber si de verdad cambio (y no ajustar la despensa
        # dos veces si el cliente manda el mismo valor que ya tenia).
        estaba_comprado = serializer.instance.purchased
        serializer.save()
        si_ahora = serializer.instance.purchased
        if si_ahora != estaba_comprado:
            _ajustar_despensa(serializer.instance, sumar=si_ahora)

    def perform_destroy(self, instance):
        # Si la linea ya estaba marcada como comprada, borrarla sin
        # devolver su cantidad a la despensa dejaria stock fantasma.
        if instance.purchased:
            _ajustar_despensa(instance, sumar=False)
        instance.delete()


class ReceiptViewSet(viewsets.ModelViewSet):
    """
    Tickets de la compra subidos como foto. Ver la nota larga en
    salaz/models/receipt.py sobre el camino foto -> texto -> datos.

    Sobre la transcripcion automatica de la foto: hoy NO se hace aqui. El
    entorno no trae OCR (tesseract) ni una clave de API de vision, asi que
    el endpoint acepta el texto ya transcrito en `markdown` -- pegado o
    corregido a mano por el usuario. El resto de la cadena (analizar el
    texto, revisar, confirmar, volcar a compras y despensa) no depende de
    como se haya obtenido ese texto, asi que enchufar mas adelante un
    proveedor de vision u OCR es rellenar `markdown` antes de llamar a
    /analizar/, sin tocar nada de lo de aqui abajo.
    """

    serializer_class = ReceiptSerializer
    is_private = True
    filterset_fields = ('household', 'status')
    # Mismo motivo que en RecipeViewSet: wger fija los parsers a solo JSON y
    # aqui se sube un fichero.
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Receipt.objects.none()
        return Receipt.objects.filter(_acceso_hogar(self.request.user)).distinct()

    def create(self, request, *args, **kwargs):
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        _accesible_o_404(Household.objects.all(), household_id, request.user)
        return super().create(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def analizar(self, request, pk=None):
        """
        Pasa el texto del ticket por el parser y guarda el resultado para que
        el usuario lo revise. No toca compras ni despensa: eso es /confirmar/.

        Acepta `markdown` en el cuerpo para reemplazar la transcripcion en la
        misma llamada, que es el caso normal: se corrige una linea mal leida
        y se vuelve a analizar.
        """
        receipt = self.get_object()
        if receipt.status == Receipt.CONFIRMADO:
            return Response(
                {'detail': 'Este ticket ya está confirmado. Para rehacerlo, elimina antes su compra.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if 'markdown' in request.data:
            receipt.markdown = str(request.data.get('markdown') or '')

        if not receipt.markdown.strip():
            receipt.status = Receipt.ERROR
            receipt.error = 'No hay texto que analizar. Pega la transcripción del ticket.'
            receipt.parsed = {}
            receipt.save()
            return Response(self.get_serializer(receipt).data, status=status.HTTP_400_BAD_REQUEST)

        ticket = tickets.parsear_ticket(receipt.markdown)
        receipt.parsed = tickets.a_json(ticket)
        receipt.supermarket = ticket.supermarket
        receipt.date = ticket.date
        receipt.total = ticket.total
        if ticket.lines:
            receipt.status = Receipt.ANALIZADO
            receipt.error = ''
        else:
            # Sin lineas no hay nada que confirmar, pero el texto se conserva
            # para que el usuario lo corrija y lo vuelva a intentar.
            receipt.status = Receipt.ERROR
            receipt.error = 'No se ha reconocido ninguna línea de producto en el texto.'
        receipt.save()
        return Response(self.get_serializer(receipt).data)

    @action(detail=True, methods=['post'])
    def confirmar(self, request, pk=None):
        """
        Vuelca el ticket ya analizado a una compra real: crea la Purchase y
        sus lineas, casa lo que pueda contra la lista de la compra activa y
        deja que la despensa se ajuste por el mismo camino de siempre.

        Es idempotente: si el ticket ya tiene compra, devuelve la que hay sin
        crear otra. Confirmar es lo unico que mueve datos fuera del ticket,
        y por eso es un paso aparte de analizar.
        """
        receipt = self.get_object()
        if receipt.purchase_id:
            return Response(self.get_serializer(receipt).data)
        if receipt.status != Receipt.ANALIZADO:
            return Response(
                {'detail': 'Analiza el ticket antes de confirmarlo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lineas = receipt.parsed.get('lines') or []
        if not lineas:
            return Response(
                {'detail': 'El ticket no tiene líneas que volcar.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            purchase = Purchase.objects.create(
                household=receipt.household,
                date=receipt.date or timezone.now().date(),
                description=f'Ticket {receipt.supermarket}'.strip(),
                supermarket=receipt.supermarket,
            )

            pendientes = self._lineas_de_lista_pendientes(receipt.household)

            for linea in lineas:
                nombre = str(linea.get('name') or '').strip()
                item = PurchaseItem(
                    purchase=purchase,
                    name=nombre,
                    amount=_decimal_o_cero(linea.get('amount')),
                    unit=str(linea.get('unit') or 'unit'),
                    price=_decimal_o_cero(linea.get('total')),
                    purchased=True,
                )
                # Casar con la lista se hace por nombre normalizado (misma
                # funcion que usa el generador de listas): el ticket no trae
                # el id del producto, solo como lo imprime el supermercado.
                de_la_lista = pendientes.pop(frescura.normalizar_nombre(nombre), None)
                if de_la_lista is not None:
                    item.shopping_list_item = de_la_lista
                item.save()
                _ajustar_despensa(item, sumar=True)

                if de_la_lista is not None:
                    # Se marca por el ORM a proposito, NO por el ViewSet de la
                    # lista: pasar por ahi dispararia _sincronizar_compra_real
                    # y crearia una SEGUNDA compra para lo que ya acabamos de
                    # meter en esta, duplicando el gasto y la despensa.
                    de_la_lista.purchased = True
                    de_la_lista.save(update_fields=['purchased'])

            receipt.purchase = purchase
            receipt.status = Receipt.CONFIRMADO
            receipt.error = ''
            receipt.save()

        return Response(self.get_serializer(receipt).data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _lineas_de_lista_pendientes(household) -> dict:
        """
        Lo que aun esta por comprar en la lista activa del hogar, indexado por
        nombre normalizado, para casarlo con las lineas del ticket.

        Se excluyen las que ya tienen PurchaseItem enlazada: el enlace es uno
        a uno, y volver a usarla reventaria con un IntegrityError.
        """
        lista = ShoppingList.objects.filter(household=household).order_by('-created').first()
        if lista is None:
            return {}
        pendientes = {}
        for item in lista.items.filter(purchased=False, purchase_item__isnull=True):
            # El primero gana: si el mismo producto sale en varias tandas, la
            # compra de hoy solo cubre una de ellas.
            pendientes.setdefault(frescura.normalizar_nombre(item.name), item)
        return pendientes


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
        return Recipe.objects.filter(_acceso_hogar(self.request.user)).distinct()

    def create(self, request, *args, **kwargs):
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # `household` es un campo normal del serializer (no read_only), asi
        # que sin esto cualquiera podria crear una receta bajo el hogar de
        # otro con solo adivinar su id. Dueno O miembro vinculado.
        _accesible_o_404(Household.objects.all(), household_id, request.user)
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
        return RecipeIngredient.objects.filter(_acceso_hogar(self.request.user, 'recipe__')).distinct()

    def create(self, request, *args, **kwargs):
        recipe_id = request.data.get('recipe')
        if not recipe_id:
            return Response({'detail': 'recipe is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # Mismo motivo que en RecipeViewSet.create: `recipe` es escribible en
        # el serializer, sin esto se podria anadir un ingrediente a la receta
        # de otro con solo adivinar su id. Dueno O miembro vinculado.
        _accesible_o_404(Recipe.objects.all(), recipe_id, request.user)
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
        return (
            ShoppingList.objects.filter(_acceso_hogar(self.request.user))
            .distinct()
            .prefetch_related('items')
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
        household = _accesible_o_404(Household.objects.all(), household_id, request.user)

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

        household = _accesible_o_404(Household.objects.all(), household_id, request.user)

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
        return ShoppingListItem.objects.filter(
            _acceso_hogar(self.request.user, 'shopping_list__')
        ).distinct()

    def create(self, request, *args, **kwargs):
        shopping_list_id = request.data.get('shopping_list')
        if not shopping_list_id:
            return Response({'detail': 'shopping_list is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # `shopping_list` es escribible en el serializer y esto no tenia
        # ningun create() propio: sin esto se podia anadir una linea a la
        # lista de otro con solo adivinar su id (mismo hueco que ya se
        # cerro en Recipe/Purchase/etc., aqui se habia quedado sin tocar).
        _accesible_o_404(ShoppingList.objects.all(), shopping_list_id, request.user)
        return super().create(request, *args, **kwargs)

    def perform_update(self, serializer):
        # Mismo motivo que en PurchaseItemViewSet.perform_update:
        # `serializer.instance` todavia es el valor de antes de guardar en
        # este punto (ModelSerializer.save() lo muta en el mismo objeto), asi
        # que hay que leer `purchased` ANTES de guardar.
        estaba_comprado = serializer.instance.purchased
        serializer.save()
        si_ahora = serializer.instance.purchased
        if si_ahora != estaba_comprado:
            _sincronizar_compra_real(serializer.instance, comprado=si_ahora)

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
        return WeeklyPlan.objects.filter(_acceso_hogar(self.request.user)).distinct()

    def create(self, request, *args, **kwargs):
        household_id = request.data.get('household')
        if not household_id:
            return Response({'detail': 'household is required.'}, status=status.HTTP_400_BAD_REQUEST)
        # Solo un hogar accesible (dueno o miembro vinculado) puede recibir
        # un plan: sin esto, cualquiera podria escribir el plan semanal de
        # un hogar ajeno con solo adivinar su id.
        household = _accesible_o_404(Household.objects.all(), household_id, request.user)
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
