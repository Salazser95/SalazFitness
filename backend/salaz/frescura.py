"""
Cuanto aguanta cada alimento y como se reparte en tandas de compra.

El problema real: una lista de 12 dias generada de golpe manda comprar 12 dias
de moras. Las moras aguantan 2-3 dias en la nevera. A partir del cuarto dia lo
comprado se tira, y el coste por dia que calcula el modulo de compra deja de
parecerse a lo que se gasta de verdad.

La solucion es no tratar la lista como una sola compra: los productos secos y
los congelados se compran una vez para todo el periodo, y lo fresco se reparte
en varias tandas ("compra pequena") con su fecha, cada una cubriendo solo los
dias que aguanta.

Los datos de vida util son para nevera a 4 grados y producto sin abrir, salvo
donde la nota diga otra cosa. Estan pensados para el surtido de Mercadona, que
es donde se compra: por eso hay entradas para formatos concretos (yogur natural
en pack, bandeja de moras, bolsa de espinacas) y no solo para categorias.
"""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass


# Categorias. Sirven para agrupar la lista por pasillo y para decidir el icono
# en la app, no solo para la frescura.
DESPENSA = 'despensa'
CONGELADO = 'congelado'
LACTEO = 'lacteo'
FRUTA = 'fruta'
FRUTA_DELICADA = 'fruta_delicada'
VERDURA = 'verdura'
CARNE = 'carne'
PESCADO = 'pescado'
HUEVOS = 'huevos'
PANADERIA = 'panaderia'

CATEGORIAS = [
    DESPENSA,
    CONGELADO,
    LACTEO,
    FRUTA,
    FRUTA_DELICADA,
    VERDURA,
    CARNE,
    PESCADO,
    HUEVOS,
    PANADERIA,
]

# Una compra de 12 dias es lo que pidio el usuario. Se usa por defecto en el
# endpoint y aqui como referencia del horizonte tipico.
DIAS_POR_DEFECTO = 12

# Por debajo de esto un producto se considera fresco y se reparte en tandas.
# 12 dias justos entrarian en una sola compra de 12 dias, asi que el umbral es
# el propio horizonte; este valor solo marca que es "fresco" a efectos de aviso.
UMBRAL_FRESCO_DIAS = 15


@dataclass(frozen=True)
class PerfilFrescura:
    """Cuanto dura un alimento y como conviene comprarlo."""

    categoria: str
    #: Dias que aguanta en la nevera desde el dia de la compra.
    dias: int
    #: Dias que aguanta si se congela al llegar a casa. None = no congelar.
    dias_congelado: int | None
    #: True si conviene comprarlo poco y a menudo en vez de todo de una vez.
    compra_pequena: bool
    nota: str = ''

    def dias_utiles(self, congelar: bool = False) -> int:
        """Vida util efectiva segun se guarde en nevera o en el congelador."""
        if congelar and self.dias_congelado:
            return self.dias_congelado
        return self.dias

    @property
    def es_fresco(self) -> bool:
        return self.dias < UMBRAL_FRESCO_DIAS


PERFIL_POR_DEFECTO = PerfilFrescura(
    categoria=DESPENSA,
    dias=365,
    dias_congelado=None,
    compra_pequena=False,
    nota='Sin fecha corta conocida: se compra una vez para todo el periodo.',
)


# Orden IMPORTA: gana la primera entrada cuyo patron case con el nombre, asi
# que lo especifico va antes que lo generico ('yogur griego' antes que 'yogur',
# 'pan de molde' antes que 'pan'). Los patrones se escriben en singular, sin
# acentos y en minusculas: `_casa` ya se encarga del plural y de las tildes.
_CATALOGO: list[tuple[tuple[str, ...], PerfilFrescura]] = [
    # ---------------------------------------------------------- congelados
    (
        ('congelado', 'congelada', 'ultracongelado', 'hacendado congelad'),
        PerfilFrescura(CONGELADO, 180, 180, False, 'Del congelador a casa sin romper el frio.'),
    ),
    # ------------------------------------------------- fruta muy delicada
    # Lo que el usuario compra y se le estropea: moras, fresas, frambuesas.
    (
        ('mora', 'moras rojas', 'moras negras', 'frambuesa', 'grosella', 'zarzamora'),
        PerfilFrescura(
            FRUTA_DELICADA,
            dias=3,
            dias_congelado=90,
            compra_pequena=True,
            nota='Bandeja pequena. Aguanta 2-3 dias en nevera; si no se van a comer en ese plazo, al congelador el mismo dia.',
        ),
    ),
    (
        ('fresa', 'fresas', 'fresón', 'freson'),
        PerfilFrescura(
            FRUTA_DELICADA,
            dias=3,
            dias_congelado=90,
            compra_pequena=True,
            nota='Se pica enseguida. Sin lavar hasta el momento de comerla, y al congelador lo que sobre.',
        ),
    ),
    (
        ('arandano', 'mirtilo'),
        PerfilFrescura(FRUTA_DELICADA, 6, 90, True, 'Aguanta algo mas que la mora, pero tambien poco.'),
    ),
    (
        ('higo', 'cereza', 'picota', 'nispero', 'albaricoque', 'paraguayo'),
        PerfilFrescura(FRUTA_DELICADA, 4, 90, True, 'Fruta de hueso delicada.'),
    ),
    # ----------------------------------------------------------- fruta
    (('platano', 'banana'), PerfilFrescura(FRUTA, 6, 60, False, 'Madura rapido fuera de la nevera.')),
    (('aguacate',), PerfilFrescura(FRUTA, 5, None, True, 'Comprar unos verdes y otros maduros para escalonarlos.')),
    (('melocoton', 'nectarina', 'ciruela', 'uva', 'kiwi', 'pera'), PerfilFrescura(FRUTA, 8, 60, False, '')),
    (('sandia', 'melon', 'pina'), PerfilFrescura(FRUTA, 8, None, False, 'Entera aguanta; una vez abierta, 3 dias.')),
    (('manzana', 'naranja', 'mandarina', 'pomelo', 'limon'), PerfilFrescura(FRUTA, 21, None, False, 'Fruta resistente: entra entera en una compra de 12 dias.')),
    # ---------------------------------------------------------- verdura
    (
        ('espinaca', 'rucula', 'canonigo', 'lechuga', 'ensalada', 'brote', 'acelga', 'berro'),
        PerfilFrescura(VERDURA, 5, 90, True, 'Hoja verde: se pocha en una semana. Bolsa pequena.'),
    ),
    (('champinon', 'seta', 'portobello'), PerfilFrescura(VERDURA, 5, 90, True, '')),
    (('tomate', 'pepino', 'calabacin', 'pimiento', 'berenjena', 'esparrago', 'judia verde'), PerfilFrescura(VERDURA, 8, 90, False, '')),
    (('brocoli', 'coliflor', 'repollo', 'berza', 'puerro', 'apio'), PerfilFrescura(VERDURA, 9, 120, False, '')),
    (('zanahoria', 'cebolla', 'patata', 'boniato', 'ajo', 'calabaza', 'remolacha'), PerfilFrescura(VERDURA, 25, 120, False, 'Verdura de raiz: aguanta toda la quincena.')),
    # ----------------------------------------------------------- lacteos
    (('yogur griego', 'yogur proteina', 'yogur proteinas', 'skyr'), PerfilFrescura(LACTEO, 21, None, False, 'Caduca lejos: entra entero en la compra grande.')),
    (('yogur', 'kefir', 'cuajada'), PerfilFrescura(LACTEO, 18, None, False, 'Mirar la fecha del pack: suele dar de sobra para 12 dias.')),
    (('leche fresca', 'leche del dia'), PerfilFrescura(LACTEO, 5, None, True, 'La fresca dura poco; la UHT no.')),
    (('leche',), PerfilFrescura(LACTEO, 120, None, False, 'UHT sin abrir. Abierta, 4 dias.')),
    (('queso fresco', 'burgos', 'mozzarella', 'requeson', 'ricotta'), PerfilFrescura(LACTEO, 10, None, False, '')),
    (('queso', 'mantequilla', 'nata'), PerfilFrescura(LACTEO, 30, 90, False, '')),
    # ------------------------------------------------------------ huevos
    (('huevo',), PerfilFrescura(HUEVOS, 25, None, False, 'Aguantan de sobra los 12 dias.')),
    # ------------------------------------------------------- carne y pescado
    (('pollo', 'pavo', 'pechuga'), PerfilFrescura(CARNE, 3, 120, True, 'Fresco 2-3 dias. Lo que no se cocine el mismo dia, al congelador en raciones.')),
    (('ternera', 'vacuno', 'buey', 'cordero', 'conejo', 'carne picada', 'filete'), PerfilFrescura(CARNE, 3, 120, True, 'Igual que el pollo: congelar en raciones el dia de la compra.')),
    (('salmon', 'merluza', 'bacalao', 'atun fresco', 'lubina', 'dorada', 'pescado', 'gamba', 'langostino'), PerfilFrescura(PESCADO, 2, 120, True, 'Lo mas delicado de la compra: 1-2 dias en nevera.')),
    (('jamon cocido', 'pavo lonchas', 'fiambre', 'lonchas'), PerfilFrescura(CARNE, 7, 60, False, 'Abierto, una semana.')),
    (('jamon serrano', 'chorizo', 'salchichon', 'cecina'), PerfilFrescura(CARNE, 30, 90, False, '')),
    (('atun lata', 'atun en aceite', 'conserva', 'lata'), PerfilFrescura(DESPENSA, 365, None, False, '')),
    (('tofu', 'seitan', 'tempeh'), PerfilFrescura(LACTEO, 10, 90, False, '')),
    # -------------------------------------------------------- panaderia
    (('pan de molde', 'pan bimbo', 'pan integral molde'), PerfilFrescura(PANADERIA, 10, 60, False, '')),
    (('pan', 'barra', 'chapata', 'baguette'), PerfilFrescura(PANADERIA, 2, 60, True, 'Del dia. Congelar en rebanadas si es para toda la quincena.')),
    (('tortita', 'tortilla de trigo', 'wrap'), PerfilFrescura(PANADERIA, 30, 60, False, '')),
    # --------------------------------------------------------- despensa
    (('arroz', 'pasta', 'macarron', 'espagueti', 'cuscus', 'quinoa', 'avena', 'copos'), PerfilFrescura(DESPENSA, 365, None, False, '')),
    (('lenteja', 'garbanzo', 'alubia', 'judia blanca', 'legumbre'), PerfilFrescura(DESPENSA, 365, None, False, '')),
    (('aceite', 'vinagre', 'sal', 'azucar', 'harina', 'especia', 'salsa'), PerfilFrescura(DESPENSA, 365, None, False, '')),
    (('almendra', 'nuez', 'nueces', 'anacardo', 'cacahuete', 'pistacho', 'frutos secos'), PerfilFrescura(DESPENSA, 180, None, False, '')),
    (('proteina', 'whey', 'creatina', 'suplemento', 'batido'), PerfilFrescura(DESPENSA, 365, None, False, '')),
    (('chocolate', 'cacao', 'miel', 'mermelada', 'crema de cacahuete'), PerfilFrescura(DESPENSA, 240, None, False, '')),
]


def _palabras(texto: str) -> list[str]:
    """Nombre partido en palabras, en minusculas y sin acentos."""
    sin_tildes = unicodedata.normalize('NFD', texto or '')
    sin_tildes = ''.join(c for c in sin_tildes if unicodedata.category(c) != 'Mn')
    return [p for p in re.split(r'[^0-9a-z]+', sin_tildes.lower()) if p]


def normalizar_nombre(texto: str) -> str:
    """El nombre en minusculas, sin acentos y con un solo espacio entre palabras."""
    return ' '.join(_palabras(texto))


def _misma_palabra(palabra: str, patron: str) -> bool:
    """Igual salvo el plural: 'moras' casa con 'mora', 'espinacas' con 'espinaca'."""
    return palabra in (patron, f'{patron}s', f'{patron}es')


def _casa(palabras: list[str], patron: str) -> bool:
    """
    True si el patron aparece en el nombre como palabra o secuencia de palabras.

    Se compara palabra a palabra y NO por subcadena: buscando 'pina' dentro de
    'espinacas frescas' hay coincidencia de texto, y por ahi las espinacas
    salian clasificadas como pina (8 dias de vida en vez de 5). Con este
    emparejado 'judia verde' sigue casando con 'judias verdes' y 'pan' deja de
    casar con 'panceta'.
    """
    objetivo = _palabras(patron)
    if not objetivo or len(objetivo) > len(palabras):
        return False
    for inicio in range(len(palabras) - len(objetivo) + 1):
        if all(_misma_palabra(palabras[inicio + i], objetivo[i]) for i in range(len(objetivo))):
            return True
    return False


def perfil_para(nombre: str) -> PerfilFrescura:
    """
    Perfil de frescura de un alimento por su nombre.

    Gana la primera coincidencia del catalogo (ver la nota de orden alli). Lo
    que no aparece se trata como despensa: es el supuesto seguro, porque como
    mucho manda comprar de mas una sola vez, no manda tirar comida.
    """
    palabras = _palabras(nombre)
    if not palabras:
        return PERFIL_POR_DEFECTO
    for patrones, perfil in _CATALOGO:
        if any(_casa(palabras, patron) for patron in patrones):
            return perfil
    return PERFIL_POR_DEFECTO


#: Mas de esto son demasiados viajes al super para un solo producto: a partir
#: de aqui compensa congelar (si el producto lo admite) y comprar de una vez.
MAX_TANDAS_RAZONABLE = 4


@dataclass(frozen=True)
class Tanda:
    """Un trozo de la compra: que dia se compra y cuantos dias cubre."""

    #: 1 = la compra grande del primer dia; 2, 3... las reposiciones de fresco.
    indice: int
    #: Dias desde el inicio del periodo (0 = el primer dia).
    dia_offset: int
    dias_cubiertos: int
    #: Fraccion del total que toca comprar en esta tanda, 0-1.
    fraccion: float


def repartir_en_tandas(dias_totales: int, perfil: PerfilFrescura, congelar: bool = False) -> list[Tanda]:
    """
    Divide un periodo en tandas de compra segun lo que aguante el producto.

    Un producto de despensa da una sola tanda que cubre todo el periodo. Las
    moras, con 3 dias de vida, dan cuatro tandas en un periodo de 12: dias 0,
    3, 6 y 9, con la cuarta parte de la cantidad cada una.

    Con `congelar=True` se usa la vida util del congelador, asi que las moras
    vuelven a caber en una sola compra. Es lo que hace el usuario cuando compra
    fruta roja para toda la quincena.
    """
    dias_totales = max(1, int(dias_totales))
    vida = max(1, perfil.dias_utiles(congelar))

    if vida >= dias_totales:
        return [Tanda(indice=1, dia_offset=0, dias_cubiertos=dias_totales, fraccion=1.0)]

    numero = math.ceil(dias_totales / vida)
    tandas: list[Tanda] = []
    for i in range(numero):
        offset = i * vida
        cubre = min(vida, dias_totales - offset)
        tandas.append(
            Tanda(
                indice=i + 1,
                dia_offset=offset,
                dias_cubiertos=cubre,
                fraccion=cubre / dias_totales,
            )
        )
    return tandas


@dataclass(frozen=True)
class PlanTandas:
    """Como se compra un producto a lo largo del periodo."""

    tandas: list[Tanda]
    #: True si hay que meterlo en el congelador el dia que se compra.
    congelar: bool
    motivo: str


def planificar_compra(
    dias_totales: int,
    perfil: PerfilFrescura,
    congelar: bool | None = None,
    max_tandas: int = MAX_TANDAS_RAZONABLE,
) -> PlanTandas:
    """
    Decide en cuantas tandas se compra un producto, y si hay que congelarlo.

    `congelar=None` (lo normal) deja decidir aqui: se compra fresco mientras el
    numero de viajes al super sea razonable, y en cuanto se pasa de
    `max_tandas` se congela, que es justo lo que hace el usuario con la fruta
    roja y con el pollo. El pescado fresco, con 2 dias de vida, pedia seis
    compras en 12 dias; congelado se resuelve en una.

    `congelar=True` o `False` fuerza la decision, para cuando el usuario ya ha
    dicho en la app lo que quiere hacer con ese producto.
    """
    if congelar is True:
        return PlanTandas(
            repartir_en_tandas(dias_totales, perfil, congelar=True),
            True,
            'Al congelador el dia de la compra.',
        )

    en_fresco = repartir_en_tandas(dias_totales, perfil, congelar=False)
    if congelar is False or len(en_fresco) <= max_tandas or not perfil.dias_congelado:
        motivo = ''
        if len(en_fresco) > 1:
            motivo = f'{len(en_fresco)} compras pequenas: aguanta {perfil.dias} dias.'
        return PlanTandas(en_fresco, False, motivo)

    congelado = repartir_en_tandas(dias_totales, perfil, congelar=True)
    return PlanTandas(
        congelado,
        True,
        f'Fresco solo aguanta {perfil.dias} dias ({len(en_fresco)} viajes al super): se compra de una vez y se congela.',
    )


# --------------------------------------------------------------- fruta y verdura

@dataclass(frozen=True)
class ProductoCesta:
    """Un fresco que se anade a la lista aunque no salga de ninguna receta."""

    nombre: str
    #: Gramos por dia y persona.
    gramos_dia: int
    motivo: str


# El usuario pidio que la lista lleve fruta y verdura aunque el plan de
# nutricion no las tenga apuntadas plato a plato: son justo lo que no se
# registra en el diario y lo que falta luego en la nevera. Cantidades pensadas
# para las cinco raciones al dia, con la fruta roja en dosis pequena porque se
# estropea (ver el perfil de 'mora').
CESTA_FRUTA_VERDURA: list[ProductoCesta] = [
    ProductoCesta('Platano', 100, 'Fruta de diario, aguanta casi una semana.'),
    ProductoCesta('Manzana', 120, 'La fruta que mejor aguanta los 12 dias enteros.'),
    ProductoCesta('Naranja', 150, 'Resistente, entra entera en la compra grande.'),
    ProductoCesta('Moras', 40, 'Poca cantidad y en varias tandas: 2-3 dias de vida.'),
    ProductoCesta('Fresas', 60, 'Igual que las moras: bandeja pequena y a menudo.'),
    ProductoCesta('Arandanos', 40, 'Para el yogur. Aguanta algo mas que la mora.'),
    ProductoCesta('Tomate', 120, 'Ensalada y guarnicion.'),
    ProductoCesta('Calabacin', 120, 'Base de las guarniciones al horno.'),
    ProductoCesta('Brocoli', 100, 'Verdura de la cena, aguanta mas de una semana.'),
    ProductoCesta('Zanahoria', 80, 'De raiz: aguanta toda la quincena.'),
    ProductoCesta('Cebolla', 60, 'Base de los sofritos del batch cooking.'),
    ProductoCesta('Pimiento', 80, 'Al horno con el resto de la bandeja.'),
]

# Las tres frutas rojas del yogur. El usuario las quiere como opcion, no
# obligatorias: "moras rojas, negras y fresas o uno de los dos o ninguno".
FRUTA_ROJA = ('Moras', 'Fresas', 'Arandanos')


def cesta_fruta_verdura(fruta_roja: bool = True) -> list[ProductoCesta]:
    """La cesta de fresco, con o sin la fruta roja del yogur."""
    if fruta_roja:
        return list(CESTA_FRUTA_VERDURA)
    return [p for p in CESTA_FRUTA_VERDURA if p.nombre not in FRUTA_ROJA]
