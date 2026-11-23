import { describe, expect, it } from 'vitest'
import { clasificarEstado, leerCallback } from './callback'

describe('/callback', () => {
  it('entiende el vocabulario de Webpay y el de la pasarela simulada', () => {
    expect(clasificarEstado('AUTHORIZED')).toBe('aprobado')
    expect(clasificarEstado('AUTORIZADO')).toBe('aprobado')
    expect(clasificarEstado('REJECTED')).toBe('rechazado')
    expect(clasificarEstado('ANULADO')).toBe('anulado')
    expect(clasificarEstado('ERROR')).toBe('error')
  })

  it('sin estado no es un rechazo: es desconocido', () => {
    expect(clasificarEstado(null)).toBe('desconocido')
    expect(clasificarEstado('')).toBe('desconocido')
  })

  it('lee el redirect de ms-pago y nunca muestra más de 4 dígitos', () => {
    const d = leerCallback(new URLSearchParams('estado=AUTHORIZED&orden=P-1001&cliente=ana@correo.cl&monto=649990&autorizacion=1213&tarjeta=XXXXXXXXXXXX6623'))
    expect(d).toMatchObject({ resultado: 'aprobado', orden: 'P-1001', monto: 649990, tarjeta: '6623', autorizacion: '1213', pasarela: 'WEBPAY' })
  })
})
