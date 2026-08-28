/**
 * Pantalla a la que lleva el enlace del correo: /verificar?token=...
 *
 * Confirma el token contra el backend y, si vale, activa la cuenta. El token es
 * de un solo uso y caduca a las 48 horas (ver backend/salaz/models/account.py),
 * asi que la pantalla tiene que saber ofrecer un reenvio.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, MailWarning } from 'lucide-react'

import { Button, Field, SkeletonList } from '../../components/ui'
import { mensajeDeError, useReenviarCorreo, useVerificar } from './api'

export default function VerificarPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const verificar = useVerificar()
  const reenviar = useReenviarCorreo()
  const [correo, setCorreo] = useState('')

  // Un solo intento por token, aunque React monte el efecto dos veces en modo
  // estricto: el endpoint esta limitado por IP y no conviene gastar intentos.
  const intentado = useRef<string | null>(null)
  useEffect(() => {
    if (!token || intentado.current === token) return
    intentado.current = token
    verificar.mutate(token)
  }, [token, verificar])

  if (!token) {
    return (
      <Marco icono={<MailWarning size={26} aria-hidden="true" />} titulo="Enlace incompleto">
        <p className="text-sm text-fg-muted">
          Este enlace no trae el código de confirmación. Abre el que te llegó por correo tal cual,
          sin recortarlo.
        </p>
        <Volver />
      </Marco>
    )
  }

  if (verificar.isPending || verificar.isIdle) {
    return (
      <Marco titulo="Confirmando la cuenta">
        <SkeletonList rows={2} height="h-10" />
      </Marco>
    )
  }

  if (verificar.isSuccess) {
    return (
      <Marco icono={<CheckCircle2 size={26} aria-hidden="true" />} titulo="Cuenta confirmada">
        <p className="text-sm text-fg-muted">{verificar.data.detail}</p>
        <Volver etiqueta="Entrar" />
      </Marco>
    )
  }

  return (
    <Marco icono={<MailWarning size={26} aria-hidden="true" />} titulo="No se ha podido confirmar">
      <p className="text-sm text-fg-muted">
        {mensajeDeError(verificar.error, 'Ese enlace no vale o ha caducado.')}
      </p>

      {reenviar.isSuccess ? (
        <p className="mt-6 text-sm text-success">{reenviar.data.detail}</p>
      ) : (
        <form
          className="mt-6 space-y-3 text-left"
          onSubmit={(e) => {
            e.preventDefault()
            reenviar.mutate(correo)
          }}
        >
          <Field
            label="Tu correo"
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
          />
          <Button type="submit" full disabled={reenviar.isPending}>
            {reenviar.isPending ? 'Enviando...' : 'Enviarme otro enlace'}
          </Button>
        </form>
      )}
      <Volver />
    </Marco>
  )
}

function Marco({
  icono,
  titulo,
  children,
}: {
  icono?: React.ReactNode
  titulo: string
  children: React.ReactNode
}) {
  return (
    <main className="mesh-bg flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        {icono ? (
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            {icono}
          </span>
        ) : null}
        <h1 className="mt-4 font-display text-3xl">{titulo}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </main>
  )
}

function Volver({ etiqueta = 'Volver a entrar' }: { etiqueta?: string }) {
  return (
    <p className="mt-8">
      <Link to="/" className="text-sm text-primary hover:underline">
        {etiqueta}
      </Link>
    </p>
  )
}
