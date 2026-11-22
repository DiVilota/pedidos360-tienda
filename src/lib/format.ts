/* Formatos de presentación. Viven aparte para probarlos: un "$1.299.990" mal
   armado o una fecha corrida 3 horas se nota en la demo, no en el compilador. */

/** Pesos chilenos sin decimales: $1.299.990 */
export const clp = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('es-CL')

/** Números con separador de miles (unidades, conteos). NO usar con identificadores. */
export const num = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('es-CL'))

export const pct = (parte: number, total: number) => (total <= 0 ? 0 : Math.round((parte / total) * 100))

/* Llegan dos formatos y no significan lo mismo:
   - Instant (ms-carrito, ms-notificaciones): "2026-11-22T17:03:22.123Z", con
     zona. Es un instante absoluto y se convierte a la hora del navegador.
   - LocalDateTime (ms-pago, bloqueadoHasta): "2026-11-22T14:03:22" SIN zona.
     `new Date()` lo leería como local en unos navegadores y UTC en otros, así
     que se descompone a mano y se muestra tal cual lo guardó el servicio.
   Acepta también epoch millis. */
export function partesFecha(valor: string | number | null | undefined): Date | null {
  if (valor == null || valor === '') return null
  if (typeof valor === 'number') return new Date(valor)
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(valor)) {
    const d = new Date(valor)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(valor)
  if (!m) return null
  const [, a, me, d, h = '0', mi = '0', s = '0'] = m
  return new Date(Number(a), Number(me) - 1, Number(d), Number(h), Number(mi), Number(s))
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** "22 nov" */
export function fechaCorta(valor: string | number | null | undefined): string {
  const f = partesFecha(valor)
  return f ? `${f.getDate()} ${MESES[f.getMonth()]}` : '—'
}

/** "22 nov · 14:03" */
export function fechaHora(valor: string | number | null | undefined): string {
  const f = partesFecha(valor)
  if (!f) return '—'
  const hh = String(f.getHours()).padStart(2, '0')
  const mm = String(f.getMinutes()).padStart(2, '0')
  return `${fechaCorta(valor)} · ${hh}:${mm}`
}

/** "22/11" para el eje del gráfico de ventas */
export function diaMes(valor: string | null | undefined): string {
  const f = partesFecha(valor)
  return f ? `${f.getDate()}/${f.getMonth() + 1}` : '—'
}

/** "hace 3 min" para las notificaciones */
export function haceCuanto(valor: string | number | null | undefined, ahora = Date.now()): string {
  const f = partesFecha(valor)
  if (!f) return ''
  const seg = Math.max(0, Math.round((ahora - f.getTime()) / 1000))
  if (seg < 45) return 'recién'
  const min = Math.round(seg / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return fechaCorta(valor)
}

/** "1.234,5" con coma decimal (montos en millones del gráfico) */
export const decimal = (n: number, dec = 1) =>
  n.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
