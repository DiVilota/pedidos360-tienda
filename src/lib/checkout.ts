import type { MetodoEnvio, PeticionEnvio, PeticionPago, Pasarela, Pedido, RespuestaIniciarPago } from './types'

/* ---------------------------------------------------------------------------
   Reglas del checkout que NO dependen de React (y por eso se prueban solas).

   Orden correcto del flujo (el prototipo lo tenía al revés: daba el pedido por
   hecho al CREAR la transacción, antes de que nadie cobrara):
     1. PUT /api/carrito/envio      datos de entrega definitivos
     2. POST /api/pedidos           reserva stock → pedido PENDIENTE_PAGO
     3. POST /api/pagos/iniciar     origen TIENDA, transactionId = id del pedido
     4. el pedido pasa a PAGADO sólo cuando ms-carrito consume pagos-resultado
   ------------------------------------------------------------------------- */

export type DatosEntrega = {
  nombre: string
  telefono: string
  direccion: string
  comuna: string
  indicaciones: string
  sucursal: string
}

export const ENTREGA_VACIA: DatosEntrega = { nombre: '', telefono: '', direccion: '', comuna: '', indicaciones: '', sucursal: '' }

/* Las mismas tres sucursales del contrato (§8) y del prototipo. */
export const SUCURSALES = [
  { nombre: 'Santiago Centro', direccion: 'Huérfanos 1160' },
  { nombre: 'Providencia', direccion: 'Av. Providencia 2124' },
  { nombre: 'Maipú', direccion: 'Av. Pajaritos 3450' },
] as const

/* Lo usa sólo el texto de ayuda ("gratis sobre $100.000"). El costo real lo
   calcula ms-carrito: el cliente nunca fija precios ni envíos. */
export const UMBRAL_ENVIO_GRATIS = 100000
export const COSTO_ENVIO = 3990

export type ErroresEntrega = Partial<Record<keyof DatosEntrega, string>>

export function validarEntrega(d: DatosEntrega, metodo: MetodoEnvio): ErroresEntrega {
  const e: ErroresEntrega = {}
  if (d.nombre.trim().length < 3) e.nombre = 'Ingresa tu nombre completo.'
  if (!/^\+?[\d\s]{8,15}$/.test(d.telefono.trim())) e.telefono = 'Ingresa un teléfono válido.'
  if (metodo === 'ENVIO') {
    if (d.direccion.trim().length < 5) e.direccion = 'Ingresa calle y número.'
    if (d.comuna.trim().length < 3) e.comuna = 'Ingresa tu comuna.'
  } else if (!SUCURSALES.some((s) => s.nombre === d.sucursal)) {
    e.sucursal = 'Elige una sucursal.'
  }
  return e
}

/* El contrato de PUT /envio sólo tiene {metodo, direccion, comuna, sucursal}.
   Para que el repartidor tenga a quién entregar sin inventar campos nuevos,
   las indicaciones y quién recibe se anexan a la dirección, recortada a los
   200 caracteres que acepta EnvioDTO (un 400 por largo arruinaría el pago).
   En retiro sólo viaja la sucursal: en tienda se identifica con el pedido. */
export const MAX_DIRECCION = 200

export function peticionEnvio(d: DatosEntrega, metodo: MetodoEnvio): PeticionEnvio {
  if (metodo === 'RETIRO') return { metodo, sucursal: d.sucursal }
  const extras = [d.indicaciones.trim(), d.nombre.trim() && `recibe ${d.nombre.trim()}`, d.telefono.trim()].filter(Boolean)
  const direccion = d.direccion.trim() + (extras.length ? ` (${extras.join(' · ')})` : '')
  return { metodo, direccion: direccion.slice(0, MAX_DIRECCION), comuna: d.comuna.trim() }
}

export function notaEnvio(subtotal: number): string {
  if (subtotal >= UMBRAL_ENVIO_GRATIS) return 'Gratis (compras sobre $100.000)'
  return '$3.990 · gratis sobre $100.000'
}

/* ------------------------------ tarjeta ------------------------------ */

export const normalizarTarjeta = (numero: string) => numero.replace(/\D/g, '')

/** "4051 8856 0044 6623" mientras se escribe */
export function formatearTarjeta(numero: string): string {
  return normalizarTarjeta(numero).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** Luhn: atrapa errores de tipeo antes de gastar un intento del antifraude. */
export function luhnValido(numero: string): boolean {
  const d = normalizarTarjeta(numero)
  if (d.length < 13 || d.length > 19) return false
  let suma = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    suma += n
  }
  return suma % 10 === 0
}

export function peticionPago(pedido: Pick<Pedido, 'id' | 'total'>, usuarioId: string, pasarela: Pasarela, numeroTarjeta?: string): PeticionPago {
  const p: PeticionPago = {
    clientId: usuarioId,
    amount: pedido.total,
    transactionId: pedido.id,
    pasarela,
    origen: 'TIENDA',
  }
  if (pasarela === 'SIMULADA') p.tarjeta = { numero: normalizarTarjeta(numeroTarjeta ?? '') }
  return p
}

/* ------------------------- respuesta de pago ------------------------- */

export type DesenlacePago =
  | { tipo: 'webpay'; url: string; token: string }
  | { tipo: 'aprobado'; idOrden: string; ultimos4: string | null }
  | { tipo: 'rechazado'; idOrden: string; ultimos4: string | null }
  | { tipo: 'antifraude'; mensaje: string; bloqueadoHasta: string | null; intentos: number | null }
  | { tipo: 'invalido'; mensaje: string }
  | { tipo: 'no-disponible'; mensaje: string }
  | { tipo: 'inesperado'; mensaje: string }

const texto = (b: RespuestaIniciarPago) => b.message || b.detalle || b.error || ''

export function interpretarPago(status: number, body: RespuestaIniciarPago, idPedido: string): DesenlacePago {
  if (status === 429) {
    return {
      tipo: 'antifraude',
      mensaje: texto(body) || 'Demasiados intentos de pago con la misma tarjeta.',
      bloqueadoHasta: body.bloqueadoHasta ?? null,
      intentos: typeof body.intentos === 'number' ? body.intentos : null,
    }
  }
  if (status === 400) return { tipo: 'invalido', mensaje: texto(body) || 'Datos de pago inválidos.' }
  /* 503 = Kafka no confirmó el intento (antifraude caído) · 502 = Transbank no
     responde. En ambos no se cobró nada y el pedido sigue esperando pago. */
  if (status === 503 || status === 502)
    return { tipo: 'no-disponible', mensaje: (body.detalle || texto(body)) || 'El servicio de pagos no está disponible.' }
  if (status === 402) return { tipo: 'rechazado', idOrden: body.idOrden ?? idPedido, ultimos4: body.ultimos4 ?? null }
  if (status >= 200 && status < 300) {
    if (body.url && body.token) return { tipo: 'webpay', url: body.url, token: body.token }
    const estado = (body.estado ?? '').toUpperCase()
    if (estado === 'AUTORIZADO') return { tipo: 'aprobado', idOrden: body.idOrden ?? idPedido, ultimos4: body.ultimos4 ?? null }
    if (estado === 'RECHAZADO') return { tipo: 'rechazado', idOrden: body.idOrden ?? idPedido, ultimos4: body.ultimos4 ?? null }
  }
  return { tipo: 'inesperado', mensaje: texto(body) || `Respuesta inesperada del servicio de pagos (HTTP ${status}).` }
}

/** URL de /callback para el resultado de la pasarela simulada (misma pantalla que Webpay). */
export function urlResultadoSimulado(d: Extract<DesenlacePago, { tipo: 'aprobado' | 'rechazado' }>, monto: number): string {
  const q = new URLSearchParams({
    estado: d.tipo === 'aprobado' ? 'AUTORIZADO' : 'RECHAZADO',
    orden: d.idOrden,
    monto: String(monto),
    pasarela: 'SIMULADA',
  })
  if (d.ultimos4) q.set('tarjeta', d.ultimos4)
  return `/callback?${q.toString()}`
}

/** "14:32" a partir del bloqueadoHasta del 429. */
export function horaBloqueo(iso: string | null): string | null {
  if (!iso) return null
  const m = /T(\d{2}):(\d{2})/.exec(iso)
  return m ? `${m[1]}:${m[2]}` : null
}
