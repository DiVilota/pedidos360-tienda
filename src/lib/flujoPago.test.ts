import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENTREGA_VACIA } from './checkout'
import { ejecutarPago } from './flujoPago'
import type { Pedido } from './types'

/* El orden de las llamadas ES la regla de negocio: entrega → pedido (reserva)
   → pago. Se registra cada fetch y se compara la secuencia. */

type Llamada = { metodo: string; url: string; headers: Record<string, string>; body: unknown }

const PEDIDO: Pedido = {
  id: 'P-1001', usuarioId: 'ana@correo.cl', estado: 'PENDIENTE_PAGO', metodoEnvio: 'ENVIO', destino: 'Calle 1, Ñuñoa',
  items: [], subtotal: 649990, descuento: 0, costoEnvio: 0, total: 649990, cupon: null, codigoAutorizacion: null,
  creadoEn: '2026-11-22T17:00:00Z', actualizadoEn: '2026-11-22T17:00:00Z', pagadoEn: null,
}

function falsoFetch(respuestas: Record<string, { status: number; body: unknown }>) {
  const llamadas: Llamada[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? 'GET'
    llamadas.push({ metodo, url, headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const clave = Object.keys(respuestas).find((k) => `${metodo} ${url}`.includes(k))
    const r = clave ? respuestas[clave] : { status: 404, body: { error: 'no mockeado' } }
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
  }))
  return llamadas
}

const ENTREGA = { metodo: 'ENVIO' as const, datos: { ...ENTREGA_VACIA, nombre: 'Ana', telefono: '+56912345678', direccion: 'Calle 1', comuna: 'Ñuñoa' } }

afterEach(() => vi.unstubAllGlobals())

describe('ejecutarPago', () => {
  it('guarda la entrega, crea el pedido y RECIÉN después inicia el pago', async () => {
    const llamadas = falsoFetch({
      'PUT http://localhost:8087/api/carrito/envio': { status: 200, body: {} },
      'POST http://localhost:8087/api/pedidos': { status: 200, body: PEDIDO },
      'POST http://localhost:8083/api/pagos/iniciar': { status: 200, body: { url: 'https://webpay3gint.transbank.cl', token: 't0k' } },
    })
    const r = await ejecutarPago({ usuarioId: 'ana@correo.cl', entrega: ENTREGA, pasarela: 'WEBPAY' })
    expect(llamadas.map((l) => `${l.metodo} ${new URL(l.url).pathname}`)).toEqual([
      'PUT /api/carrito/envio',
      'POST /api/pedidos',
      'POST /api/pagos/iniciar',
    ])
    expect(llamadas[0].headers['X-Usuario-Id']).toBe('ana@correo.cl')
    expect(llamadas[1].headers['X-Usuario-Id']).toBe('ana@correo.cl')
    expect(llamadas[2].body).toEqual({ clientId: 'ana@correo.cl', amount: 649990, transactionId: 'P-1001', pasarela: 'WEBPAY', origen: 'TIENDA' })
    expect(r).toMatchObject({ ok: true, desenlace: { tipo: 'webpay', token: 't0k' } })
  })

  it('si la reserva da 409 NO llama a ms-pago y devuelve los faltantes', async () => {
    const llamadas = falsoFetch({
      'POST http://localhost:8087/api/pedidos': { status: 409, body: { error: 'Stock insuficiente', faltantes: [{ productoId: 'item_110', disponible: 1 }] } },
    })
    const r = await ejecutarPago({ usuarioId: 'u', pasarela: 'WEBPAY' })
    expect(llamadas.some((l) => l.url.includes('/api/pagos'))).toBe(false)
    expect(r).toMatchObject({ ok: false, paso: 'pedido', faltantes: [{ productoId: 'item_110', disponible: 1 }] })
  })

  it('un reintento con pedido pendiente NO crea otro pedido (no duplica la reserva)', async () => {
    const llamadas = falsoFetch({
      'POST http://localhost:8083/api/pagos/iniciar': { status: 429, body: { message: 'Bloqueado', bloqueadoHasta: '2026-11-22T15:00:00', intentos: 4 } },
    })
    const r = await ejecutarPago({ usuarioId: 'u', pasarela: 'SIMULADA', numeroTarjeta: '4051885600446623', pedidoPendiente: PEDIDO, entrega: ENTREGA })
    expect(llamadas.map((l) => new URL(l.url).pathname)).toEqual(['/api/pagos/iniciar'])
    expect(r).toMatchObject({ ok: true, desenlace: { tipo: 'antifraude', intentos: 4 } })
  })

  it('sin red en ms-pago devuelve el pedido para reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('8083')) throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify(PEDIDO), { status: 200 })
    }))
    const r = await ejecutarPago({ usuarioId: 'u', pasarela: 'WEBPAY' })
    expect(r).toMatchObject({ ok: false, paso: 'pago', pedido: { id: 'P-1001' } })
  })
})
