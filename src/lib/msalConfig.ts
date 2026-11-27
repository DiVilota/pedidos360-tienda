/* ---------------------------------------------------------------------------
   Configuración de Microsoft Authentication Library (MSAL) para Azure Entra ID.

   La app «Pedidos360» se registró como SPA en el directorio DabraCorp
   (tenant d4b6dc23-c077-4371-8909-a5508bbbf0f4) con redirect URI
   http://localhost:5173 (desarrollo).

   En producción (Docker), AZURE_CLIENT_ID y AZURE_TENANT_ID se pueden
   inyectar por config.js igual que las API_*; aquí se leen de
   window.PEDIDOS360_CONFIG si existen, con fallback a los valores del
   registro de la app.
   ------------------------------------------------------------------------- */

import { PublicClientApplication, type Configuration, LogLevel } from '@azure/msal-browser'

const cfg = (typeof window !== 'undefined' && window.PEDIDOS360_CONFIG) || {} as Record<string, string | undefined>

const CLIENT_ID = (cfg as Record<string, string | undefined>).azureClientId || 'aa1acc08-c8f7-47ed-bf62-dda7db86750d'
const TENANT_ID = (cfg as Record<string, string | undefined>).azureTenantId || 'd4b6dc23-c077-4371-8909-a5508bbbf0f4'

const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (_level, message) => {
        // Solo en desarrollo
        if (import.meta.env.DEV) console.debug('[MSAL]', message)
      },
    },
  },
}

export const msalInstance = new PublicClientApplication(msalConfig)

/* Limpia cualquier interacción pendiente (popup que no se completó, recarga
   a mitad de flujo, etc.). Sin esto MSAL lanza "interaction_in_progress" al
   intentar un login si quedó estado residual en la caché. */
export const msalReady: Promise<void> = msalInstance.initialize().then(() =>
  msalInstance.handleRedirectPromise().then(() => {})
)
/* MSAL usa crypto.subtle, que el navegador sólo expone en un contexto seguro
   (HTTPS o localhost). En http://IP:8091 la inicialización falla: el error se
   muestra al pulsar el botón, no como "Uncaught (in promise)" al cargar. */
msalReady.catch(() => {})

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
}
