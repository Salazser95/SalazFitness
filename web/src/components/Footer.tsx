import { Link } from 'react-router-dom'

// Atribucion a wger, obligatoria por la AGPL-3.0 (el proyecto deriva de wger,
// ver NOTICE) y por eso no se puede quitar del todo. Se muestra solo donde
// alguien puede necesitar leerla de verdad: al entrar, al crear cuenta, y en
// Yo > Ajustes -- no en cada pantalla de la app (ver App.tsx y YoPage.tsx).
export function Footer() {
  return (
    <footer className="mt-10 space-y-1 border-t border-border pt-4 text-xs text-fg-subtle">
      <p>
        © 2026 Szabi Szalasi ·{' '}
        <Link to="/legal" className="hover:text-fg-muted hover:underline">
          Condiciones de uso
        </Link>
      </p>
      <p>
        Basado en{' '}
        <a
          href="https://github.com/wger-project/wger"
          target="_blank"
          rel="noreferrer"
          className="hover:text-fg-muted hover:underline"
        >
          wger
        </a>{' '}
        (AGPL-3.0)
      </p>
    </footer>
  )
}
