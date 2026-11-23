import { describe, expect, it } from 'vitest'
import {
  ENTREGA_VACIA,
  MAX_DIRECCION,
  formatearTarjeta,
  horaBloqueo,
  interpretarPago,
  luhnValido,
  peticionEnvio,
  peticionPago,
  urlResultadoSimulado,
  validarEntrega,
} from './checkout'

describe('peticionPago', () => {
  it('usa el usuarioId estable como clientId, el id del pedido como transactionId y origen TIENDA', () => {
    const p = peticionPago({ id: 'P-1001', total: 653980 }, 'ana@correo.cl', 'WEBPAY')
    expect(p).toEqual({ clientId: 'ana@correo.cl', amount: 653980, transactionId: 'P-1001', pasarela: 'WEBPAY', origen: 'TIENDA' })
  })

  it('dos intentos del mismo pedido mandan el MISMO clientId (el antifraude cuenta por él)', () => {
    const a = peticionPago({ id: 'P-1', total: 10 }, 'anon-123', 'WEBPAY')
    const b = peticionPago({ id: 'P-1', total: 10 }, 'anon-123', 'WEBPAY')
    expect(a.clientId).toBe(b.clientId)
  })

  it('con SIMULADA manda sólo los dígitos de la tarjeta', () => {
    const p = peticionPago({ id: 'P-1', total: 10 }, 'u', 'SIMULADA', '4051 8856 0044 6623')
    expect(p.tarjeta).toEqual({ numero: '4051885600446623' })
  })

  it('con WEBPAY no manda tarjeta', () => {
    expect(peticionPago({ id: 'P-1', total: 10 }, 'u', 'WEBPAY', '4051').tarjeta).toBeUndefined()
  })
})

describe('interpretarPago', () => {
  it('429 es antifraude, con la hora de desbloqueo y los intentos', () => {
    const d = interpretarPago(429, { message: 'Demasiados intentos', bloqueadoHasta: '2026-11-22T14:32:10', intentos: 4 }, 'P-1')
    expect(d).toEqual({ tipo: 'antifraude', mensaje: 'Demasiados intentos', bloqueadoHasta: '2026-11-22T14:32:10', intentos: 4 })
    expect(horaBloqueo('2026-11-22T14:32:10')).toBe('14:32')
  })
  it('402 es rechazo de la pasarela simulada (no un error)', () => {
    expect(interpretarPago(402, { estado: 'RECHAZADO', idOrden: 'P-1', ultimos4: '0002' }, 'P-1')).toEqual({ tipo: 'rechazado', idOrden: 'P-1', ultimos4: '0002' })
  })
  it('200 con url y token es Webpay', () => {
    expect(interpretarPago(200, { url: 'https://webpay', token: 'abc' }, 'P-1')).toEqual({ tipo: 'webpay', url: 'https://webpay', token: 'abc' })
  })
  it('200 AUTORIZADO es aprobado', () => {
    expect(interpretarPago(200, { estado: 'AUTORIZADO', idOrden: 'P-1', ultimos4: '6623' }, 'P-1').tipo).toBe('aprobado')
  })
  it('503 y 502 dejan el pedido pendiente con el detalle del servicio', () => {
    expect(interpretarPago(503, { error: 'Servicio antifraude no disponible', detalle: 'reintente' }, 'P-1')).toEqual({ tipo: 'no-disponible', mensaje: 'reintente' })
    expect(interpretarPago(502, {}, 'P-1').tipo).toBe('no-disponible')
  })
  it('400 muestra el detalle de validación y no la categoría genérica', () => {
    expect(interpretarPago(400, { error: 'Datos inválidos', detalle: 'amount debe ser mayor a 0' }, 'P-1')).toEqual({ tipo: 'invalido', mensaje: 'amount debe ser mayor a 0' })
  })
})

describe('tarjeta', () => {
  it('Luhn acepta las tarjetas de prueba y rechaza un dígito cambiado', () => {
    expect(luhnValido('4051 8856 0044 6623')).toBe(true)
    expect(luhnValido('4000 0000 0000 0002')).toBe(true)
    expect(luhnValido('4051 8856 0044 6624')).toBe(false)
    expect(luhnValido('1234')).toBe(false)
  })
  it('formatea en grupos de 4', () => {
    expect(formatearTarjeta('4051885600446623')).toBe('4051 8856 0044 6623')
  })
})

describe('entrega', () => {
  const datos = { ...ENTREGA_VACIA, nombre: 'Ana Rojas', telefono: '+56 9 1234 5678', direccion: 'Av. Siempre Viva 742', comuna: 'Ñuñoa', indicaciones: 'depto 31' }
  it('valida campos de envío y sucursal de retiro', () => {
    expect(validarEntrega(datos, 'ENVIO')).toEqual({})
    expect(validarEntrega({ ...datos, comuna: '' }, 'ENVIO').comuna).toBeDefined()
    expect(validarEntrega(datos, 'RETIRO').sucursal).toBeDefined()
    expect(validarEntrega({ ...datos, sucursal: 'Providencia' }, 'RETIRO')).toEqual({})
  })
  it('PUT /envio sólo lleva los campos del contrato y la dirección no supera 200', () => {
    const p = peticionEnvio(datos, 'ENVIO')
    expect(Object.keys(p).sort()).toEqual(['comuna', 'direccion', 'metodo'])
    expect(p.direccion).toContain('depto 31')
    expect(peticionEnvio({ ...datos, indicaciones: 'x'.repeat(400) }, 'ENVIO').direccion!.length).toBe(MAX_DIRECCION)
    expect(peticionEnvio({ ...datos, sucursal: 'Maipú' }, 'RETIRO')).toEqual({ metodo: 'RETIRO', sucursal: 'Maipú' })
  })
})

it('el resultado simulado va a la misma /callback que Webpay', () => {
  expect(urlResultadoSimulado({ tipo: 'aprobado', idOrden: 'P-9', ultimos4: '6623' }, 1000)).toBe(
    '/callback?estado=AUTORIZADO&orden=P-9&monto=1000&pasarela=SIMULADA&tarjeta=6623',
  )
})
