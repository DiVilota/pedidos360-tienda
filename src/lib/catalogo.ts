import type { Categoria, Producto, ProductoEnriquecido } from './types'

/* Presentación de productos que se repite en tarjeta, detalle, deseos y
   recomendaciones. Las categorías ya NO están escritas acá: vienen de
   GET /api/productos/categorias; esto sólo resuelve slug → etiqueta. */

/** Igual que el nivel BAJO del contrato (§7.2): 10 o menos unidades. */
export const UMBRAL_STOCK_BAJO = 10

export type EstadoStock = { etiqueta: string; tono: 'bad' | 'warn' | 'muted' }

export function estadoStock(stock: number | undefined): EstadoStock {
  if (stock == null) return { etiqueta: '', tono: 'muted' }
  if (stock <= 0) return { etiqueta: 'Agotado', tono: 'bad' }
  if (stock <= UMBRAL_STOCK_BAJO) return { etiqueta: `Quedan ${stock}`, tono: 'warn' }
  return { etiqueta: 'En stock', tono: 'muted' }
}

/* Si el catálogo trae una categoría nueva que la tienda no conoce, se muestra
   el slug legible en vez de romper o de esconder el producto. */
export function etiquetaCategoria(slug: string, categorias: Categoria[]): string {
  const c = categorias.find((x) => x.slug === slug)
  if (c) return c.etiqueta
  const t = slug.replace(/-/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const totalCatalogo = (categorias: Categoria[]) => categorias.reduce((a, c) => a + c.cantidad, 0)

/** Búsqueda local para la lista de deseos y "Populares" (el catálogo filtra en el servidor). */
export const porId = (lista: Producto[]) => new Map(lista.map((p) => [p.id, p]))

/** Texto que ms-recomendaciones usa cuando el usuario aún no tiene historial. */
export const MOTIVO_POPULAR = 'Popular entre otros clientes'

/* El score del motor no tiene escala fija; para la insignia "% afín" se
   reescala contra el mejor de la lista (el primero ≈ 98 %). Es una
   presentación relativa, no una probabilidad, y por eso se oculta cuando el
   motor no tiene historial (todos con el mismo score). */
export function afinidades(lista: ProductoEnriquecido[]): (number | undefined)[] {
  /* Sin historial el motor rellena con populares: un "% afín" ahí sería
     inventar una afinidad que no existe. */
  if (lista.every((r) => !r.motivo || r.motivo === MOTIVO_POPULAR)) return lista.map(() => undefined)
  const max = Math.max(0, ...lista.map((r) => r.score))
  const min = Math.min(...lista.map((r) => r.score))
  if (max <= 0 || max === min) return lista.map(() => undefined)
  return lista.map((r) => Math.max(52, Math.min(98, Math.round(52 + (r.score / max) * 46))))
}
