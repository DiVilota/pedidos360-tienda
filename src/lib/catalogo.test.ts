import { describe, expect, it } from 'vitest'
import { MOTIVO_POPULAR, afinidades, estadoStock, etiquetaCategoria } from './catalogo'
import type { ProductoEnriquecido } from './types'

const rec = (score: number, motivo: string): ProductoEnriquecido => ({
  rankPosition: 1, score, itemId: `i${score}`, nombre: 'x', categoria: 'audio', marca: 'm', precio: 1, calificacion: 4, imagenUrl: null, motivo,
})

describe('catálogo', () => {
  it('sin historial (sólo populares) no inventa un "% afín"', () => {
    expect(afinidades([rec(0.9, MOTIVO_POPULAR), rec(0.5, MOTIVO_POPULAR)])).toEqual([undefined, undefined])
  })
  it('con historial reescala contra el mejor', () => {
    const a = afinidades([rec(2, 'Porque viste Galaxy S24'), rec(1, 'Te interesa Audio (62 %)')])
    expect(a[0]).toBe(98)
    expect(a[1]).toBe(75)
  })
  it('una categoría desconocida se muestra legible en vez de romper', () => {
    expect(etiquetaCategoria('tv-video', [{ slug: 'tv-video', etiqueta: 'TV y video', cantidad: 2 }])).toBe('TV y video')
    expect(etiquetaCategoria('realidad-virtual', [])).toBe('Realidad virtual')
  })
  it('stock bajo = 10 o menos, igual que el nivel BAJO de ms-productos', () => {
    expect(estadoStock(10).etiqueta).toBe('Quedan 10')
    expect(estadoStock(11).etiqueta).toBe('En stock')
    expect(estadoStock(0).tono).toBe('bad')
  })
})
