import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import './styles/theme.css'
import './i18n'
import App from './App'
import { queryClient } from './lib/query'
import { iniciarTiempoReal } from './lib/tiempoReal'

// Arranca el cliente de tiempo real (SSE de cambios del hogar) para toda la
// vida de la pagina: main.tsx no es un componente que se desmonte, asi que
// no hace falta un efecto de React con limpieza, basta con llamarlo una vez
// aqui al arrancar (la funcion de parada que devuelve no se necesita: la
// unica forma de "parar" es cerrar la pestana).
iniciarTiempoReal(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
