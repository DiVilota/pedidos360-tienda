import type { NivelStock, ResumenAdmin, StockAdmin } from './types'

/* ---------------------------------------------------------------------------
   Derivados del panel admin a partir de los endpoints reales:
   GET /api/admin/resumen (ms-carrito) y GET /api/productos/admin/stock
   (ms-productos). Antes todo esto salía de constantes SEED/DAILY del
   prototipo; ahora sólo se calculan proporciones sobre datos del servicio.
   ------------------------------------------------------------------------- */

/* La ventana del resumen la fija ms-carrito: ventasPorDia trae 14 días (§8).
   La cobertura se mide contra esa misma ventana para no mezclar períodos. */
export const DIAS_VENTANA = 14

export type FilaRotacion = {
  id: string
  nombre: string
  vendidas: number
  stock: number
  /** días de stock al ritmo actual; null = sin ventas en la ventana */
  coberturaDias: number | null
  rotacion: 'Alta' | 'Media' | 'Baja'
}

export function rotacion(stock: StockAdmin[], resumen: ResumenAdmin, dias = DIAS_VENTANA): FilaRotacion[] {
  const vendidasPor = new Map(resumen.masVendidos.map((m) => [m.productoId, m.unidades]))
  return stock
    .map((s) => {
      const vendidas = vendidasPor.get(s.id) ?? 0
      const porDia = vendidas / dias
      const coberturaDias = porDia > 0 ? s.stock / porDia : null
      const rot: FilaRotacion['rotacion'] =
        coberturaDias == null ? 'Baja' : coberturaDias < 10 ? 'Alta' : coberturaDias < 25 ? 'Media' : 'Baja'
      return { id: s.id, nombre: s.nombre, vendidas, stock: s.stock, coberturaDias, rotacion: rot }
    })
    .sort((a, b) => (a.coberturaDias ?? Infinity) - (b.coberturaDias ?? Infinity))
}

export const COLOR_NIVEL: Record<NivelStock, string> = {
  AGOTADO: '#ef4444',
  BAJO: '#f59e0b',
  NORMAL: '#22c55e',
}

export const ETIQUETA_NIVEL: Record<NivelStock, string> = {
  AGOTADO: 'Agotado',
  BAJO: 'Stock bajo',
  NORMAL: 'Normal',
}

/** Ancho de la barra de stock: 80 unidades = barra llena (el mayor stock semilla). */
export const anchoStock = (stock: number, tope = 80) => Math.max(0, Math.min(100, Math.round((stock / tope) * 100)))

const PALETA = ['#38bdf8', '#22c55e', '#f59e0b', '#818cf8', '#f472b6', '#2dd4bf', '#fb923c', '#a3e635']

export type Segmento = { categoria: string; total: number; pct: number; color: string }

export function segmentosCategoria(resumen: ResumenAdmin): Segmento[] {
  const total = resumen.ventasPorCategoria.reduce((a, c) => a + c.total, 0)
  return [...resumen.ventasPorCategoria]
    .sort((a, b) => b.total - a.total)
    .map((c, i) => ({
      categoria: c.categoria,
      total: c.total,
      pct: total > 0 ? Math.round((c.total / total) * 100) : 0,
      color: PALETA[i % PALETA.length],
    }))
}

/** Altura en px de cada barra del gráfico diario (la mayor = alto máximo). */
export function alturasBarras(valores: number[], alto = 130): number[] {
  const max = Math.max(0, ...valores)
  return valores.map((v) => (max > 0 ? Math.max(v > 0 ? 3 : 0, Math.round((v / max) * alto)) : 0))
}
