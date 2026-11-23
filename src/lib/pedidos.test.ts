import { describe, expect, it } from 'vitest'
import { agrupar, indiceEtapa, tieneRuta, totalComprado, urlRuta } from './pedidos'
import type { Pedido } from './types'

const base = (over: Partial<Pedido>): Pedido => ({
  id: 'P-1', usuarioId: 'u', estado: 'PAGADO', metodoEnvio: 'ENVIO', destino: 'Calle 1, Ñuñoa', items: [], subtotal: 100, descuento: 0,
  costoEnvio: 0, total: 100, cupon: null, codigoAutorizacion: null, creadoEn: '2026-11-20T10:00:00Z', actualizadoEn: '2026-11-20T10:00:00Z', pagadoEn: null, ...over,
})

describe('etapas', () => {
  it('la etapa es la que reporta ms-carrito, no un reloj local', () => {
    expect(indiceEtapa(base({ estado: 'EN_CAMINO' }))).toBe(3)
    expect(indiceEtapa(base({ estado: 'LISTO_RETIRO', metodoEnvio: 'RETIRO' }))).toBe(2)
    expect(indiceEtapa(base({ estado: 'PENDIENTE_PAGO' }))).toBe(-1)
  })

  it('sólo hay ruta para envíos pagados', () => {
    expect(tieneRuta(base({ estado: 'ENVIADO' }))).toBe(true)
    expect(tieneRuta(base({ estado: 'PENDIENTE_PAGO' }))).toBe(false)
    expect(tieneRuta(base({ estado: 'PREPARANDO', metodoEnvio: 'RETIRO' }))).toBe(false)
    expect(urlRuta(base({ id: 'P-9', estado: 'EN_CAMINO' }))).toBe('/ruta-paquete.html?id=P-9&stage=3&dest=Calle+1%2C+%C3%91u%C3%B1oa')
  })

  it('agrupa en curso / historial y no cuenta como comprado lo no pagado', () => {
    const l = [base({ id: 'A', estado: 'ENTREGADO' }), base({ id: 'B', estado: 'PENDIENTE_PAGO', total: 999 }), base({ id: 'C', estado: 'PAGO_RECHAZADO', total: 5 })]
    const g = agrupar(l)
    expect(g.enCurso.map((p) => p.id)).toEqual(['B'])
    expect(g.historial.map((p) => p.id).sort()).toEqual(['A', 'C'])
    expect(totalComprado(l)).toBe(100)
  })
})
