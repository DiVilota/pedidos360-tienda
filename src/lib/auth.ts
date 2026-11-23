/* ---------------------------------------------------------------------------
   Identidad del usuario — ÚNICO módulo que sabe quién está comprando.

   PROVISORIO hasta Cognito (fase 4 del contrato, §12): las cuentas de prueba
   viven acá y la "sesión" es un registro en localStorage. Cuando exista el
   user pool, este archivo se reemplaza por el flujo Authorization Code + PKCE
   y el resto de la tienda no se entera, porque todo lo demás sólo consume
   `usuarioIdActual()` y `sesionActual()`.

   Por qué el usuarioId es estable (y no uno nuevo por intento ni por carga):
   - el antifraude de ms-pago y los carritos de ms-carrito se indexan por él;
     un id por intento hace que la regla "más de 3 en 10 s" nunca dispare y que
     el carrito se pierda al recargar;
   - ms-recomendaciones aprende del historial de ESE id; un id nuevo en cada
     visita siempre recibe "sin historial".
   Logueado → el email (lo que en fase 4 será el `sub` del JWT).
   Anónimo  → "anon-<uuid>" generado una vez y guardado en este navegador.
   ------------------------------------------------------------------------- */

export type Rol = 'cliente' | 'admin'
export type Sesion = { email: string; nombre: string; rol: Rol }

const CLAVE_SESION = 'p360.sesion'
const CLAVE_ANONIMO = 'p360.anonimo'

/* Cuentas de demostración (las mismas del prototipo y del README). Las claves
   en el frontend son aceptables SÓLO porque no protegen nada: el backend no
   valida identidad hasta la fase 4. */
const CUENTAS_DEMO: Record<string, { nombre: string; clave: string; rol: Rol }> = {
  'ana@correo.cl': { nombre: 'Ana Rojas', clave: '1234', rol: 'cliente' },
  'admin@pedidos360.cl': { nombre: 'Administrador', clave: 'admin123', rol: 'admin' },
}

export const CUENTAS_PRUEBA = [
  { etiqueta: 'Cliente', email: 'ana@correo.cl', clave: '1234' },
  { etiqueta: 'Admin', email: 'admin@pedidos360.cl', clave: 'admin123' },
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

export function sesionActual(): Sesion | null {
  const s = leer<Sesion>(CLAVE_SESION)
  return s && typeof s.email === 'string' && (s.rol === 'cliente' || s.rol === 'admin') ? s : null
}

/** El id que viaja en X-Usuario-Id, en clientId de ms-pago y en userId de recomendaciones. */
export function usuarioIdActual(sesion: Sesion | null = sesionActual()): string {
  return sesion ? sesion.email : idAnonimo()
}

export type ResultadoLogin = { ok: true; sesion: Sesion } | { ok: false; error: string }

export function iniciarSesion(email: string, clave: string): ResultadoLogin {
  const correo = email.trim().toLowerCase()
  const cuenta = CUENTAS_DEMO[correo]
  if (!cuenta || cuenta.clave !== clave) return { ok: false, error: 'Correo o contraseña incorrectos.' }
  const sesion: Sesion = { email: correo, nombre: cuenta.nombre, rol: cuenta.rol }
  try {
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
  } catch {
    /* sin storage la sesión vive sólo en memoria (la devuelve igual) */
  }
  return { ok: true, sesion }
}

export function cerrarSesion(): void {
  try {
    localStorage.removeItem(CLAVE_SESION)
  } catch {
    /* nada que limpiar */
  }
}
