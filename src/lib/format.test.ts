import { describe, expect, it } from 'vitest'
import { clp, fechaHora, partesFecha } from './format'

describe('formatos', () => {
  it('pesos chilenos sin decimales', () => {
    expect(clp(1299990)).toBe('$1.299.990')
    expect(clp(null)).toBe('—')
  })

  it('LocalDateTime sin zona se muestra tal cual', () => {
    expect(fechaHora('2026-11-22T14:03:22')).toBe('22 nov · 14:03')
  })

  it('un Instant con Z es un instante absoluto (no se lee como hora local)', () => {
    const d = partesFecha('2026-11-22T17:03:22.123Z')!
    expect(d.getTime()).toBe(Date.UTC(2026, 10, 22, 17, 3, 22, 123))
    expect(partesFecha('2026-11-22T17:03:22+00:00')!.getTime()).toBe(Date.UTC(2026, 10, 22, 17, 3, 22))
  })

  it('valores vacíos o inválidos no rompen', () => {
    expect(partesFecha('')).toBeNull()
    expect(partesFecha('no-es-fecha')).toBeNull()
  })
})
