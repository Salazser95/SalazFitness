import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ImagePlus, Plus, Trash2 } from 'lucide-react'

import { Button, Card, ErrorState, Field, PageTitle, SectionLabel, SkeletonList, Thumbnail } from '../../components/ui'
import { api } from '../../lib/api'
import { BuscadorIngrediente } from './componentes/BuscadorIngrediente'
import { RecetaIlustracion } from './componentes/RecetaIlustracion'
import {
  useActualizarIngredienteReceta,
  useActualizarReceta,
  useCrearIngredienteReceta,
  useCrearReceta,
  useEliminarIngredienteReceta,
  useHousehold,
  useRecipe,
  useRecipeIngredients,
  useSubirFotoReceta,
} from './datos'
import type { NuevoIngredienteReceta } from './datos'
import type { IngredientWger } from './tipos'

type IngredienteForm = {
  tempId: number
  /** Id real en el backend. Si falta, es una linea nueva que aun no existe. */
  id?: number
  ingredientId: number | null
  name: string
  amount: string
}

let contadorLocal = 0
function nuevoIngrediente(): IngredienteForm {
  contadorLocal += 1
  return { tempId: contadorLocal, ingredientId: null, name: '', amount: '' }
}

function ingredienteAPayload(l: IngredienteForm): NuevoIngredienteReceta {
  return {
    ingredient: l.ingredientId as number,
    amount: Number(String(l.amount).replace(',', '.')) || 0,
  }
}

/**
 * Nombre, raciones, instrucciones e ingredientes de una receta: crea una
 * nueva (ruta /compra/recetas/nueva, sin :id) o edita una ya existente.
 */
export default function RecetaFormulario() {
  const navigate = useNavigate()
  const { id: idParam } = useParams<{ id: string }>()
  const esNueva = !idParam
  const id = Number(idParam) || 0

  const receta = useRecipe(id)
  const ingredientesExistentes = useRecipeIngredients(id)
  const household = useHousehold()
  const crearReceta = useCrearReceta()
  const actualizar = useActualizarReceta()
  const crearIngrediente = useCrearIngredienteReceta()
  const actualizarIngrediente = useActualizarIngredienteReceta()
  const eliminarIngrediente = useEliminarIngredienteReceta()
  const subirFoto = useSubirFotoReceta()
  const inputFotoRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [servings, setServings] = useState('1')
  const [instructions, setInstructions] = useState('')
  const [ingredientes, setIngredientes] = useState<IngredienteForm[]>(() =>
    esNueva ? [nuevoIngrediente()] : [],
  )
  const [eliminados, setEliminados] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  // Una receta nueva no tiene nada que cargar del servidor: empieza lista.
  const [listo, setListo] = useState(esNueva)
  const cargadoRef = useRef(esNueva)

  // Precarga el formulario una sola vez, resolviendo el nombre de cada
  // ingrediente contra wger (RecipeIngredient solo guarda el id, no el
  // nombre). No se repite al refrescar para no pisar lo que el usuario
  // este escribiendo.
  useEffect(() => {
    if (cargadoRef.current) return
    if (!receta.data || !ingredientesExistentes.data) return
    let cancelado = false

    async function cargar() {
      setName(receta.data!.name)
      setServings(String(receta.data!.servings))
      setInstructions(receta.data!.instructions)

      const lista = ingredientesExistentes.data!
      if (lista.length === 0) {
        if (!cancelado) {
          setIngredientes([nuevoIngrediente()])
          cargadoRef.current = true
          setListo(true)
        }
        return
      }

      const conNombre = await Promise.all(
        lista.map(async (ri) => {
          let nombre = `Ingrediente #${ri.ingredient}`
          try {
            const info = await api.get<IngredientWger>(`/api/v2/ingredient/${ri.ingredient}/`)
            nombre = info.name
          } catch {
            /* si falla la busqueda del nombre, se deja el generico */
          }
          contadorLocal += 1
          return { tempId: contadorLocal, id: ri.id, ingredientId: ri.ingredient, name: nombre, amount: String(ri.amount) }
        }),
      )

      if (!cancelado) {
        setIngredientes(conNombre)
        cargadoRef.current = true
        setListo(true)
      }
    }

    cargar()
    return () => {
      cancelado = true
    }
  }, [receta.data, ingredientesExistentes.data])

  function actualizarLinea(tempId: number, cambios: Partial<IngredienteForm>) {
    setIngredientes((prev) => prev.map((l) => (l.tempId === tempId ? { ...l, ...cambios } : l)))
  }

  /**
   * La foto se sube al momento, en cuanto se elige el fichero (mismo patron
   * que FotosProgreso en features/yo/YoPage.tsx): la receta ya existe (este
   * formulario solo edita, nunca crea), asi que no hace falta esperar al
   * "Guardar cambios" de abajo, que solo manda nombre/raciones/instrucciones.
   */
  function onFotoElegida(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) subirFoto.mutate({ id, file })
    e.target.value = ''
  }

  function quitarLinea(tempId: number) {
    setIngredientes((prev) => {
      if (prev.length <= 1) return prev
      const linea = prev.find((l) => l.tempId === tempId)
      if (linea?.id) setEliminados((ids) => [...ids, linea.id!])
      return prev.filter((l) => l.tempId !== tempId)
    })
  }

  const guardando =
    crearReceta.isPending ||
    actualizar.isPending ||
    crearIngrediente.isPending ||
    actualizarIngrediente.isPending ||
    eliminarIngrediente.isPending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!esNueva && !receta.data) return
    if (esNueva && !household.data) return setError('No se ha podido determinar el hogar. Prueba otra vez.')
    if (!name.trim()) return setError('Falta el nombre de la receta.')
    if (ingredientes.some((l) => l.ingredientId === null)) {
      return setError('Hay ingredientes sin elegir de la lista (no se admite texto libre en recetas).')
    }
    if (ingredientes.some((l) => (Number(String(l.amount).replace(',', '.')) || 0) <= 0)) {
      return setError('Hay ingredientes sin cantidad.')
    }

    const datosBase = {
      name: name.trim(),
      servings: Math.max(1, Number(servings) || 1),
      instructions: instructions.trim(),
    }

    let recipeId = id
    if (esNueva) {
      const receta = await crearReceta.mutateAsync({ household: household.data!.id, ...datosBase })
      recipeId = receta.id
      // Todas las lineas son nuevas: no hay `id` que actualizar ni nada que borrar.
      await Promise.all(
        ingredientes.map((l) =>
          crearIngrediente.mutateAsync({ recipe: recipeId, ingrediente: ingredienteAPayload(l) }),
        ),
      )
    } else {
      await actualizar.mutateAsync({ id, cambios: datosBase })
      await Promise.all([
        ...ingredientes.map((l) =>
          l.id
            ? actualizarIngrediente.mutateAsync({ id: l.id, recipe: id, cambios: ingredienteAPayload(l) })
            : crearIngrediente.mutateAsync({ recipe: id, ingrediente: ingredienteAPayload(l) }),
        ),
        ...eliminados.map((ingredienteId) => eliminarIngrediente.mutateAsync({ id: ingredienteId, recipe: id })),
      ])
    }

    navigate(`/compra/recetas/${recipeId}`)
  }

  if (!esNueva && (receta.isLoading || ingredientesExistentes.isLoading || !listo)) {
    return <SkeletonList rows={4} height="h-14" />
  }
  if (!esNueva && (receta.isError || !receta.data)) {
    return <ErrorState onRetry={() => receta.refetch()} />
  }

  return (
    <div className="animate-rise">
      <PageTitle>{esNueva ? 'Nueva receta' : 'Editar receta'}</PageTitle>
      <form onSubmit={onSubmit} className="space-y-5">
        {esNueva ? null : (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Foto</SectionLabel>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => inputFotoRef.current?.click()}
              disabled={subirFoto.isPending}
            >
              <ImagePlus size={16} aria-hidden="true" />
              {subirFoto.isPending ? 'Subiendo...' : receta.data!.image ? 'Cambiar foto' : 'Subir foto'}
            </Button>
            <input
              ref={inputFotoRef}
              type="file"
              accept="image/*"
              onChange={onFotoElegida}
              className="hidden"
              aria-label="Elegir foto de la receta"
            />
          </div>
          {receta.data!.image ? (
            <Thumbnail src={receta.data!.image} alt={receta.data!.name} className="aspect-video" />
          ) : (
            <RecetaIlustracion className="aspect-video" iconSize={40} />
          )}
          {subirFoto.isError ? (
            <p className="text-sm text-danger">No se ha podido subir la foto. Inténtalo de nuevo.</p>
          ) : null}
        </Card>
        )}

        <Card className="space-y-4">
          <SectionLabel>Datos</SectionLabel>
          <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
          <Field
            label="Raciones"
            inputMode="numeric"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            required
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg-muted" htmlFor="instrucciones-receta">
              Instrucciones
            </label>
            <textarea
              id="instrucciones-receta"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              className="w-full rounded-[14px] border border-border bg-surface-2 px-4 py-3 text-fg placeholder:text-fg-subtle transition-colors focus:border-primary"
            />
          </div>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Ingredientes</SectionLabel>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIngredientes((p) => [...p, nuevoIngrediente()])}
            >
              <Plus size={16} aria-hidden="true" />
              Añadir ingrediente
            </Button>
          </div>

          {ingredientes.map((linea, i) => (
            <Card key={linea.tempId} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-fg-muted">{linea.name || `Ingrediente ${i + 1}`}</p>
                {ingredientes.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Quitar ingrediente ${i + 1}`}
                    onClick={() => quitarLinea(linea.tempId)}
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] text-fg-subtle hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <BuscadorIngrediente
                label="Alimento"
                valorInicial={linea.name}
                onSeleccionar={({ ingredientId, name: nombre }) =>
                  actualizarLinea(linea.tempId, { ingredientId, name: nombre })
                }
              />

              <Field
                label="Cantidad (g)"
                inputMode="decimal"
                value={linea.amount}
                onChange={(e) => actualizarLinea(linea.tempId, { amount: e.target.value })}
              />
            </Card>
          ))}
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {actualizar.isError ? <p className="text-sm text-danger">No se pudo guardar la receta.</p> : null}

        <div className="glass sticky bottom-20 flex items-center justify-end rounded-[16px] border border-border-strong p-4 lg:bottom-4">
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </div>
  )
}
