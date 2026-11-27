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
import { BASE } from './base'

const cfg = (typeof window !== 'undefined' && window.PEDIDOS360_CONFIG) || {} as Record<string, string | undefined>

const CLIENT_ID = (cfg as Record<string, string | undefined>).azureClientId || 'aa1acc08-c8f7-47ed-bf62-dda7db86750d'
const TENANT_ID = (cfg as Record<string, string | undefined>).azureTenantId || 'd4b6dc23-c077-4371-8909-a5508bbbf0f4'

const msalConfig: Configuration = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    /* La vuelta del popup tiene que caer en la tienda: en la raíz del origen
       (nginx :8443) o en la etapa del gateway (…/desarrollo/). Cada una es una
       redirect URI distinta y hay que registrarla en Azure. */
    redirectUri: BASE === '/' ? window.location.origin : window.location.origin + BASE,
    postLogoutRedirectUri: BASE === '/' ? window.location.origin : window.location.origin + BASE,
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

/* Inicialización perezosa y una sola vez: limpia cualquier interacción
   pendiente (popup que no se completó, recarga a mitad de flujo). Sin esto MSAL
   lanza "interaction_in_progress" si quedó estado residual en la caché.

   Perezosa y no al importar el módulo: dentro del POPUP también se carga la
   tienda (la redirect URI es el origen), y un handleRedirectPromise() corriendo
   ahí se come la respuesta de Microsoft (#code=…) antes de que main.tsx se la
   pase a la ventana principal → "no_token_request_cache_error".

   MSAL usa crypto.subtle, que sólo existe en contexto seguro (HTTPS o
   localhost): en http://IP:8091 esto rechaza y el error se muestra al pulsar
   el botón. */
let listo: Promise<void> | null = null
export function msalReady(): Promise<void> {
  listo ??= msalInstance.initialize().then(() => msalInstance.handleRedirectPromise().then(() => {}))
  return listo
}

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
}
