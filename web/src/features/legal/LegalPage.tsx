/**
 * Condiciones de uso, en /legal. Accesible con y sin sesion (ver App.tsx):
 * quien todavia no tiene cuenta debe poder leerlas antes de registrarse, y el
 * enlace del correo de verificacion tampoco pasa por el login.
 *
 * El titular todavia no esta dado de alta como autonomo ni como sociedad, asi
 * que los datos fiscales (NRT, domicilio social, forma juridica) van marcados
 * como pendientes tanto aqui en el comentario como en la propia pantalla, en
 * vez de inventarselos o dejarlos vacios sin mas.
 */

import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Scale } from 'lucide-react'

import { Card, PageTitle, SectionLabel } from '../../components/ui'

const URL_REPO_SALAZFITNESS = 'https://github.com/Salazser95/SalazFitness'
const URL_REPO_WGER = 'https://github.com/wger-project/wger'

function Apartado({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-xl text-fg">{titulo}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-fg-muted">{children}</div>
    </div>
  )
}

export default function LegalPage() {
  return (
    <div>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-fg-subtle transition-colors hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Volver
      </Link>

      <PageTitle>Condiciones de uso</PageTitle>

      <div className="space-y-6">
        <Card>
          <SectionLabel>Titular</SectionLabel>
          <p className="text-fg">Szabi Szalasi</p>
          <p className="mt-1 text-sm text-fg-muted">Teléfono: +376 342336</p>
          <p className="text-sm text-fg-muted">Correo: ibassalaz@gmail.com</p>
          <p className="mt-2 text-sm text-fg-muted">
            Desarrollo realizado en el Principado de Andorra.
          </p>

          {/* Datos fiscales pendientes: ver comentario de cabecera. */}
          <div className="mt-4 flex items-start gap-2 rounded-[14px] border border-warning/30 bg-warning/10 p-3">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <p className="text-sm text-warning">
              Pendiente de alta: NRT, domicilio social y forma jurídica todavía no están
              asignados. Se completarán aquí en cuanto el titular se dé de alta como autónomo o
              sociedad.
            </p>
          </div>
        </Card>

        <Card className="space-y-6">
          <Apartado titulo="Qué es esta aplicación">
            <p>
              SalazFitness es una herramienta personal de registro de entrenamiento, nutrición y
              gasto en la compra. No es un servicio comercial ni una consulta profesional de
              ningún tipo.
            </p>
          </Apartado>

          <Apartado titulo="Responsabilidad del usuario">
            <p>
              El uso de la aplicación es responsabilidad exclusiva de quien la utiliza. El
              desarrollador no se hace responsable del uso que se haga de ella ni de las
              decisiones que el usuario tome a partir de los datos que registra.
            </p>
          </Apartado>

          <Apartado titulo="No es consejo médico ni nutricional">
            <p>
              Los datos y cálculos de la aplicación son de carácter informativo y no sustituyen
              el consejo de un profesional. Quien tenga una condición de salud debe consultar a
              un médico o nutricionista antes de tomar decisiones basadas en esta app.
            </p>
          </Apartado>

          <Apartado titulo="Datos y privacidad">
            <p>
              Los datos se guardan en el servidor de la instancia a la que te conectas. No se
              ceden a terceros, y la aplicación no incluye analítica ni publicidad.
            </p>
          </Apartado>

          <Apartado titulo="Credenciales">
            <p>
              El usuario es responsable de la custodia de su usuario y contraseña, y de cualquier
              actividad que ocurra con su cuenta.
            </p>
          </Apartado>

          <Apartado titulo="Disponibilidad">
            <p>
              El servicio se ofrece «tal cual», sin garantía de disponibilidad continua ni de
              ausencia de errores.
            </p>
          </Apartado>

          <Apartado titulo="Licencia del código">
            <p className="flex items-start gap-2">
              <Scale size={18} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden="true" />
              <span>
                SalazFitness deriva de{' '}
                <a
                  href={URL_REPO_WGER}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  wger
                </a>{' '}
                y se distribuye bajo AGPL-3.0-or-later. El código fuente completo, incluidas las
                modificaciones de esta instancia, está disponible en{' '}
                <a
                  href={URL_REPO_SALAZFITNESS}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  github.com/Salazser95/SalazFitness
                </a>
                .
              </span>
            </p>
          </Apartado>
        </Card>

        <p className="text-xs text-fg-subtle">
          Nota: este texto lo ha redactado el propio desarrollador sin revisión jurídica. Conviene
          que un profesional lo revise antes de abrir el servicio a terceros.
        </p>
      </div>
    </div>
  )
}
