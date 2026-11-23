import { ApiError, carrito as apiCarrito, pagos as apiPagos, pedidos as apiPedidos } from './api'
import { interpretarPago, peticionEnvio, peticionPago, type DatosEntrega, type DesenlacePago } from './checkout'
import type { Carrito, ErrorStock, MetodoEnvio, Pasarela, Pedido } from './types'

/* ---------------------------------------------------------------------------
   Orquestación del pago, separada de la pantalla para poder probar el ORDEN
   de las llamadas (flujoPago.test.ts), que es justamente lo que el prototipo
   tenía mal:

     1. PUT  /api/carrito/envio    (ms-carrito)  datos de entrega definitivos
     2. POST /api/pedidos          (ms-carrito)  reserva stock → PENDIENTE_PAGO
     3. POST /api/pagos/iniciar    (ms-pago)     origen TIENDA, transactionId =
                                                 id del pedido, clientId = el
                                                 MISMO usuarioId del carrito

   El pedido NO se da por pagado acá: pasa a PAGADO cuando ms-carrito consume
   el resultado en `pagos-resultado`. La pantalla sólo informa lo que dijo la
   pasarela y «Mis pedidos» muestra el estado real.

   Reintento: si el pago falla sin resolverse (429 antifraude, 503, red), el
   pedido ya existe y tiene el stock reservado. Volver a crear otro duplicaría
   la reserva, así que el siguiente intento reutiliza `pedidoPendiente`.
   ------------------------------------------------------------------------- */

export type PasoFallido = 'envio' | 'pedido' | 'pago'

export type ResultadoFlujo =
  | { ok: true; pedido: Pedido; desenlace: DesenlacePago }
  | { ok: false; paso: PasoFallido; mensaje: string; faltantes?: ErrorStock['faltantes']; pedido?: Pedido }

export type EntradaFlujo = {
  usuarioId: string
  /* Si viene, se guarda primero (PUT /envio). La pantalla lo hace en su propio
     paso para mostrar el total exacto antes de pagar, y entonces lo omite. */
  entrega?: { metodo: MetodoEnvio; datos: DatosEntrega }
  pasarela: Pasarela
  numeroTarjeta?: string
  /** pedido creado en un intento anterior que quedó sin pagar */
  pedidoPendiente?: Pedido | null
  /** para que la pantalla refleje el carrito vacío apenas se crea el pedido */
  alActualizarCarrito?: (c: Carrito | null) => void
}

const msg = (e: unknown) =>
  e instanceof ApiError && e.esDeRed ? 'el servicio no responde' : e instanceof Error ? e.message : 'error desconocido'

export async function ejecutarPago(e: EntradaFlujo): Promise<ResultadoFlujo> {
  let pedido = e.pedidoPendiente ?? null

  if (!pedido) {
    if (e.entrega) {
      const r = await guardarEntrega(e.usuarioId, e.entrega.metodo, e.entrega.datos)
      if (!r.ok) return { ok: false, paso: 'envio', mensaje: r.mensaje }
      e.alActualizarCarrito?.(r.carrito)
    }

    try {
      pedido = await apiPedidos.crear(e.usuarioId)
      /* ms-carrito vacía el carrito al crear el pedido. */
      e.alActualizarCarrito?.(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const cuerpo = (err.body ?? {}) as ErrorStock
        return {
          ok: false,
          paso: 'pedido',
          mensaje: 'Algunos productos ya no tienen stock suficiente. Ajusta las cantidades y vuelve a intentar.',
          faltantes: cuerpo.faltantes ?? [],
        }
      }
      return { ok: false, paso: 'pedido', mensaje: `No se pudo crear el pedido: ${msg(err)}` }
    }
  }

  try {
    const { status, body } = await apiPagos.iniciar(peticionPago(pedido, e.usuarioId, e.pasarela, e.numeroTarjeta))
    return { ok: true, pedido, desenlace: interpretarPago(status, body, pedido.id) }
  } catch (err) {
    return { ok: false, paso: 'pago', mensaje: `No se pudo iniciar el pago: ${msg(err)}`, pedido }
  }
}

/** PUT /api/carrito/envio: ms-carrito responde el carrito con el costo de envío ya calculado. */
export async function guardarEntrega(
  usuarioId: string,
  metodo: MetodoEnvio,
  datos: DatosEntrega,
): Promise<{ ok: true; carrito: Carrito } | { ok: false; mensaje: string }> {
  try {
    return { ok: true, carrito: await apiCarrito.envio(usuarioId, peticionEnvio(datos, metodo)) }
  } catch (err) {
    return { ok: false, mensaje: `No se pudo guardar la entrega: ${msg(err)}` }
  }
}

/** Un desenlace que deja el pedido esperando otro intento de pago. */
export const quedaPendiente = (d: DesenlacePago) =>
  d.tipo === 'antifraude' || d.tipo === 'no-disponible' || d.tipo === 'invalido' || d.tipo === 'inesperado'
