import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cerrarSesion, crearCuenta, idAnonimo, iniciarSesion, sesionActual, tokenActual, usuarioIdActual } from './auth'

/* Cognito se contesta con un doble de fetch: estos casos prueban QUÉ hace la
   tienda con la respuesta del user pool (qué guarda, qué id usa, qué rol
   deduce), no el servicio de AWS. La integración real se verifica contra el
   pool del lab y queda en evidencias/56. */

const COGNITO = 'https://cognito-idp.us-east-1.amazonaws.com/'

/** ID token de mentira pero con la forma real: header.payload.firma */
function idToken(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${b64({ alg: 'RS256' })}.${b64({ token_use: 'id', exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.firma`
}

function respondeCognito(cuerpo: unknown, ok = true, estado = 200) {
  return vi.fn(async (url: string | URL | Request) => {
    expect(String(url)).toBe(COGNITO)
    return {
      ok,
      status: estado,
      text: async () => JSON.stringify(cuerpo),
    } as Response
  })
}

const tokensDe = (claims: Record<string, unknown>) => ({
  AuthenticationResult: {
    IdToken: idToken(claims),
    AccessToken: 'acceso',
    RefreshToken: 'refresco',
    ExpiresIn: 3600,
  },
})

beforeEach(() => {
  localStorage.clear()
  /* La tienda sólo intenta hablar con Cognito si hay client id configurado. */
  window.PEDIDOS360_CONFIG = { ...(window.PEDIDOS360_CONFIG ?? {}), cognitoRegion: 'us-east-1', cognitoClientId: 'cliente-de-prueba' }
})

afterEach(() => vi.unstubAllGlobals())

describe('identidad', () => {
  it('el id anónimo se crea una vez y se reutiliza (no uno por intento)', () => {
    const a = idAnonimo()
    expect(a).toMatch(/^anon-/)
    expect(idAnonimo()).toBe(a)
    expect(usuarioIdActual(null)).toBe(a)
  })

  it('logueado, el usuarioId es el email del ID token y sobrevive a una recarga', async () => {
    vi.stubGlobal('fetch', respondeCognito(tokensDe({ email: 'ana@correo.cl', name: 'Ana Rojas', 'cognito:groups': ['cliente'] })))
    const r = await iniciarSesion(' Ana@Correo.cl ', 'la-del-pool')
    expect(r.ok).toBe(true)
    expect(sesionActual()?.email).toBe('ana@correo.cl')
    expect(sesionActual()?.nombre).toBe('Ana Rojas')
    expect(usuarioIdActual()).toBe('ana@correo.cl')
    /* El ID token queda guardado: es lo que viaja en Authorization. */
    expect(tokenActual()).toContain('.')
  })

  it('el rol admin sale del grupo de Cognito, no de una tabla del frontend', async () => {
    vi.stubGlobal('fetch', respondeCognito(tokensDe({ email: 'admin@pedidos360.cl', 'cognito:groups': ['admin'] })))
    const r = await iniciarSesion('admin@pedidos360.cl', 'la-del-pool')
    expect(r.ok && r.sesion.rol).toBe('admin')

    localStorage.clear()
    vi.stubGlobal('fetch', respondeCognito(tokensDe({ email: 'ana@correo.cl', 'cognito:groups': ['cliente'] })))
    const c = await iniciarSesion('ana@correo.cl', 'la-del-pool')
    expect(c.ok && c.sesion.rol).toBe('cliente')
  })

  it('el id cumple el formato que valida ms-carrito (X-Usuario-Id)', async () => {
    expect(idAnonimo()).toMatch(/^[A-Za-z0-9_.@:-]{1,64}$/)
    vi.stubGlobal('fetch', respondeCognito(tokensDe({ email: 'admin@pedidos360.cl', 'cognito:groups': ['admin'] })))
    await iniciarSesion('admin@pedidos360.cl', 'la-del-pool')
    expect(usuarioIdActual()).toMatch(/^[A-Za-z0-9_.@:-]{1,64}$/)
  })

  it('traduce el error de Cognito y no deja sesión a medias', async () => {
    vi.stubGlobal('fetch', respondeCognito({ __type: 'NotAuthorizedException', message: 'Incorrect username or password.' }, false, 400))
    const r = await iniciarSesion('ana@correo.cl', 'mala')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toBe('Correo o contraseña incorrectos.')
    expect(sesionActual()).toBeNull()
    expect(tokenActual()).toBeNull()
  })

  it('cerrar sesión vuelve al anónimo y suelta el token', async () => {
    const anon = idAnonimo()
    vi.stubGlobal('fetch', respondeCognito(tokensDe({ email: 'ana@correo.cl', 'cognito:groups': ['cliente'] })))
    await iniciarSesion('ana@correo.cl', 'la-del-pool')
    cerrarSesion()
    expect(usuarioIdActual()).toBe(anon)
    expect(tokenActual()).toBeNull()
  })

  it('sin Cognito configurado lo dice en vez de fallar con un error de red', async () => {
    window.PEDIDOS360_CONFIG = { ...(window.PEDIDOS360_CONFIG ?? {}), cognitoClientId: '' }
    const llamada = vi.fn()
    vi.stubGlobal('fetch', llamada)
    const r = await iniciarSesion('ana@correo.cl', 'x')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/COGNITO_CLIENT_ID/)
    expect(llamada).not.toHaveBeenCalled()
  })
})

describe('crear cuenta', () => {
  it('registra, entra sola y deja la sesión lista', async () => {
    /* SignUp y despues InitiateAuth: la cuenta queda confirmada por el trigger
       PreSignUp, asi que no hay que pedir ningun codigo. */
    const respuestas = [
      { UserConfirmed: true, UserSub: 'sub-1' },
      tokensDe({ email: 'nueva@correo.cl', name: 'Persona Nueva', 'cognito:groups': [] }),
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(respuestas.shift()) }) as Response))
    const r = await crearCuenta('  Nueva@Correo.cl ', 'Cordillera2026', 'Persona Nueva')
    expect(r.ok).toBe(true)
    expect(sesionActual()?.email).toBe('nueva@correo.cl')
    expect(sesionActual()?.rol).toBe('cliente')
    expect(tokenActual()).toContain('.')
  })

  it('si la cuenta quedara sin confirmar, lo dice y no inventa una sesión', async () => {
    vi.stubGlobal('fetch', respondeCognito({ UserConfirmed: false, UserSub: 'sub-2' }))
    const r = await crearCuenta('otra@correo.cl', 'Cordillera2026', 'Otra')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/confirmarse por correo/)
    expect(sesionActual()).toBeNull()
  })

  it('traduce el correo ya registrado', async () => {
    vi.stubGlobal('fetch', respondeCognito({ __type: 'UsernameExistsException', message: 'User already exists' }, false, 400))
    const r = await crearCuenta('ana@correo.cl', 'Cordillera2026', 'Ana')
    expect(r.ok === false && r.error).toMatch(/Ya existe una cuenta/)
  })

  it('traduce la contraseña que no cumple la política', async () => {
    vi.stubGlobal('fetch', respondeCognito({ __type: 'InvalidPasswordException', message: 'Password did not conform' }, false, 400))
    const r = await crearCuenta('otra2@correo.cl', 'corta', 'Otra')
    expect(r.ok === false && r.error).toMatch(/10 caracteres/)
  })
})
