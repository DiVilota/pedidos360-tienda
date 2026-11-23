import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, mensajeDe, productos, carrito, recomendaciones, notificaciones } from './api'

afterEach(() => vi.unstubAllGlobals())

function capturar(status = 200, body: unknown = {}) {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', f)
  return f
}

describe('cliente HTTP', () => {
  it('el detalle de producto manda X-Usuario-Id (eso dispara VER_PRODUCTO)', async () => {
    const f = capturar(200, { id: 'item_101' })
    await productos.detalle('item_101', 'anon-abc')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:8086/api/productos/item_101')
    expect((init.headers as Record<string, string>)['X-Usuario-Id']).toBe('anon-abc')
  })

  it('el catálogo filtra en el servidor y omite orden=relevancia', async () => {
    const f = capturar(200, [])
    await productos.listar({ categoria: 'audio', q: ' sony ', orden: 'relevancia' })
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('http://localhost:8086/api/productos?categoria=audio&q=sony')
  })

  it('las recomendaciones van por userId y el stream por query (EventSource no manda headers)', async () => {
    const f = capturar(200, [])
    await recomendaciones.para('ana@correo.cl')
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('http://localhost:8084/api/recomendaciones?userId=ana%40correo.cl')
    expect(notificaciones.urlStream('ana@correo.cl')).toBe('http://localhost:8088/api/notificaciones/stream?usuarioId=ana%40correo.cl')
  })

  it('un 422 de ms-carrito llega como ApiError con el detalle legible', async () => {
    capturar(422, { error: 'Operación no permitida', detalle: 'El cupón GAMER5000 requiere una compra mínima de $50.000' })
    const e = await carrito.aplicarCupon('u', 'GAMER5000').catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(422)
    expect(e.message).toContain('compra mínima')
  })

  it('un fallo de red es status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const e = await carrito.obtener('u').catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.esDeRed).toBe(true)
  })
})

describe('mensajeDe', () => {
  it('prefiere message, luego detalle, luego error', () => {
    expect(mensajeDe({ message: 'm', detalle: 'd', error: 'e' }, 400)).toBe('m')
    expect(mensajeDe({ detalle: 'd', error: 'e' }, 400)).toBe('d')
    expect(mensajeDe({ error: 'e' }, 400)).toBe('e')
    expect(mensajeDe('texto plano', 500)).toBe('texto plano')
    expect(mensajeDe(null, 503)).toBe('HTTP 503')
  })
})
