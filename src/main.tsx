import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { BASENAME } from './lib/base'
import { TiendaProvider } from './state/TiendaProvider'
import './styles/tienda.css'

/* Vuelta del popup de Microsoft (Azure Entra ID). La redirect URI registrada
   es el origen de la tienda, así que el popup aterriza acá con la respuesta en
   el hash (#code=…&state=…). Desde MSAL v5 el popup NO lo lee la ventana
   principal: esta página tiene que reenviárselo con
   broadcastResponseToMainFrame(), y la principal cierra el popup. Si se
   montara la tienda, el popup se quedaría mostrando la tienda y el login no
   terminaría nunca. El hash sólo: la vuelta de Webpay usa query (?token_ws=). */
const h = window.location.hash
const esRespuestaMicrosoft = /[#&]state=/.test(h) && /[#&](code|error)=/.test(h)

if (esRespuestaMicrosoft) {
  broadcastResponseToMainFrame().catch(() => {
    /* Hash que parecía de MSAL pero no lo era: se limpia y se monta la tienda. */
    history.replaceState(null, '', window.location.pathname + window.location.search)
    montar()
  })
} else {
  montar()
}

function montar() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter basename={BASENAME}>
        <TiendaProvider>
          <App />
        </TiendaProvider>
      </BrowserRouter>
    </StrictMode>,
  )
}
