import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { TiendaProvider } from './state/TiendaProvider'
import './styles/tienda.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TiendaProvider>
        <App />
      </TiendaProvider>
    </BrowserRouter>
  </StrictMode>,
)
