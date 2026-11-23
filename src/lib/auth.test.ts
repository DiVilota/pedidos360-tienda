import { beforeEach, describe, expect, it } from 'vitest'
import { cerrarSesion, idAnonimo, iniciarSesion, sesionActual, usuarioIdActual } from './auth'

beforeEach(() => localStorage.clear())

describe('identidad', () => {
  it('el id anónimo se crea una vez y se reutiliza (no uno por intento)', () => {
    const a = idAnonimo()
    expect(a).toMatch(/^anon-/)
    expect(idAnonimo()).toBe(a)
    expect(usuarioIdActual(null)).toBe(a)
  })

  it('logueado, el usuarioId es el email y sobrevive a una recarga', () => {
    const r = iniciarSesion(' Ana@Correo.cl ', '1234')
    expect(r.ok).toBe(true)
    expect(sesionActual()?.email).toBe('ana@correo.cl')
    expect(usuarioIdActual()).toBe('ana@correo.cl')
  })

  it('el id cumple el formato que valida ms-carrito (X-Usuario-Id)', () => {
    expect(idAnonimo()).toMatch(/^[A-Za-z0-9_.@:-]{1,64}$/)
    iniciarSesion('admin@pedidos360.cl', 'admin123')
    expect(usuarioIdActual()).toMatch(/^[A-Za-z0-9_.@:-]{1,64}$/)
  })

  it('rechaza claves incorrectas y cerrar sesión vuelve al anónimo', () => {
    expect(iniciarSesion('ana@correo.cl', 'mala').ok).toBe(false)
    const anon = idAnonimo()
    iniciarSesion('ana@correo.cl', '1234')
    cerrarSesion()
    expect(usuarioIdActual()).toBe(anon)
  })
})
