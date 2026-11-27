import { conBase } from './base'
import type { EstadoPedido, MetodoEnvio, Pedido } from './types'

/* ---------------------------------------------------------------------------
   Etapas de un pedido para la barra de "Mis pedidos".

   La máquina de estados vive en ms-carrito (§8); acá sólo se traduce a lo que
   ve el cliente. Antes el prototipo inventaba el avance con un reloj local
   (una etapa cada 12 s desde que se creó el pedido); ahora la etapa es la que
   reporta el servicio, que avanza con su @Scheduled de logística simulada.
   ------------------------------------------------------------------------- */

export const ETAPAS: Record<MetodoEnvio, { estado: EstadoPedido; nombre: string }[]> = {
  ENVIO: [
    { estado: 'PAGADO', nombre: 'Pago confirmado' },
    { estado: 'PREPARANDO', nombre: 'Preparando' },
    { estado: 'ENVIADO', nombre: 'Enviado' },
    { estado: 'EN_CAMINO', nombre: 'En camino' },
    { estado: 'ENTREGADO', nombre: 'Entregado' },
  ],
  RETIRO: [
    { estado: 'PAGADO', nombre: 'Pago confirmado' },
    { estado: 'PREPARANDO', nombre: 'Preparando' },
    { estado: 'LISTO_RETIRO', nombre: 'Listo para retiro' },
    { estado: 'RETIRADO', nombre: 'Retirado' },
  ],
}

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  PAGADO: 'Pago confirmado',
  PREPARANDO: 'Preparando',
  ENVIADO: 'Enviado',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  LISTO_RETIRO: 'Listo para retiro',
  RETIRADO: 'Retirado',
  PAGO_RECHAZADO: 'Pago rechazado',
}

const FINALES: EstadoPedido[] = ['ENTREGADO', 'RETIRADO', 'PAGO_RECHAZADO']

export const esFinal = (e: EstadoPedido) => FINALES.includes(e)

/** -1 = todavía no hay ninguna etapa cumplida (pendiente o rechazado). */
export function indiceEtapa(p: Pick<Pedido, 'estado' | 'metodoEnvio'>): number {
  return ETAPAS[p.metodoEnvio].findIndex((e) => e.estado === p.estado)
}

export type Tono = 'ok' | 'info' | 'warn' | 'bad'

export function tonoEstado(e: EstadoPedido): Tono {
  if (e === 'ENTREGADO' || e === 'RETIRADO') return 'ok'
  if (e === 'PENDIENTE_PAGO') return 'warn'
  if (e === 'PAGO_RECHAZADO') return 'bad'
  return 'info'
}

/** En curso = todo lo que no terminó (incluye los que esperan pago). */
export function agrupar(lista: Pedido[]): { enCurso: Pedido[]; historial: Pedido[] } {
  const orden = [...lista].sort((a, b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? ''))
  return {
    enCurso: orden.filter((p) => !esFinal(p.estado)),
    historial: orden.filter((p) => esFinal(p.estado)),
  }
}

/** Sólo pedidos que ya pasaron por caja cuentan como "comprado". */
export function totalComprado(lista: Pedido[]): number {
  return lista.filter((p) => p.estado !== 'PENDIENTE_PAGO' && p.estado !== 'PAGO_RECHAZADO').reduce((a, p) => a + p.total, 0)
}

/* El mapa (public/ruta-paquete.html) entiende stage 0..4 con las etapas del
   prototipo: 0 recibido, 1 preparando, 2 enviado, 3 en camino, 4 entregado. */
export function tieneRuta(p: Pick<Pedido, 'estado' | 'metodoEnvio'>): boolean {
  return p.metodoEnvio === 'ENVIO' && indiceEtapa(p) >= 0
}

export function urlRuta(p: Pick<Pedido, 'id' | 'estado' | 'metodoEnvio' | 'destino'>): string {
  const stage = Math.max(0, indiceEtapa(p))
  const q = new URLSearchParams({ id: p.id, stage: String(stage), dest: p.destino ?? '' })
  return conBase(`/ruta-paquete.html?${q.toString()}`)
}

/** Fecha del último cambio de estado (o la de creación si no hay historial). */
export function instanteEstado(p: Pedido): string {
  const h = p.historial?.filter((x) => x.estado === p.estado).at(-1)
  return h?.instante ?? p.actualizadoEn ?? p.creadoEn
}
