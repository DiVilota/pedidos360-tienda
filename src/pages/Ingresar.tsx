import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Aviso } from '../components/ui'
import { COGNITO } from '../config'
import { CUENTAS_PRUEBA } from '../lib/auth'
import { useTienda } from '../state/contexto'

/* ---------------------------------------------------------------------------
   Ingreso con cuentas de **Amazon Cognito** (§12 del contrato, fase 4). Toda la
   lógica de identidad está en lib/auth.ts + lib/cognito.ts y esta pantalla sólo
   la usa: acá no hay contraseñas ni roles escritos a mano.
   `volver` sólo acepta rutas internas ("/…") para que un enlace armado no
   pueda redirigir a otro sitio después del login.
   ------------------------------------------------------------------------- */

const rutaSegura = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : null)

export function Ingresar() {
  const { ingresar, registrarse, sesion } = useTienda()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const [modo, setModo] = useState<'entrar' | 'crear'>(params.get('modo') === 'crear' ? 'crear' : 'entrar')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const volver = rutaSegura(params.get('volver'))
  const porCompra = params.get('motivo') === 'compra'
  const crear = modo === 'crear'

  if (sesion && !enviando) return <Navigate to={volver ?? (sesion.rol === 'admin' ? '/admin' : '/')} replace />

  /* La política del user pool, dicha ANTES de que Cognito la rechace: si el
     requisito aparece recién como error del servidor, el usuario escribe tres
     contraseñas hasta adivinar qué falta. */
  const claveCorta = crear && clave.length > 0 && clave.length < 10
  const claveSinVariedad = crear && clave.length >= 10 && !(/[a-z]/.test(clave) && /[A-Z]/.test(clave) && /\d/.test(clave))
  const claveInvalida = claveCorta || claveSinVariedad

  const cambiarModo = (nuevo: 'entrar' | 'crear') => {
    setModo(nuevo)
    setError(null)
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (crear && claveInvalida) return
    setEnviando(true)
    setError(null)
    const r = crear ? await registrarse(email, clave, nombre) : await ingresar(email, clave)
    if (!r.ok) {
      setError(r.error)
      setEnviando(false)
      return
    }
    navegar(volver ?? (r.sesion.rol === 'admin' ? '/admin' : '/'), { replace: true })
  }

  return (
    <section className="pagina" style={{ maxWidth: 460 }}>
      <div className="eyebrow">// acceso</div>
      <h1 className="h1">{crear ? 'Crear cuenta' : 'Ingresar'}</h1>
      <p className="muted" style={{ margin: '8px 0 18px' }}>
        {crear
          ? 'Tu cuenta se crea en Amazon Cognito. La tienda no guarda tu contraseña.'
          : porCompra
            ? 'Ingresa para finalizar tu compra. Tu carrito se mantiene.'
            : 'Ingresa para seguir tus pedidos o administrar la tienda.'}
      </p>

      <div className="pestanas" role="tablist" aria-label="Entrar o crear una cuenta" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={!crear} className={`pestana${!crear ? ' pestana--activa' : ''}`} onClick={() => cambiarModo('entrar')}>
          Ya tengo cuenta
        </button>
        <button type="button" role="tab" aria-selected={crear} className={`pestana${crear ? ' pestana--activa' : ''}`} onClick={() => cambiarModo('crear')}>
          Crear una cuenta
        </button>
      </div>

      <form onSubmit={enviar} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
        {crear && (
          <div>
            <label htmlFor="nom" className="etiqueta">
              Nombre
            </label>
            <input id="nom" className="input input--grande" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" placeholder="Como quieres que te saludemos" />
          </div>
        )}
        <div>
          <label htmlFor="em" className="etiqueta">
            Correo
          </label>
          <input
            id="em"
            className="input input--grande"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label htmlFor="pw" className="etiqueta">
            Contraseña
          </label>
          <input
            id="pw"
            className="input input--grande"
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete={crear ? 'new-password' : 'current-password'}
            aria-describedby={crear ? 'pw-ayuda' : undefined}
            aria-invalid={claveInvalida || undefined}
            required
          />
          {crear && (
            <p id="pw-ayuda" className={claveInvalida ? 'texto-malo' : 'tenue'} style={{ fontSize: 12, marginTop: 6 }}>
              {claveCorta
                ? `Faltan ${10 - clave.length} caracteres (mínimo 10).`
                : claveSinVariedad
                  ? 'Necesita una mayúscula, una minúscula y un número.'
                  : 'Mínimo 10 caracteres, con mayúscula, minúscula y número.'}
            </p>
          )}
        </div>
        {error && <Aviso tono="bad">{error}</Aviso>}
        <button type="submit" className="btn btn--primario btn--grande" disabled={enviando || !email || !clave || (crear && claveInvalida)}>
          {enviando ? (crear ? 'Creando tu cuenta…' : 'Ingresando…') : crear ? 'Crear cuenta y entrar' : 'Ingresar'}
        </button>
      </form>
      <div style={{ marginTop: 22 }}>
        {crear ? (
          <p className="tenue" style={{ fontSize: 12.5 }}>
            Al crear la cuenta entras de inmediato: el user pool la confirma sin pedirte un código, porque el
            entorno de la evaluación no envía correos. <Link to="/">Volver a la tienda</Link>
          </p>
        ) : (
          <>
            <div className="etiqueta">Cuentas de prueba</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CUENTAS_PRUEBA.map((c) => (
                <button
                  type="button"
                  key={c.email}
                  className="btn btn--ghost"
                  onClick={() => {
                    setEmail(c.email)
                    setError(null)
                  }}
                >
                  {c.etiqueta} · {c.email}
                </button>
              ))}
            </div>
            <p className="tenue" style={{ fontSize: 12, marginTop: 12 }}>
              {COGNITO.clientId ? (
                <>
                  Las cuentas y las contraseñas viven en el user pool de Amazon Cognito; la tienda no las guarda.{' '}
                  <Link to="/">Volver a la tienda</Link>
                </>
              ) : (
                <>
                  Esta copia de la tienda no tiene configurado Cognito (<code>COGNITO_CLIENT_ID</code>), así que no se puede
                  iniciar sesión. El catálogo y el carrito funcionan igual. <Link to="/">Volver a la tienda</Link>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </section>
  )
}

export function NoEncontrada() {
  return (
    <section className="resultado">
      <div className="resultado__icono resultado__icono--warn" aria-hidden="true">
        ?
      </div>
      <h1 className="h1">Página no encontrada</h1>
      <p className="muted">La dirección no corresponde a ninguna sección de la tienda.</p>
      <div className="acciones">
        <Link to="/" className="btn btn--primario">
          Ir a la tienda
        </Link>
      </div>
    </section>
  )
}
