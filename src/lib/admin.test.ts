import { describe, expect, it } from 'vitest'
import { alturasBarras, rotacion, segmentosCategoria } from './admin'
import type { ResumenAdmin } from './types'

const resumen: ResumenAdmin = {
  ventasPorDia: [], masVendidos: [{ productoId: 'a', nombre: 'A', unidades: 14 }], ventasPorCategoria: [{ categoria: 'audio', total: 300 }, { categoria: 'gaming', total: 100 }],
  pedidosActivos: 1, ingresosTotales: 400, unidadesVendidas: 14,
}

describe('panel admin', () => {
  it('la cobertura sale de las ventas reales de la ventana', () => {
    const r = rotacion([{ id: 'a', nombre: 'A', stock: 5, nivel: 'BAJO' }, { id: 'b', nombre: 'B', stock: 50, nivel: 'NORMAL' }], resumen)
    expect(r[0]).toMatchObject({ id: 'a', vendidas: 14, coberturaDias: 5, rotacion: 'Alta' })
    expect(r[1]).toMatchObject({ id: 'b', vendidas: 0, coberturaDias: null, rotacion: 'Baja' })
  })
  it('participación por categoría y alturas de barras', () => {
    expect(segmentosCategoria(resumen).map((s) => s.pct)).toEqual([75, 25])
    expect(alturasBarras([0, 50, 100], 100)).toEqual([0, 50, 100])
  })
})
