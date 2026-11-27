/* ---------------------------------------------------------------------------
   Identidad del usuario — ÚNICO módulo que sabe quién está comprando.

   Desde la fase 4 (§12 del contrato) la identidad la emite **Amazon Cognito**:
   la pantalla de ingreso entrega correo y contraseña a `lib/cognito.ts` y lo
   que se guarda acá es el ID token que devuelve el user pool. Ya no hay cuentas
   ni contraseñas en el frontend.

   Quién valida qué:
   - esta capa sólo LEE los claims, para pintar el nombre y elegir el menú;
   - el API Gateway valida firma, emisor y expiración contra el JWKS del user
     pool, y además reescribe `X-Usuario-Id` con `claims.email`, así que un
     cliente ya no puede declarar ser otro mandando la cabecera a mano.

   Segundo proveedor: **Microsoft Azure Entra ID** (MSAL.js, `msalConfig.ts`).
   La sesión de Azure es una sesión de la tienda (nombre, email, rol cliente)
   pero NO trae ID token de Cognito: el authorizer del gateway sólo acepta
   tokens del user pool, así que con Azure se navega, se arma el carrito y se
   reciben recomendaciones, y las rutas protegidas (pago, pedidos,
   notificaciones) piden una cuenta de Cognito. Federar Entra ID como IdP del
   user pool cerraría esa brecha; queda anotado como mejora.

   Por qué el usuarioId es estable (y no uno nuevo por intento ni por carga):
   - el antifraude de ms-pago y los carritos de ms-carrito se indexan por él;
     un id por intento hace que la regla "más de 3 en 10 s" nunca dispare y que
     el carrito se pierda al recargar;
   - ms-recomendaciones aprende del historial de ESE id; un id nuevo en cada
     visita siempre recibe "sin historial".
   Logueado → el email del ID token (el valor que exige el contrato §12).
   Anónimo  → "anon-<uuid>" generado una vez y guardado en este navegador: el
   catálogo, el carrito y las recomendaciones siguen funcionando sin cuenta.
   ------------------------------------------------------------------------- */
import { autenticar, claimsDe, ErrorCognito, refrescar, registrar, vencido, type Tokens } from './cognito'

import { msalInstance, msalReady, loginRequest } from './msalConfig'
import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser'

export type Rol = 'cliente' | 'admin'
export type Sesion = { email: string; nombre: string; rol: Rol; proveedor?: 'cognito' | 'azure' }

/* Lo que se persiste: la sesión visible más los tokens. El ID token dura 8 h y
   el refresh token 30 días; se renueva cuando al primero le queda poco.
   Una sesión de Azure se guarda SIN tokens: MSAL mantiene los suyos en su
   propia caché y el gateway no los acepta (ver cabecera). */
type SesionGuardada = Sesion & { tokens?: Tokens }

const CLAVE_SESION = 'p360.sesion'
const CLAVE_ANONIMO = 'p360.anonimo'

/* Los correos de prueba siguen a mano en la pantalla de ingreso, pero las
   contraseñas ya NO están en el frontend: viven en el user pool de Cognito. */
export const CUENTAS_PRUEBA = [
  { etiqueta: 'Cliente', email: 'ana@correo.cl' },
  { etiqueta: 'Admin', email: 'admin@pedidos360.cl' },
] as const

function leer<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T) : null
  } catch {
    return null
  }
}

function nuevoIdAnonimo(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `anon-${uuid}`
}

/** Id anónimo persistente: se crea la primera vez y se reutiliza siempre. */
export function idAnonimo(): string {
  let id: string | null = null
  try {
    id = localStorage.getItem(CLAVE_ANONIMO)
  } catch {
    /* modo privado sin storage: se cae a un id de memoria más abajo */
  }
  if (id && id.startsWith('anon-')) return id
  id = nuevoIdAnonimo()
  try {
    localStorage.setItem(CLAVE_ANONIMO, id)
  } catch {
    /* sin storage el id dura lo que dure la pestaña; no hay mejor opción */
  }
  return id
}

function guardar(s: SesionGuardada): void {
  try {
    localStorage.setItem(CLAVE_SESION, JSON.stringify(s))
  } catch {
    /* sin storage la sesión vive sólo lo que dure la pestaña */
  }
}

function guardada(): SesionGuardada | null {
  const s = leer<SesionGuardada>(CLAVE_SESION)
  if (!s || typeof s.email !== 'string' || (s.rol !== 'cliente' && s.rol !== 'admin')) return null
  if (s.proveedor === 'azure') return s
  if (!s.tokens || typeof s.tokens.idToken !== 'string') return null
  return s
}

export function sesionActual(): Sesion | null {
  const s = guardada()
  if (!s) return null
  if (s.proveedor === 'azure') return { email: s.email, nombre: s.nombre, rol: s.rol, proveedor: 'azure' }
  if (!s.tokens) return null
  /* Un ID token vencido y sin refresh token no es una sesión: mejor mandar a
     ingresar de nuevo que dejar la tienda diciendo "Ana" mientras cada llamada
     responde 401. */
  if (vencido(s.tokens, 0) && !s.tokens.refreshToken) {
    cerrarSesion()
    return null
  }
  return { email: s.email, nombre: s.nombre, rol: s.rol, proveedor: 'cognito' }
}

/** El id que viaja en X-Usuario-Id, en clientId de ms-pago y en userId de recomendaciones. */
export function usuarioIdActual(sesion: Sesion | null = sesionActual()): string {
  return sesion ? sesion.email : idAnonimo()
}

/** ID token para la cabecera Authorization, o null si se navega como anónimo. */
export function tokenActual(): string | null {
  const s = guardada()
  return s?.tokens ? s.tokens.idToken : null
}

/* El rol sale del grupo de Cognito, no de una tabla en el frontend: quien
   decide quién es admin es el user pool. */
function rolDe(grupos: string[] | undefined): Rol {
  return grupos?.includes('admin') ? 'admin' : 'cliente'
}

export type ResultadoLogin = { ok: true; sesion: Sesion } | { ok: false; error: string }

export async function iniciarSesion(email: string, clave: string): Promise<ResultadoLogin> {
  const correo = email.trim().toLowerCase()
  try {
    const tokens = await autenticar(correo, clave)
    const claims = claimsDe(tokens.idToken)
    if (!claims) return { ok: false, error: 'El servicio de identidad devolvió un token que no se pudo leer.' }
    const sesion: Sesion = {
      email: claims.email,
      nombre: claims.name || claims.email,
      rol: rolDe(claims['cognito:groups']),
      proveedor: 'cognito',
    }
    guardar({ ...sesion, tokens })
    return { ok: true, sesion }
  } catch (e) {
    if (e instanceof ErrorCognito) return { ok: false, error: e.message }
    return { ok: false, error: 'No se pudo iniciar sesión.' }
  }
}

/* Crea la cuenta en Cognito y, si queda confirmada, inicia sesión con ella: en
   el lab el trigger PreSignUp la confirma al instante, así que pedirle al
   usuario que "revise su correo" sería mentirle. */
export async function crearCuenta(email: string, clave: string, nombre: string): Promise<ResultadoLogin> {
  const correo = email.trim().toLowerCase()
  try {
    const { confirmada } = await registrar(correo, clave, nombre)
    if (!confirmada) {
      return { ok: false, error: 'La cuenta se creó pero necesita confirmarse por correo antes de entrar.' }
    }
    return await iniciarSesion(correo, clave)
  } catch (e) {
    if (e instanceof ErrorCognito) return { ok: false, error: e.message }
    return { ok: false, error: 'No se pudo crear la cuenta.' }
  }
}

/* Renueva el ID token cuando le queda menos de un minuto. La llama el cliente
   HTTP antes de cada petición: con el token vencido el gateway responde 401 y
   la pantalla mostraría un error que el usuario no provocó. */
export async function asegurarTokenVigente(): Promise<void> {
  const s = guardada()
  if (!s || !s.tokens || !vencido(s.tokens) || !s.tokens.refreshToken) return
  try {
    const tokens = await refrescar(s.tokens.refreshToken)
    guardar({ email: s.email, nombre: s.nombre, rol: s.rol, proveedor: 'cognito', tokens })
  } catch {
    /* El refresh token también vence o se revoca: se cierra la sesión y la
       próxima pantalla manda a ingresar. */
    cerrarSesion()
  }
}

/* ========================= Login con Microsoft Azure ========================= */

/** Convierte una cuenta de Azure en una Sesion de la tienda. */
function azureAccountToSesion(account: AccountInfo): Sesion {
  const email = (account.username || (account.idTokenClaims?.email as string) || '').toLowerCase()
  const nombre = account.name || email
  const rol: Rol = 'cliente'
  return { email, nombre, rol, proveedor: 'azure' }
}

/** Inicia el flujo de login con Microsoft (popup). */
export async function iniciarSesionAzure(): Promise<ResultadoLogin> {
  try {
    await msalReady
    const response: AuthenticationResult = await msalInstance.loginPopup(loginRequest)
    if (!response.account) {
      return { ok: false, error: 'No se pudo obtener la cuenta de Microsoft.' }
    }
    msalInstance.setActiveAccount(response.account)
    const sesion = azureAccountToSesion(response.account)
    guardar(sesion)
    return { ok: true, sesion }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al iniciar sesión con Microsoft.'
    if (msg.includes('user_cancelled') || msg.includes('popup_window_error')) {
      return { ok: false, error: 'Inicio de sesión cancelado.' }
    }
    return { ok: false, error: msg }
  }
}

/** Restaura la sesión de Azure si hay una cuenta activa en la caché de MSAL. */
export async function restaurarSesionAzure(): Promise<Sesion | null> {
  try {
    await msalReady
    const accounts = msalInstance.getAllAccounts()
    if (accounts.length > 0) {
      msalInstance.setActiveAccount(accounts[0])
      return azureAccountToSesion(accounts[0])
    }
  } catch { /* MSAL no inicializado o sin cuentas */ }
  return null
}

/* ========================= Cerrar sesión ========================= */

export function cerrarSesion(): void {
  /* guardada() y no sesionActual(): sesionActual() llama a cerrarSesion() con
     un token vencido, y leerla acá haría una recursión. */
  const sesion = guardada()
  try {
    localStorage.removeItem(CLAVE_SESION)
  } catch { /* nada que limpiar */ }
  if (sesion?.proveedor === 'azure') {
    msalReady.then(() => {
      const account = msalInstance.getActiveAccount()
      if (account) {
        msalInstance.logoutPopup({ account, mainWindowRedirectUri: window.location.origin })
          .catch(() => { /* si falla el logout remoto, al menos el local ya se limpió */ })
      }
    }).catch(() => { /* nada */ })
  }
}
