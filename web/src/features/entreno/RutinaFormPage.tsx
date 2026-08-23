import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BedDouble, Pencil, Plus, Trash2 } from 'lucide-react'

import {
  Button,
  Card,
  ConfirmModal,
  ErrorState,
  Field,
  Modal,
  PageTitle,
  SectionLabel,
  SkeletonList,
} from '../../components/ui'
import { today } from '../../lib/format'
import {
  NOMBRE_DIA_MAX,
  NOMBRE_RUTINA_MAX,
  useAnadirEjercicioADia,
  useActualizarDia,
  useCrearDia,
  useCrearRutina,
  useEliminarDia,
  useEliminarEjercicioDeDia,
  useExerciseNames,
  useRoutine,
  useRoutineStructure,
  useActualizarRutina,
  type DayType,
  type EjercicioBuscable,
  type StructureDay,
} from './api'
import { ExercisePicker } from './components/ExercisePicker'

const TIPOS_DIA: { value: DayType; label: string }[] = [
  { value: 'custom', label: 'Personalizado' },
  { value: 'enom', label: 'EMOM' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'tabata', label: 'Tabata' },
  { value: 'edt', label: 'EDT' },
  { value: 'rft', label: 'RFT' },
  { value: 'afap', label: 'AFAP' },
]

function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00`)
  d.setDate(d.getDate() + dias)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// --------------------------------------------------------- formulario "nueva"

function FormularioNuevaRutina() {
  const navigate = useNavigate()
  const crear = useCrearRutina()
  const [name, setName] = useState('')
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(sumarDias(today(), 84))
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Ponle un nombre a la rutina.')
      return
    }
    if (end < start) {
      setError('La fecha de fin no puede ser anterior a la de inicio.')
      return
    }
    try {
      const rutina = await crear.mutateAsync({ name: name.trim(), start, end, fit_in_week: true })
      navigate(`/entreno/rutina/${rutina.id}/editar`, { replace: true })
    } catch {
      setError('No se ha podido crear la rutina. Prueba otra vez.')
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <Field
        label="Nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={NOMBRE_RUTINA_MAX}
        hint={`${name.length}/${NOMBRE_RUTINA_MAX} caracteres`}
        placeholder="Empuje Tiron Pierna"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Inicio"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <Field label="Fin" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" full disabled={crear.isPending}>
        {crear.isPending ? 'Creando...' : 'Crear rutina'}
      </Button>
    </form>
  )
}

// --------------------------------------------------------------- editar dias

function ModalAnadirDia({
  open,
  onClose,
  routineId,
  siguienteOrden,
}: {
  open: boolean
  onClose: () => void
  routineId: number
  siguienteOrden: number
}) {
  const crearDia = useCrearDia(routineId)
  const [name, setName] = useState('')
  const [tipo, setTipo] = useState<DayType>('custom')
  const [esDescanso, setEsDescanso] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await crearDia.mutateAsync({
      routine: routineId,
      name: name.trim() || (esDescanso ? 'Descanso' : `Dia ${siguienteOrden}`),
      type: tipo,
      is_rest: esDescanso,
      order: siguienteOrden,
    })
    setName('')
    setTipo('custom')
    setEsDescanso(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Anadir dia">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <Field
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NOMBRE_DIA_MAX}
          hint={`${name.length}/${NOMBRE_DIA_MAX} caracteres`}
          placeholder={esDescanso ? 'Descanso' : 'Pecho'}
        />
        <label className="flex h-11 items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={esDescanso}
            onChange={(e) => setEsDescanso(e.target.checked)}
            className="h-5 w-5 rounded border-border"
          />
          Es un dia de descanso
        </label>
        {!esDescanso ? (
          <div>
            <label htmlFor="tipo-dia" className="mb-1.5 block text-sm font-medium text-fg-muted">
              Tipo de dia
            </label>
            <select
              id="tipo-dia"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as DayType)}
              className="h-12 w-full rounded-[14px] border border-border bg-surface-2 px-4 text-fg focus:border-primary"
            >
              {TIPOS_DIA.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="submit" full disabled={crearDia.isPending}>
          {crearDia.isPending ? 'Anadiendo...' : 'Anadir dia'}
        </Button>
      </form>
    </Modal>
  )
}

function ModalEditarDia({
  dia,
  onClose,
  routineId,
}: {
  dia: StructureDay | null
  onClose: () => void
  routineId: number
}) {
  const actualizarDia = useActualizarDia(routineId)
  const [name, setName] = useState('')
  const [tipo, setTipo] = useState<DayType>('custom')
  const [esDescanso, setEsDescanso] = useState(false)

  useEffect(() => {
    if (!dia) return
    setName(dia.name)
    setTipo(dia.type)
    setEsDescanso(dia.is_rest)
  }, [dia])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dia) return
    await actualizarDia.mutateAsync({
      dayId: dia.id,
      body: { name: name.trim(), type: tipo, is_rest: esDescanso },
    })
    onClose()
  }

  return (
    <Modal open={dia !== null} onClose={onClose} title="Editar dia">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <Field
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NOMBRE_DIA_MAX}
          hint={`${name.length}/${NOMBRE_DIA_MAX} caracteres`}
        />
        <label className="flex h-11 items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={esDescanso}
            onChange={(e) => setEsDescanso(e.target.checked)}
            className="h-5 w-5 rounded border-border"
          />
          Es un dia de descanso
        </label>
        {!esDescanso ? (
          <div>
            <label htmlFor="tipo-dia-editar" className="mb-1.5 block text-sm font-medium text-fg-muted">
              Tipo de dia
            </label>
            <select
              id="tipo-dia-editar"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as DayType)}
              className="h-12 w-full rounded-[14px] border border-border bg-surface-2 px-4 text-fg focus:border-primary"
            >
              {TIPOS_DIA.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="submit" full disabled={actualizarDia.isPending}>
          {actualizarDia.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </form>
    </Modal>
  )
}

function ModalAnadirEjercicio({
  dia,
  onClose,
  routineId,
}: {
  dia: StructureDay | null
  onClose: () => void
  routineId: number
}) {
  const anadir = useAnadirEjercicioADia(routineId)
  const [ejercicio, setEjercicio] = useState<EjercicioBuscable | null>(null)
  const [series, setSeries] = useState('3')
  const [repeticiones, setRepeticiones] = useState('10')
  const [peso, setPeso] = useState('')
  const [descanso, setDescanso] = useState('90')
  const [rir, setRir] = useState('')
  const [error, setError] = useState<string | null>(null)

  function limpiarYcerrar() {
    setEjercicio(null)
    setSeries('3')
    setRepeticiones('10')
    setPeso('')
    setDescanso('90')
    setRir('')
    setError(null)
    onClose()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dia) return
    setError(null)
    if (!ejercicio) {
      setError('Elige un ejercicio de la lista.')
      return
    }
    if (!series.trim() || !repeticiones.trim()) {
      setError('Series y repeticiones son obligatorias.')
      return
    }
    try {
      await anadir.mutateAsync({
        dayId: dia.id,
        order: dia.slots.length + 1,
        exercise: ejercicio.id,
        series: series.trim(),
        repeticiones: repeticiones.trim(),
        peso: peso.trim() || undefined,
        descansoSeg: descanso.trim() || undefined,
        rir: rir.trim() || undefined,
      })
      limpiarYcerrar()
    } catch {
      setError('No se ha podido anadir el ejercicio. Prueba otra vez.')
    }
  }

  return (
    <Modal open={dia !== null} onClose={limpiarYcerrar} title={`Anadir ejercicio a ${dia?.name ?? ''}`}>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <ExercisePicker value={ejercicio} onChange={setEjercicio} />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Series"
            inputMode="numeric"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
          />
          <Field
            label="Repeticiones"
            inputMode="numeric"
            value={repeticiones}
            onChange={(e) => setRepeticiones(e.target.value)}
          />
          <Field
            label="Peso (kg)"
            hint="Opcional"
            inputMode="decimal"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
          />
          <Field
            label="Descanso (s)"
            hint="Opcional"
            inputMode="numeric"
            value={descanso}
            onChange={(e) => setDescanso(e.target.value)}
          />
          <Field
            label="RIR"
            hint="Opcional"
            inputMode="numeric"
            value={rir}
            onChange={(e) => setRir(e.target.value)}
            className="col-span-2"
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" full disabled={anadir.isPending}>
          {anadir.isPending ? 'Anadiendo...' : 'Anadir ejercicio'}
        </Button>
      </form>
    </Modal>
  )
}

function DiaCard({
  dia,
  routineId,
  nombres,
  onPedirAnadirEjercicio,
  onPedirEditar,
}: {
  dia: StructureDay
  routineId: number
  nombres: Map<number, string>
  onPedirAnadirEjercicio: (dia: StructureDay) => void
  onPedirEditar: (dia: StructureDay) => void
}) {
  const eliminarDia = useEliminarDia(routineId)
  const eliminarEjercicio = useEliminarEjercicioDeDia(routineId)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const entries = dia.slots.flatMap((s) =>
    s.entries.map((e) => ({ entry: e, slotId: s.id, esUnicaEnElSlot: s.entries.length === 1 })),
  )

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {dia.is_rest ? <BedDouble size={18} className="text-fg-subtle" aria-hidden="true" /> : null}
          <p className="font-display text-xl">{dia.name || `Dia ${dia.order}`}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPedirEditar(dia)}
            aria-label={`Editar dia ${dia.name}`}
            className="flex h-10 w-10 items-center justify-center rounded-full text-fg-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmarBorrado(true)}
            aria-label={`Eliminar dia ${dia.name}`}
            className="flex h-10 w-10 items-center justify-center rounded-full text-fg-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {dia.is_rest ? (
        <p className="text-sm text-fg-muted">Dia de descanso</p>
      ) : (
        <>
          {entries.length === 0 ? (
            <p className="mb-2 text-sm text-fg-muted">Sin ejercicios todavia</p>
          ) : (
            <ul className="mb-2 space-y-1.5">
              {entries.map(({ entry, slotId, esUnicaEnElSlot }) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-[12px] px-2 py-1.5 hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate text-sm text-fg">
                    {nombres.get(entry.exercise) ?? `Ejercicio ${entry.exercise}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void eliminarEjercicio.mutateAsync({
                        slotEntryId: entry.id,
                        slotId,
                        borrarSlotSiVacio: esUnicaEnElSlot,
                      })
                    }
                    aria-label="Quitar ejercicio"
                    disabled={eliminarEjercicio.isPending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" size="sm" onClick={() => onPedirAnadirEjercicio(dia)}>
            <Plus size={16} aria-hidden="true" />
            Anadir ejercicio
          </Button>
        </>
      )}

      <ConfirmModal
        open={confirmarBorrado}
        onClose={() => setConfirmarBorrado(false)}
        onConfirm={() => void eliminarDia.mutateAsync(dia.id)}
        title={`Eliminar "${dia.name}"`}
        description="Se borraran tambien todos sus ejercicios configurados. No se puede deshacer."
      />
    </Card>
  )
}

function EditorDeRutina({ routineId }: { routineId: number }) {
  const rutina = useRoutine(routineId)
  const structure = useRoutineStructure(routineId)
  const actualizar = useActualizarRutina(routineId)

  const [modalDiaAbierto, setModalDiaAbierto] = useState(false)
  const [diaParaAnadir, setDiaParaAnadir] = useState<StructureDay | null>(null)
  const [diaParaEditar, setDiaParaEditar] = useState<StructureDay | null>(null)

  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [datosListos, setDatosListos] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    if (rutina.data && !datosListos) {
      setName(rutina.data.name)
      setStart(rutina.data.start)
      setEnd(rutina.data.end)
      setDatosListos(true)
    }
  }, [rutina.data, datosListos])

  const exerciseIds = useMemo(
    () =>
      structure.data
        ? structure.data.days.flatMap((d) => d.slots.flatMap((s) => s.entries.map((e) => e.exercise)))
        : [],
    [structure.data],
  )
  const nombres = useExerciseNames(exerciseIds)

  async function guardarDatosBasicos(e: React.FormEvent) {
    e.preventDefault()
    await actualizar.mutateAsync({ name: name.trim(), start, end })
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  if (rutina.isLoading || structure.isLoading) return <SkeletonList rows={3} height="h-28" />
  if (rutina.isError || structure.isError || !structure.data) {
    return <ErrorState message="No se ha podido cargar la rutina." />
  }

  const dias = [...structure.data.days].sort((a, b) => a.order - b.order)

  return (
    <>
      <SectionLabel>Datos de la rutina</SectionLabel>
      <Card className="mb-5">
        <form onSubmit={(e) => void guardarDatosBasicos(e)} className="space-y-4">
          <Field
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NOMBRE_RUTINA_MAX}
            hint={`${name.length}/${NOMBRE_RUTINA_MAX} caracteres`}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <Field label="Fin" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" disabled={actualizar.isPending}>
            {actualizar.isPending ? 'Guardando...' : guardado ? 'Guardado' : 'Guardar cambios'}
          </Button>
        </form>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Dias de la rutina</SectionLabel>
        <Button variant="secondary" size="sm" onClick={() => setModalDiaAbierto(true)}>
          <Plus size={16} aria-hidden="true" />
          Anadir dia
        </Button>
      </div>

      {dias.length === 0 ? (
        <p className="text-sm text-fg-muted">Todavia no has anadido ningun dia.</p>
      ) : (
        <ul className="space-y-3">
          {dias.map((dia) => (
            <li key={dia.id}>
              <DiaCard
                dia={dia}
                routineId={routineId}
                nombres={nombres}
                onPedirAnadirEjercicio={setDiaParaAnadir}
                onPedirEditar={setDiaParaEditar}
              />
            </li>
          ))}
        </ul>
      )}

      <ModalAnadirDia
        open={modalDiaAbierto}
        onClose={() => setModalDiaAbierto(false)}
        routineId={routineId}
        siguienteOrden={dias.length + 1}
      />
      <ModalAnadirEjercicio dia={diaParaAnadir} onClose={() => setDiaParaAnadir(null)} routineId={routineId} />
      <ModalEditarDia dia={diaParaEditar} onClose={() => setDiaParaEditar(null)} routineId={routineId} />
    </>
  )
}

// --------------------------------------------------------------------- pagina

export default function RutinaFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const routineId = id ? Number(id) : null

  return (
    <>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 flex h-11 items-center gap-2 text-sm text-fg-muted transition-colors duration-150 hover:text-fg"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Volver
      </button>

      <PageTitle>{routineId ? 'Editar rutina' : 'Nueva rutina'}</PageTitle>

      {routineId ? <EditorDeRutina routineId={routineId} /> : <FormularioNuevaRutina />}
    </>
  )
}
