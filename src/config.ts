/* Las URL base no se escriben en el bundle: vienen de config.js, que el
   entrypoint del contenedor genera al arrancar. Así la MISMA imagen sirve en
   local y en AWS (API Gateway) sin recompilar. */
type RuntimeConfig = {
  productos?: string
  carrito?: string
  pagos?: string
  recomendaciones?: string
  notificaciones?: string
}

declare global {
  interface Window {
    PEDIDOS360_CONFIG?: RuntimeConfig
  }
}

const cfg: RuntimeConfig = (typeof window !== 'undefined' && window.PEDIDOS360_CONFIG) || {}

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

/* Etiqueta y puerto de cada servicio para la insignia de salud del header. */
export const SERVICIOS: { clave: Servicio; nombre: string }[] = [
  { clave: 'productos', nombre: 'ms-productos' },
  { clave: 'carrito', nombre: 'ms-carrito' },
  { clave: 'pagos', nombre: 'ms-pago' },
  { clave: 'recomendaciones', nombre: 'ms-recomendaciones' },
  { clave: 'notificaciones', nombre: 'ms-notificaciones' },
]
