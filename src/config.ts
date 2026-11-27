/* Las URL base no se escriben en el bundle: vienen de config.js, que el
   entrypoint del contenedor genera al arrancar. Así la MISMA imagen sirve en
   local y en AWS (API Gateway) sin recompilar. */
type RuntimeConfig = {
  productos?: string
  carrito?: string
  pagos?: string
  recomendaciones?: string
  notificaciones?: string
  cognitoRegion?: string
  cognitoClientId?: string
  cognitoPoolId?: string
}

declare global {
  interface Window {
    PEDIDOS360_CONFIG?: RuntimeConfig
  }
}

const cfg: RuntimeConfig = (typeof window !== 'undefined' && window.PEDIDOS360_CONFIG) || {}

/* Igual que `cfg`, pero releído en cada acceso (ver COGNITO más abajo). */
const actual = (): RuntimeConfig => (typeof window !== 'undefined' && window.PEDIDOS360_CONFIG) || {}

/* Una barra final duplicaría la barra de cada ruta ("…8086//api/productos"),
   y algunos gateways responden 404 a eso. Se normaliza una sola vez acá. */
const base = (valor: string | undefined, porDefecto: string) => (valor && valor.trim() ? valor.trim() : porDefecto).replace(/\/+$/, '')

export const API = {
  productos: base(cfg.productos, 'http://localhost:8086'),
  carrito: base(cfg.carrito, 'http://localhost:8087'),
  pagos: base(cfg.pagos, 'http://localhost:8083'),
  recomendaciones: base(cfg.recomendaciones, 'http://localhost:8084'),
  notificaciones: base(cfg.notificaciones, 'http://localhost:8088'),
}

export type Servicio = keyof typeof API

/* URL de salud de un servicio.

   Con un puerto por servicio (desarrollo) es su propio /actuator/health. Pero
   detrás del API Gateway las cinco bases son LA MISMA, así que
   `${base}/actuator/health` no distingue de quién es la salud, y además el
   gateway no publica /actuator (responde 403 sin cabeceras CORS, que el
   navegador cuenta como fallo de red: la insignia decía "modo demo · sin
   backend" con los cinco servicios arriba).
   Por eso, en modo gateway se pide /salud/<servicio>, cinco rutas explícitas
   que el 14 declara apuntando al /actuator/health de cada puerto. */
const unaSolaBase = () => new Set(Object.values(API)).size === 1

export function urlSalud(servicio: Servicio): string {
  return unaSolaBase() ? `${API[servicio]}/salud/${servicio}` : `${API[servicio]}/actuator/health`
}

/* Identidad (Cognito User Pools). Igual que las URL: no se compila dentro del
   bundle, llega por config.js, porque el user pool del Learner Lab se recrea
   cada vez que caduca el lab y la imagen no debería reconstruirse por eso.
   Sin cognitoClientId la tienda arranca igual y la pantalla de ingreso lo dice;
   así el catálogo sigue navegable aunque la identidad no esté configurada.

   Se lee con getters, no una sola vez al importar: config.js se carga antes del
   bundle en producción, pero en los tests la configuración se cambia entre
   casos y un valor congelado al importar obligaría a recargar el módulo. */
const texto = (v: string | undefined, porDefecto = '') => (v && v.trim() ? v.trim() : porDefecto)

export const COGNITO = {
  get region() {
    return texto(actual().cognitoRegion, 'us-east-1')
  },
  get clientId() {
    return texto(actual().cognitoClientId)
  },
  get poolId() {
    return texto(actual().cognitoPoolId)
  },
}

/* Etiqueta y puerto de cada servicio para la insignia de salud del header. */
export const SERVICIOS: { clave: Servicio; nombre: string }[] = [
  { clave: 'productos', nombre: 'ms-productos' },
  { clave: 'carrito', nombre: 'ms-carrito' },
  { clave: 'pagos', nombre: 'ms-pago' },
  { clave: 'recomendaciones', nombre: 'ms-recomendaciones' },
  { clave: 'notificaciones', nombre: 'ms-notificaciones' },
]
