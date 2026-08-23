# Graph Report - C:/Proyectos/SalazFitness  (2026-08-23)

## Corpus Check
- Corpus is ~41,246 words - fits in a single context window. You may not need a graph.

## Summary
- 808 nodes · 1750 edges · 57 communities (37 shown, 20 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 118 edges (avg confidence: 0.6)
- Token cost: 217,266 input · 0 output

## Community Hubs (Navigation)
- Compra y coste (frontend)
- Nutricion y diario
- Perfil y progreso
- Dependencias npm
- API DRF del modulo salaz
- Kit de interfaz compartido
- Documentacion de arquitectura
- Autenticacion y cliente HTTP
- Tests de la API
- Config TypeScript de la app
- Rutinas y estructura de entreno
- Historial y evolucion
- Tests de modelos
- Config TypeScript de Node
- Identidad visual e iconos
- Modelos de precio y lista
- Modo gimnasio
- Modelo de receta
- Pantalla de hoy
- Modelo de compra
- Modelo de hogar
- Lineas de compra
- Generador de rutinas
- Configuracion del linter
- Fragmento 24
- Fragmento 25
- Fragmento 26
- Fragmento 27
- Fragmento 28
- Fragmento 29
- Fragmento 30
- Fragmento 31
- Fragmento 33
- Fragmento 34
- Fragmento 35
- Fragmento 36
- Fragmento 37
- Fragmento 38
- Fragmento 39
- Fragmento 40
- Fragmento 41
- Fragmento 42
- Fragmento 46
- Fragmento 47
- Fragmento 48
- Fragmento 49
- Fragmento 50
- Fragmento 51
- Fragmento 52
- Fragmento 53
- Fragmento 54
- Fragmento 55
- Fragmento 56

## God Nodes (most connected - your core abstractions)
1. `react` - 23 edges
2. `num()` - 23 edges
3. `IngredientPrice` - 20 edges
4. `fetchAll()` - 20 edges
5. `shortDate()` - 20 edges
6. `today()` - 20 edges
7. `Card()` - 19 edges
8. `SkeletonList()` - 19 edges
9. `ErrorState()` - 18 edges
10. `eurosACentimos()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `web/ — PWA React 19 + TypeScript + Vite + Tailwind v4` --conceptually_related_to--> `Comparativa PWA vs React Native vs Flutter`  [INFERRED]
  README.md → docs/ARQUITECTURA.md
- `Meta` --uses--> `IngredientPrice`  [INFERRED]
  backend/salaz/models/purchase_item.py → backend/salaz/models/ingredient_price.py
- `Meta` --uses--> `IngredientPrice`  [INFERRED]
  backend/salaz/models/recipe.py → backend/salaz/models/ingredient_price.py
- `SalazFitness` --references--> `Contrato de la API de wger`  [EXTRACTED]
  README.md → docs/API-CONTRACT.md
- `SalazFitness` --references--> `SalazFitness — Sistema de diseño`  [EXTRACTED]
  README.md → docs/DESIGN-SYSTEM.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Documentación citada en el README** — readme_salazfitness, docs_api_contract_doc, docs_arquitectura_doc, docs_design_system_doc [EXTRACTED 1.00]
- **Las tres piezas de la arquitectura** — docs_arquitectura_web_layer, docs_arquitectura_wger_layer, docs_arquitectura_salaz_module [EXTRACTED 1.00]
- **Flujo de autenticación JWT de wger** — docs_api_contract_auth_login, docs_api_contract_auth_refresh, docs_arquitectura_jwt_keys, docs_arquitectura_local_dev_extra [EXTRACTED 1.00]
- **Familia de iconos SalazFitness en distintos tamanos y formatos** — web_public_favicon_marca, web_public_apple_touch_icon_marca, web_public_icon_192_marca, web_public_icon_512_marca, web_public_icon_512_maskable_marca [INFERRED 0.90]
- **Set de iconos sociales solidos oscuros (bluesky, discord, github, x)** — web_public_icons_bluesky, web_public_icons_discord, web_public_icons_github, web_public_icons_x [INFERRED 0.85]
- **Activos con paleta morada ajena a la identidad SalazFitness (vite.svg, icons.svg, hero.png)** — web_src_assets_vite_logo, web_public_icons_sprite, web_src_assets_hero_ilustracion [INFERRED 0.65]

## Communities (57 total, 20 thin omitted)

### Community 0 - "Compra y coste (frontend)"
Cohesion: 0.06
Nodes (77): centimosAEur(), costeDiarioPorPersona(), costeIngredienteCentimos(), eurosACentimos(), PartePersona, repartirPartesIguales(), repartirProporcional(), repartoCompra() (+69 more)

### Community 1 - "Nutricion y diario"
Cohesion: 0.06
Nodes (69): Nutricion, RecetaFila(), ActualizarPlanInput, DiaryEntry, Ingredient, keys, MacroFuente, Macros (+61 more)

### Community 2 - "Perfil y progreso"
Cohesion: 0.06
Nodes (62): cacheNombresEjercicio, Measurement, MeasurementCategory, nombreDeEjercicio(), useAddWeightEntry(), useCreateMeasurement(), useCreateMeasurementCategory(), useExerciseNames() (+54 more)

### Community 3 - "Dependencias npm"
Cohesion: 0.04
Nodes (45): lucide-react, oxlint, react, react-dom, react-router-dom, recharts, tailwindcss, @tailwindcss/vite (+37 more)

### Community 4 - "API DRF del modulo salaz"
Cohesion: 0.17
Nodes (21): action, HouseholdMemberSerializer, HouseholdSerializer, IngredientPriceSerializer, Meta, PurchaseItemSerializer, PurchaseSerializer, RecipeIngredientSerializer (+13 more)

### Community 5 - "Kit de interfaz compartido"
Cohesion: 0.13
Nodes (29): btnSizes, btnVariants, Button(), ButtonProps, Card(), EmptyState(), ErrorState(), Field() (+21 more)

### Community 6 - "Documentacion de arquitectura"
Cohesion: 0.06
Nodes (37): POST /allauth/app/v1/auth/login, POST /allauth/app/v1/tokens/refresh, CORS_ORIGIN_ALLOW_ALL / CORS_URLS_REGEX, Contrato de la API de wger, Endpoints de ejercicios (/exercise/, /exerciseinfo/), Lo que NO existe en wger (agua, recetas, compra, objetivo de peso, precios), Endpoints de nutrición (/ingredient/, /nutritionplan/), web/src/lib/api.ts (cliente API, refresco de tokens) (+29 more)

### Community 7 - "Autenticacion y cliente HTTP"
Cohesion: 0.10
Nodes (28): App(), AppShell(), Compra, Destino, DESTINOS, Entreno, Hoy, LoginPage() (+20 more)

### Community 8 - "Tests de la API"
Cohesion: 0.07
Nodes (9): APITestCase, HouseholdApiTests, HouseholdMemberApiTests, make_ingredient(), PurchaseApiTests, Base test case that loads wger's reference data fixtures (see…, RecipeApiTests, SalazApiTestCase (+1 more)

### Community 9 - "Config TypeScript de la app"
Cohesion: 0.08
Nodes (23): DOM, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx (+15 more)

### Community 10 - "Rutinas y estructura de entreno"
Cohesion: 0.10
Nodes (21): Day, DayType, DiaSecuencia, ExerciseTranslation, Impression, NuevaSerie, NuevaSesion, Routine (+13 more)

### Community 11 - "Historial y evolucion"
Cohesion: 0.17
Nodes (17): fetchExerciseName(), useExerciseNames(), useRoutines(), useWorkoutLogsByExercise(), useWorkoutLogsBySession(), EjercicioEvolucionPage(), PuntoGrafica, HistorialPage() (+9 more)

### Community 12 - "Tests de modelos"
Cohesion: 0.11
Nodes (7): HouseholdMemberModelTests, make_ingredient(), Base test case that loads wger's own reference data fixtures. Creating a User…, RecipeModelTests, SalazTestCase, ShoppingListModelTests, TestCase

### Community 13 - "Config TypeScript de Node"
Cohesion: 0.10
Nodes (19): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+11 more)

### Community 14 - "Identidad visual e iconos"
Cohesion: 0.18
Nodes (17): Activos de plantilla sin personalizar a la identidad de marca (paleta ajena), Identidad de marca SalazFitness (rayo = energia/potencia, fondo azul marino oscuro), Paleta de color SalazFitness (#0A0E1A fondo, #C6F135 lima, #22D3EE cian), Icono Apple Touch (180x180) - rayo lima sobre fondo azul marino, Favicon SVG - marca SalazFitness (rayo + barra), fuente vectorial de los hex de marca, Icono PWA 192x192 - marca SalazFitness, Icono PWA 512x512 - marca SalazFitness, Icono PWA 512x512 maskable - marca SalazFitness (+9 more)

### Community 15 - "Modelos de precio y lista"
Cohesion: 0.19
Nodes (7): IngredientPrice, Meta, Normalize the price to a per-100g (or per-100ml) equivalent. Returns None when…, A price observation for an ingredient, as bought by a household., Meta, A single line item within a ShoppingList., ShoppingListItem

### Community 16 - "Modo gimnasio"
Cohesion: 0.24
Nodes (13): useCrearSesion(), useRegistrarSerie(), SerieRow(), SerieRowProps, borrarProgreso(), EjercicioProgreso, guardarProgreso(), key() (+5 more)

### Community 17 - "Modelo de receta"
Cohesion: 0.25
Nodes (4): Meta, Decimal, A recipe belonging to a household, used to plan meals and shopping lists., Recipe

### Community 18 - "Pantalla de hoy"
Cohesion: 0.25
Nodes (13): pickActiveRoutine(), useDateSequenceGym(), useWorkoutSessions(), cacheEnergiaIngrediente, DiaryLogItem, energiaDeIngrediente(), NutritionPlan, pickActivePlan() (+5 more)

### Community 19 - "Modelo de compra"
Cohesion: 0.19
Nodes (5): Meta, Purchase, Decimal, Returns {member_id: Decimal amount}, applying each member's consumption_share…, A single shopping trip for a household.

### Community 20 - "Modelo de hogar"
Cohesion: 0.18
Nodes (6): Household, Meta, Alias so this model satisfies WgerPermission's owner_object.user check., Used by wger.utils.permissions.WgerPermission for object-level access checks., Check that the consumption shares of all members of this household add up to…, A household (group of people sharing groceries and cooking).

### Community 21 - "Lineas de compra"
Cohesion: 0.22
Nodes (4): Meta, PurchaseItem, A single line item within a Purchase., PurchaseItemModelTests

### Community 22 - "Generador de rutinas"
Cohesion: 0.24
Nodes (4): Get-PesoSemana(), Invoke-WgerApi(), Show-Plan(), Update-Token()

### Community 23 - "Configuracion del linter"
Cohesion: 0.22
Nodes (8): oxc, typescript, warn, plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 24 - "Fragmento 24"
Cohesion: 0.25
Nodes (4): HouseholdMember, Meta, If no share was given, default to an equal split among the members of the…, A person belonging to a household. May or may not have a wger user account.

### Community 25 - "Fragmento 25"
Cohesion: 0.29
Nodes (4): Meta, Decimal, A shopping list for a household, covering a date range., ShoppingList

### Community 27 - "Fragmento 27"
Cohesion: 0.29
Nodes (6): react, BuscadorIngrediente(), Props, useBuscarIngredientesWger(), RestTimer(), RestTimerProps

### Community 30 - "Fragmento 30"
Cohesion: 0.33
Nodes (3): Meta, One ingredient line within a Recipe. Amount is always in grams., RecipeIngredient

### Community 31 - "Fragmento 31"
Cohesion: 0.47
Nodes (5): bolt_points(), main(), make_icon(), Genera los iconos de la PWA de SalazFitness. Marca: rayo de energia en lima…, Rayo estilizado, normalizado a un lienzo de 100x100 y escalado.

### Community 33 - "Fragmento 33"
Cohesion: 0.50
Nodes (3): AppConfig, App config for the salaz app (SalazFitness extras on top of wger)., SalazConfig

### Community 34 - "Fragmento 34"
Cohesion: 0.50
Nodes (4): Componente de botón, --color-danger (#F87171), --color-primary (#C6F135, lima eléctrica), Fila de serie (pantalla de entrenamiento)

### Community 35 - "Fragmento 35"
Cohesion: 0.50
Nodes (4): Checklist de accesibilidad antes de dar por buena una pantalla, Iconos Lucide React, Sistema de movimiento (duraciones y curvas), Navegación (barra inferior móvil / lateral escritorio)

### Community 36 - "Fragmento 36"
Cohesion: 0.67
Nodes (3): GET /routine/{id}/date-sequence-gym/, Jerarquía Routine → Day → Slot → SlotEntry → configs, POST /workoutsession y /workoutlog

## Ambiguous Edges - Review These
- `Ilustracion hero - tarjeta 3D isometrica morada/blanca, sin paleta de marca` → `Identidad de marca SalazFitness (rayo = energia/potencia, fondo azul marino oscuro)`  [AMBIGUOUS]
  web/src/assets/hero.png · relation: conceptually_related_to

## Knowledge Gaps
- **202 isolated node(s):** `Migration`, `Meta`, `Meta`, `Meta`, `Meta` (+197 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Ilustracion hero - tarjeta 3D isometrica morada/blanca, sin paleta de marca` and `Identidad de marca SalazFitness (rayo = energia/potencia, fondo azul marino oscuro)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `react` connect `Fragmento 27` to `Compra y coste (frontend)`, `Nutricion y diario`, `Perfil y progreso`, `Kit de interfaz compartido`, `Autenticacion y cliente HTTP`, `Rutinas y estructura de entreno`, `Historial y evolucion`, `Modo gimnasio`, `Pantalla de hoy`, `Configuracion del linter`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `today()` connect `Nutricion y diario` to `Compra y coste (frontend)`, `Perfil y progreso`, `Rutinas y estructura de entreno`, `Historial y evolucion`, `Modo gimnasio`, `Pantalla de hoy`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `plugins` connect `Configuracion del linter` to `Fragmento 27`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `IngredientPrice` (e.g. with `Meta` and `PurchaseItem`) actually correct?**
  _`IngredientPrice` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Migration`, `Meta`, `Meta` to the rest of the system?**
  _202 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Compra y coste (frontend)` be split into smaller, more focused modules?**
  _Cohesion score 0.0642570281124498 - nodes in this community are weakly interconnected._