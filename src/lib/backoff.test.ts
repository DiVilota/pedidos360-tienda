import { describe, expect, it } from 'vitest'
import {
  ESPERA_BASE_MS,
  ESPERA_MAX_MS,
  conJitter,
  debeRendirse,
  describirEspera,
  siguienteEspera,
} from './backoff'

describe('siguienteEspera', () => {
  it('usa el intervalo base mientras no haya fallos', () => {
    expect(siguienteEspera(0)).toBe(ESPERA_BASE_MS)
    expect(siguienteEspera(1)).toBe(ESPERA_BASE_MS)
  })

  it('duplica la espera por cada fallo consecutivo', () => {
    expect(siguienteEspera(2)).toBe(10000)
    expect(siguienteEspera(3)).toBe(20000)
    expect(siguienteEspera(4)).toBe(40000)
  })

  it('no supera el techo', () => {
    expect(siguienteEspera(5)).toBe(ESPERA_MAX_MS)
    expect(siguienteEspera(99)).toBe(ESPERA_MAX_MS)
  })

  /* 2**1024 es Infinity: sin acotar el exponente la multiplicación daría NaN y
     el setTimeout se dispararía de inmediato, o sea lo contrario del backoff. */
  it('devuelve el techo y no NaN con un contador absurdo', () => {
    const r = siguienteEspera(5000)
    expect(Number.isFinite(r)).toBe(true)
    expect(r).toBe(ESPERA_MAX_MS)
  })

  it('respeta base y techo personalizados', () => {
    expect(siguienteEspera(3, 1000, 3000)).toBe(3000)
    expect(siguienteEspera(2, 1000, 3000)).toBe(2000)
  })
})

describe('debeRendirse', () => {
  it('aguanta hasta el penúltimo fallo', () => {
    expect(debeRendirse(4)).toBe(false)
  })

  it('corta al alcanzar el límite', () => {
    expect(debeRendirse(5)).toBe(true)
    expect(debeRendirse(6)).toBe(true)
  })

  it('acepta un límite propio', () => {
    expect(debeRendirse(2, 2)).toBe(true)
    expect(debeRendirse(1, 2)).toBe(false)
  })
})

describe('describirEspera', () => {
  it('usa segundos bajo el minuto', () => {
    expect(describirEspera(5000)).toBe('5 s')
    expect(describirEspera(40000)).toBe('40 s')
  })

  it('usa minutos desde el minuto, con coma decimal', () => {
    expect(describirEspera(60000)).toBe('1 min')
    expect(describirEspera(90000)).toBe('1,5 min')
  })
})

describe('conJitter', () => {
  it('reparte la espera en ±20 % según el aleatorio', () => {
    expect(conJitter(10000, () => 0)).toBe(8000)
    expect(conJitter(10000, () => 0.5)).toBe(10000)
    expect(conJitter(10000, () => 1)).toBe(12000)
  })
})
