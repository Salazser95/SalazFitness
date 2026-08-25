import { lazy, Suspense, useEffect } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Apple,
  Dumbbell,
  Flame,
  LogOut,
  ShoppingCart,
  User,
  type LucideIcon,
} from 'lucide-react'

import { SESSION_EXPIRED } from './lib/api'
import { useAuth } from './lib/auth'
import { Button, Field, SkeletonList } from './components/ui'

const Hoy = lazy(() => import('./features/hoy/HoyPage'))
const Entreno = lazy(() => import('./features/entreno/EntrenoPage'))
const Nutricion = lazy(() => import('./features/nutricion/NutricionPage'))
const Compra = lazy(() => import('./features/compra/CompraPage'))
const Yo = lazy(() => import('./features/yo/YoPage'))
// Publicas: se abren sin sesion, porque quien se registra todavia no tiene.
const Registro = lazy(() => import('./features/cuenta/RegistroPage'))
const Verificar = lazy(() => import('./features/cuenta/VerificarPage'))

// Cinco destinos como máximo en la barra inferior. Ver docs/DESIGN-SYSTEM.md.
// labelKey es la clave de i18n (ver src/i18n/es-ES.json), resuelta en NavItem
// con useTranslation para que reaccione al cambio de idioma en caliente.
type Destino = { to: string; labelKey: string; icon: LucideIcon }

const DESTINOS: Destino[] = [
  { to: '/hoy', labelKey: 'nav.hoy', icon: Flame },
  { to: '/entreno', labelKey: 'nav.entreno', icon: Dumbbell },
  { to: '/nutricion', labelKey: 'nav.nutricion', icon: Apple },
  { to: '/compra', labelKey: 'nav.compra', icon: ShoppingCart },
  { to: '/yo', labelKey: 'nav.yo', icon: User },
]

// -------------------------------------------------------------- Login

function LoginPage() {
  const { signIn, loading, error } = useAuth()
  const { t } = useTranslation()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    await signIn(String(data.get('usuario') ?? ''), String(data.get('clave') ?? ''))
  }

  return (
    <main className="mesh-bg flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
          Salaz
        </p>
        <h1 className="mt-1 font-display text-5xl leading-none">FITNESS</h1>
        <p className="mt-3 text-sm text-fg-muted">{t('login.subtitulo')}</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <Field
            label={t('login.usuario')}
            name="usuario"
            autoComplete="username"
            required
            autoFocus
            placeholder="admin"
          />
          <Field
            label={t('login.contrasena')}
            name="clave"
            type="password"
            autoComplete="current-password"
            required
            error={error}
          />
          <Button type="submit" full size="lg" disabled={loading}>
            {loading ? t('login.entrando') : t('login.entrar')}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-fg-muted">
          <Link to="/registro" className="text-primary hover:underline">
            Crear una cuenta
          </Link>
        </p>

        <p className="mt-4 text-center text-xs text-fg-subtle">{t('login.privacidad')}</p>
      </div>
    </main>
  )
}

// ---------------------------------------------------------- Navegación

function NavItem({ dest, vertical }: { dest: Destino; vertical: boolean }) {
  const Icon = dest.icon
  const { t } = useTranslation()
  return (
    <NavLink
      to={dest.to}
      className={({ isActive }) =>
        [
          'flex items-center justify-center gap-2 rounded-[14px] transition-colors duration-150',
          // 44x44 como mínimo para el dedo
          vertical ? 'h-12 w-full justify-start px-4' : 'h-full min-h-[56px] flex-1 flex-col gap-1',
          isActive ? 'text-primary' : 'text-fg-subtle hover:text-fg',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
          <span className={vertical ? 'text-sm font-medium' : 'text-[11px] font-medium'}>
            {t(dest.labelKey)}
          </span>
        </>
      )}
    </NavLink>
  )
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { username, signOut } = useAuth()
  const { pathname } = useLocation()
  const { t } = useTranslation()

  // Al cambiar de pantalla, arriba del todo.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral, solo en escritorio */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface/40 p-4 lg:flex lg:flex-col">
        <div className="px-2 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
            Salaz
          </p>
          <p className="font-display text-2xl leading-none">FITNESS</p>
        </div>
        <nav className="mt-6 flex flex-col gap-1">
          {DESTINOS.map((d) => (
            <NavItem key={d.to} dest={d} vertical />
          ))}
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <p className="px-4 text-sm text-fg-muted">{username}</p>
          <button
            onClick={signOut}
            className="mt-2 flex h-11 w-full items-center gap-2 rounded-[14px] px-4 text-sm text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <LogOut size={18} aria-hidden="true" />
            {t('nav.salir')}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 lg:pb-10">
          <Suspense fallback={<SkeletonList rows={4} height="h-24" />}>{children}</Suspense>
        </main>
      </div>

      {/* Barra inferior, solo en móvil. Respeta el notch del iPhone. */}
      <nav className="glass fixed inset-x-0 bottom-0 z-50 flex border-t border-border pb-safe lg:hidden">
        {DESTINOS.map((d) => (
          <NavItem key={d.to} dest={d} vertical={false} />
        ))}
      </nav>
    </div>
  )
}

// --------------------------------------------------------------- App

export default function App() {
  const { authenticated, expire } = useAuth()

  // El cliente HTTP avisa cuando el refresh token ya no sirve.
  useEffect(() => {
    const onExpired = () => expire()
    window.addEventListener(SESSION_EXPIRED, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired)
  }, [expire])

  // Sin sesion solo se llega al login y a las dos pantallas de cuenta. El
  // enlace del correo apunta a /verificar, asi que tiene que abrirse tal cual
  // sin pasar antes por el login.
  if (!authenticated) {
    return (
      <Suspense fallback={<SkeletonList rows={3} height="h-16" />}>
        <Routes>
          <Route path="/registro" element={<Registro />} />
          <Route path="/verificar" element={<Verificar />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/hoy" replace />} />
        <Route path="/hoy" element={<Hoy />} />
        <Route path="/entreno/*" element={<Entreno />} />
        <Route path="/nutricion/*" element={<Nutricion />} />
        <Route path="/compra/*" element={<Compra />} />
        <Route path="/yo" element={<Yo />} />
        <Route path="/verificar" element={<Verificar />} />
        <Route path="*" element={<Navigate to="/hoy" replace />} />
      </Routes>
    </AppShell>
  )
}
