/* ---------------------------------------------------------------------------
   Lectura del resultado de un pago para la pantalla /callback.

   Llegan dos tipos de vuelta y la pantalla no debería distinguirlas a mano:
   - Webpay: Transbank hace POST de token_ws a ms-pago (/api/pagos/commit), que
     confirma y redirige por GET a FRONT_URL_TIENDA/callback?estado=…&orden=…
     (origen=TIENDA). Usa el vocabulario del SDK: AUTHORIZED / REJECTED, y en
     español ANULADO / ERROR.
   - Pasarela simulada: la tienda misma navega a /callback con lo que respondió
     /api/pagos/iniciar: AUTORIZADO / RECHAZADO.
   ------------------------------------------------------------------------- */

export type Resultado = 'aprobado' | 'rechazado' | 'anulado' | 'error' | 'desconocido'

const POR_ESTADO: Record<string, Resultado> = {
  AUTHORIZED: 'aprobado',
  AUTORIZADO: 'aprobado',
  APROBADO: 'aprobado',
  REJECTED: 'rechazado',
  FAILED: 'rechazado',
  RECHAZADO: 'rechazado',
  NULLIFIED: 'anulado',
  ABORTED: 'anulado',
  ANULADO: 'anulado',
  REVERSED: 'anulado',
  ERROR: 'error',
}

/**
 * Un estado ausente NO es un rechazo: significa que la pantalla se abrió a
 * mano o que el returnUrl no apunta al commit, y eso se comunica distinto.
 */
export function clasificarEstado(estado: string | null | undefined): Resultado {
  if (!estado || !estado.trim()) return 'desconocido'
  return POR_ESTADO[estado.trim().toUpperCase()] ?? 'desconocido'
}

export type DatosCallback = {
  resultado: Resultado
  estadoCrudo: string | null
  orden: string | null
  monto: number | null
  /** últimos 4 dígitos, nunca el número completo */
  tarjeta: string | null
  autorizacion: string | null
  fecha: string | null
  detalle: string | null
  pasarela: 'WEBPAY' | 'SIMULADA'
  /** ms-pago anuló un cobro de Webpay porque la tarjeta está bloqueada por el antifraude */
  antifraude: boolean
}

const vacioANull = (v: string | null) => (v && v.trim() ? v.trim() : null)

/* Transbank entrega el número enmascarado ("XXXXXXXXXXXX6623") o sólo los 4
   finales según el ambiente; se normaliza a los últimos 4 dígitos para no
   mostrar más de lo necesario. */
export function ultimos4(tarjeta: string | null): string | null {
  if (!tarjeta) return null
  const digitos = tarjeta.replace(/\D/g, '')
  return digitos.length >= 4 ? digitos.slice(-4) : null
}

export function leerCallback(params: URLSearchParams): DatosCallback {
  const estado = vacioANull(params.get('estado') ?? params.get('status'))
  const montoTxt = vacioANull(params.get('monto') ?? params.get('amount'))
  const monto = montoTxt != null && /^\d+(\.\d+)?$/.test(montoTxt) ? Number(montoTxt) : null
  return {
    resultado: clasificarEstado(estado),
    estadoCrudo: estado,
    orden: vacioANull(params.get('orden') ?? params.get('buyOrder')),
    monto,
    tarjeta: ultimos4(vacioANull(params.get('tarjeta'))),
    autorizacion: vacioANull(params.get('autorizacion')),
    fecha: vacioANull(params.get('fecha')),
    detalle: vacioANull(params.get('detalle')),
    pasarela: (params.get('pasarela') ?? '').toUpperCase() === 'SIMULADA' ? 'SIMULADA' : 'WEBPAY',
    antifraude: (params.get('motivo') ?? '').toLowerCase() === 'antifraude',
  }
}

export const TITULO: Record<Resultado, string> = {
  aprobado: '¡Pago aprobado!',
  rechazado: 'Pago rechazado',
  anulado: 'Pago anulado',
  error: 'No se pudo confirmar el pago',
  desconocido: 'No encontramos el resultado del pago',
}

export function bajada(r: Resultado, pasarela: 'WEBPAY' | 'SIMULADA', antifraude = false): string {
  if (r === 'rechazado' && antifraude) {
    return 'El sistema antifraude tiene bloqueada esta tarjeta por intentos sospechosos. Anulamos el cobro y el stock reservado se liberó.'
  }
  const via = pasarela === 'WEBPAY' ? 'Webpay' : 'la pasarela de prueba'
  switch (r) {
    case 'aprobado':
      return `Recibimos tu pago a través de ${via}. Tu pedido pasa a preparación y verás cada etapa en «Mis pedidos».`
    case 'rechazado':
      return `${pasarela === 'WEBPAY' ? 'Transbank' : 'La pasarela'} no autorizó el cobro. No se te cobró nada y el stock reservado se liberó.`
    case 'anulado':
      return 'Cerraste el formulario de pago antes de terminar. No se realizó ningún cobro.'
    case 'error':
      return 'Hubo un problema al confirmar la transacción con Transbank. Si ves un cargo, contáctanos con el número de orden.'
    default:
      return 'Esta página se abrió sin los datos que envía el servicio de pagos al terminar una compra.'
  }
}

export function estadoVisual(r: Resultado): 'ok' | 'warn' | 'bad' {
  if (r === 'aprobado') return 'ok'
  if (r === 'anulado' || r === 'desconocido') return 'warn'
  return 'bad'
}

export function glifo(r: Resultado): string {
  if (r === 'aprobado') return '✓'
  if (r === 'anulado' || r === 'desconocido') return '!'
  return '×'
}
