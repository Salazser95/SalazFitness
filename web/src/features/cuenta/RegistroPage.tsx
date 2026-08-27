/**
 * Alta de una cuenta nueva.
 *
 * La cuenta no queda activa al enviar el formulario: hay que confirmar el
 * correo. Es lo que impide que cualquiera abra cuentas en bucle contra un
 * servidor domestico, y por eso la pantalla insiste en el paso del correo en
 * vez de mandar al usuario directamente al login.
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'

import { Button, Field } from '../../components/ui'
import { mensajeDeError, useRegistro } from './api'

export default function RegistroPage() {
  const navigate = useNavigate()
  const registro = useRegistro()
  const [correo, setCorreo] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)
    const email = String(datos.get('email') ?? '')
    setCorreo(email)
    await registro.mutateAsync({
      username: String(datos.get('usuario') ?? ''),
      email,
      password: String(datos.get('clave') ?? ''),
    })
  }

  if (registro.isSuccess) {
    return (
      <main className="mesh-bg flex min-h-dvh flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <MailCheck size={26} aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-3xl">Revisa tu correo</h1>
          <p className="mt-3 text-sm text-fg-muted">
            Hemos enviado un enlace a <span className="text-fg">{correo}</span>. Pincha en el para
            activar la cuenta; hasta entonces no se puede entrar.
          </p>
          <Button full size="lg" className="mt-8" onClick={() => navigate('/')}>
            Ir a entrar
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mesh-bg flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Salaz</p>
        <h1 className="mt-1 font-display text-4xl leading-none">CREAR CUENTA</h1>
        <p className="mt-3 text-sm text-fg-muted">
          Te llegara un correo para confirmar la cuenta antes de poder entrar.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <Field label="Usuario" name="usuario" autoComplete="username" required autoFocus />
          <Field label="Correo" name="email" type="email" autoComplete="email" required />
          <Field
            label="Contrasena"
            name="clave"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            error={
              registro.isError
                ? mensajeDeError(registro.error, 'No se ha podido crear la cuenta')
                : undefined
            }
          />
          <Button type="submit" full size="lg" disabled={registro.isPending}>
            {registro.isPending ? 'Creando...' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-fg-muted">
          <Link to="/" className="text-primary hover:underline">
            Ya tengo cuenta
          </Link>
        </p>

        {/* Quien crea una cuenta tiene que poder leer las condiciones antes,
            y el pie de pagina solo existe dentro de la app con sesion. */}
        <p className="mt-4 text-center text-xs text-fg-subtle">
          Al crear la cuenta aceptas las{' '}
          <Link to="/legal" className="underline hover:text-fg-muted">
            condiciones de uso
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
