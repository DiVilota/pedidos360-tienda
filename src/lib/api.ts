import { API, urlSalud, type Servicio } from '../config'
import { tokenActual } from './auth'
import type {
  Carrito,
  Categoria,
  EstadoActuator,
  Metricas,
  Notificacion,
  OrdenCatalogo,
  PeticionEnvio,
  PeticionPago,
  Pedido,
  Producto,
  ProductoEnriquecido,
  RespuestaIniciarPago,
  ResumenAdmin,
  StockAdmin,
  Sucursal,
} from './types'

/* ---------------------------------------------------------------------------
   Cliente HTTP único de la tienda. Ninguna pantalla llama a fetch: así el
   header de identidad, los timeouts y la traducción de errores se deciden en
   un solo lugar y se prueban en api.test.ts.
   ------------------------------------------------------------------------- */

/* Un fallo de red y un 4xx/5xx del servicio son problemas distintos y se
   muestran distinto en la UI, así que se distinguen con una clase propia. */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, mensaje: string, body?: unknown) {
    super(mensaje)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
  /** status 0 = nunca salió del navegador (servicio caído, CORS, DNS, timeout). */
  get esDeRed() {
    return this.status === 0
  }
}

const TIMEOUT_MS = 8000

/* Los servicios no nombran igual el campo de error: los @RestControllerAdvice
   nuevos usan {error, detalle}, el 429 de ms-pago usa "message", y algunos
   endpoints responden texto plano. Un solo lugar decide qué mostrar.
   `detalle` va ANTES que `error`: "error" es la categoría genérica ("No
   encontrado", "Operación no permitida") y "detalle" es la frase que le sirve
   al cliente ("El cupón X requiere una compra mínima de $50.000…"). */
export function mensajeDe(cuerpo: unknown, status: number): string {
  if (typeof cuerpo === 'string' && cuerpo.trim()) return cuerpo.trim()
  if (cuerpo && typeof cuerpo === 'object') {
    const obj = cuerpo as Record<string, unknown>
    for (const clave of ['message', 'mensaje', 'detalle', 'error']) {
      const valor = obj[clave]
      if (typeof valor === 'string' && valor.trim()) return valor.trim()
    }
  }
  return `HTTP ${status}`
}

async function leerCuerpo(res: Response): Promise<unknown> {
  const texto = await res.text()
  if (!texto) return null
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    const msg = e instanceof Error && e.name === 'TimeoutError' ? 'tiempo de espera agotado' : 'no se pudo contactar el servicio'
    throw new ApiError(0, msg)
  }
  const cuerpo = await leerCuerpo(res)
  if (!res.ok) throw new ApiError(res.status, mensajeDe(cuerpo, res.status), cuerpo)
  return cuerpo as T
}

/* Identidad mientras no exista Cognito: el contrato la resuelve en el backend
   con X-Usuario-Id (Component/UsuarioActual), así que acá sólo se adjunta.
   Con Cognito ya integrado se adjunta ADEMÁS el ID token: en las rutas
   protegidas el API Gateway lo valida y reescribe X-Usuario-Id con el claim
   `email`, de modo que la cabecera deja de ser falsificable. Se sigue mandando
   la cabecera porque el anónimo (sin token) también compra y porque los
   servicios siguen siendo los mismos en local, donde no hay gateway. */
const conUsuario = (usuarioId: string, init: RequestInit = {}): RequestInit => {
  const token = tokenActual()
  return {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      'X-Usuario-Id': usuarioId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }
}

const cuerpoJson = (metodo: string, body: unknown): RequestInit => ({
  method: metodo,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const enc = encodeURIComponent

/* ========================= salud (los cinco) ========================= */
/* La URL la decide config.ts: con una sola base (API Gateway) /actuator/health
   no distingue servicios y hay que pedir /salud/<servicio>. */
export const salud = (servicio: Servicio) =>
  pedir<EstadoActuator>(urlSalud(servicio), { signal: AbortSignal.timeout(3000) })

/* ========================= ms-productos :8086 ========================= */
export type FiltroCatalogo = { categoria?: string; q?: string; orden?: OrdenCatalogo }

export const productos = {
  listar(filtro: FiltroCatalogo = {}, signal?: AbortSignal) {
    const p = new URLSearchParams()
    if (filtro.categoria) p.set('categoria', filtro.categoria)
    if (filtro.q && filtro.q.trim()) p.set('q', filtro.q.trim())
    if (filtro.orden && filtro.orden !== 'relevancia') p.set('orden', filtro.orden)
    const qs = p.toString()
    return pedir<Producto[]>(`${API.productos}/api/productos${qs ? `?${qs}` : ''}`, signal ? { signal } : {})
  },

  categorias: () => pedir<Categoria[]>(`${API.productos}/api/productos/categorias`),

  /* Con X-Usuario-Id el servicio publica VER_PRODUCTO en interacciones-user:
     abrir el detalle ES la señal para las recomendaciones, por eso se manda
     siempre (anónimo incluido) y no se hace un POST aparte. */
  detalle: (id: string, usuarioId: string) =>
    pedir<Producto>(`${API.productos}/api/productos/${enc(id)}`, conUsuario(usuarioId)),

  /* El panel admin de la tienda manda el ID token: estas dos rutas van
     protegidas con el authorizer de Cognito en el gateway, y sin token
     responderían 401. El usuarioId que viaja es el del admin en sesión. */
  stockAdmin: (usuarioId: string) =>
    pedir<StockAdmin[]>(`${API.productos}/api/productos/admin/stock`, conUsuario(usuarioId)),

  /** Reponer: suma `cantidad` unidades al inventario. */
  reponer: (id: string, cantidad: number, usuarioId: string) =>
    pedir<Producto>(`${API.productos}/api/productos/${enc(id)}/stock`, conUsuario(usuarioId, cuerpoJson('PUT', { cantidad }))),
}

/* ========================= ms-carrito :8087 ========================= */
export const carrito = {
  obtener: (usuarioId: string) => pedir<Carrito>(`${API.carrito}/api/carrito`, conUsuario(usuarioId)),

  agregar: (usuarioId: string, productoId: string, cantidad = 1) =>
    pedir<Carrito>(`${API.carrito}/api/carrito/items`, conUsuario(usuarioId, cuerpoJson('POST', { productoId, cantidad }))),

  /** cantidad 0 = quitar el ítem (contrato §8). */
  cambiarCantidad: (usuarioId: string, productoId: string, cantidad: number) =>
    pedir<Carrito>(
      `${API.carrito}/api/carrito/items/${enc(productoId)}`,
      conUsuario(usuarioId, cuerpoJson('PATCH', { cantidad })),
    ),

  vaciar: (usuarioId: string) =>
    pedir<Carrito | null>(`${API.carrito}/api/carrito`, conUsuario(usuarioId, { method: 'DELETE' })),

  /** 404 = no existe · 422 = no alcanza el mínimo de compra. */
  aplicarCupon: (usuarioId: string, codigo: string) =>
    pedir<Carrito>(`${API.carrito}/api/carrito/cupon`, conUsuario(usuarioId, cuerpoJson('POST', { codigo }))),

  quitarCupon: (usuarioId: string) =>
    pedir<Carrito>(`${API.carrito}/api/carrito/cupon`, conUsuario(usuarioId, { method: 'DELETE' })),

  envio: (usuarioId: string, peticion: PeticionEnvio) =>
    pedir<Carrito>(`${API.carrito}/api/carrito/envio`, conUsuario(usuarioId, cuerpoJson('PUT', peticion))),

  /** Público: ms-carrito publica la lista cerrada de sucursales de retiro. */
  sucursales: () => pedir<Sucursal[]>(`${API.carrito}/api/carrito/sucursales`),
}

export const pedidos = {
  /* Reserva stock y deja el pedido en PENDIENTE_PAGO. Un 409 trae `faltantes`
     en ApiError.body y la pantalla lo muestra por producto. */
  crear: (usuarioId: string) => pedir<Pedido>(`${API.carrito}/api/pedidos`, conUsuario(usuarioId, { method: 'POST' })),
  listar: (usuarioId: string) => pedir<Pedido[]>(`${API.carrito}/api/pedidos`, conUsuario(usuarioId)),
  obtener: (usuarioId: string, id: string) =>
    pedir<Pedido>(`${API.carrito}/api/pedidos/${enc(id)}`, conUsuario(usuarioId)),
}

export const adminCarrito = {
  /* Protegidas con el authorizer de Cognito: el panel manda el ID token del
     admin en sesión, igual que las dos de ms-productos. */
  resumen: (usuarioId: string) => pedir<ResumenAdmin>(`${API.carrito}/api/admin/resumen`, conUsuario(usuarioId)),
  pedidos: (usuarioId: string) => pedir<Pedido[]>(`${API.carrito}/api/admin/pedidos`, conUsuario(usuarioId)),
}

/* =========================== ms-pago :8083 =========================== */
export const pagos = {
  /* 402 (rechazo de la pasarela simulada) y 429 (antifraude) NO son
     excepciones: son resultados esperados del pago y la pantalla los presenta.
     Por eso se devuelven como dato; sólo un fallo de red se lanza. */
  async iniciar(peticion: PeticionPago): Promise<{ status: number; body: RespuestaIniciarPago }> {
    let res: Response
    try {
      /* Con el ID token: esta ruta está protegida por el authorizer de Cognito
         en el gateway. Era la ÚNICA llamada de la tienda que no pasaba por
         conUsuario, y sin token el gateway responde 401 sin cabeceras CORS: el
         navegador descarta la respuesta y el fallo se ve como "el servicio no
         responde", que manda a buscar un ms-pago caído que está sano.
         clientId es el usuarioId (contrato §6). */
      res = await fetch(`${API.pagos}/api/pagos/iniciar`, {
        ...conUsuario(peticion.clientId, cuerpoJson('POST', peticion)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new ApiError(0, 'el servicio de pagos no responde')
    }
    const cuerpo = await leerCuerpo(res)
    const body: RespuestaIniciarPago =
      cuerpo && typeof cuerpo === 'object' ? (cuerpo as RespuestaIniciarPago) : typeof cuerpo === 'string' ? { message: cuerpo } : {}
    return { status: res.status, body }
  },
}

/* ====================== ms-recomendaciones :8084 ====================== */
export const recomendaciones = {
  para: (userId: string) =>
    pedir<ProductoEnriquecido[]>(`${API.recomendaciones}/api/recomendaciones?userId=${enc(userId)}`),
  metricas: () => pedir<Metricas>(`${API.recomendaciones}/api/metricas`),
}

/* ====================== ms-notificaciones :8088 ====================== */
export const notificaciones = {
  listar: (usuarioId: string) =>
    pedir<Notificacion[]>(`${API.notificaciones}/api/notificaciones?usuarioId=${enc(usuarioId)}`),

  /* Por query y no por header: EventSource no permite headers propios. */
  urlStream: (usuarioId: string) => `${API.notificaciones}/api/notificaciones/stream?usuarioId=${enc(usuarioId)}`,

  marcarLeida: (id: string) =>
    pedir<unknown>(`${API.notificaciones}/api/notificaciones/${enc(id)}/leida`, { method: 'PATCH' }),

  marcarTodas: (usuarioId: string) =>
    pedir<unknown>(`${API.notificaciones}/api/notificaciones/leidas?usuarioId=${enc(usuarioId)}`, { method: 'POST' }),
}
