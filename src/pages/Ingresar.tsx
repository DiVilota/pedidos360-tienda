import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Aviso } from '../components/ui'
import { CUENTAS_PRUEBA } from '../lib/auth'
import { useTienda } from '../state/contexto'

/* ---------------------------------------------------------------------------
   Pantalla de ingreso: cuentas de demostración + botón "Iniciar sesión con
   Microsoft" (Azure Entra ID). La lógica de identidad está en lib/auth.ts.
   `volver` sólo acepta rutas internas ("/…") para que un enlace armado no
   pueda redirigir a otro sitio después del login.
   ------------------------------------------------------------------------- */

const rutaSegura = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : null)

/* Logo de Microsoft inline como SVG (evita dependencia de CDN). */
function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 10, flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

export function Ingresar() {
  const { ingresar, ingresarConAzure, sesion } = useTienda()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviandoAzure, setEnviandoAzure] = useState(false)
  const volver = rutaSegura(params.get('volver'))
  const porCompra = params.get('motivo') === 'compra'

  if (sesion && !enviando && !enviandoAzure) return <Navigate to={volver ?? (sesion.rol === 'admin' ? '/admin' : '/')} replace />

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    const r = await ingresar(email, clave)
    if (!r.ok) {
      setError(r.error)
      setEnviando(false)
      return
    }
    navegar(volver ?? (r.sesion.rol === 'admin' ? '/admin' : '/'), { replace: true })
  }

  const entrarConMicrosoft = async () => {
    setEnviandoAzure(true)
    setError(null)
    const r = await ingresarConAzure()
    if (!r.ok) {
      setError(r.error)
      setEnviandoAzure(false)
      return
    }
    navegar(volver ?? '/', { replace: true })
  }

  return (
    <section className="pagina" style={{ maxWidth: 460 }}>
      <div className="eyebrow">// acceso</div>
      <h1 className="h1">Ingresar</h1>
      <p className="muted" style={{ margin: '8px 0 22px' }}>
        {porCompra
          ? 'Ingresa para finalizar tu compra. Tu carrito se mantiene.'
          : 'Ingresa para seguir tus pedidos o administrar la tienda.'}
      </p>

      {/* ---- Botón de Microsoft Azure ---- */}
      <button
        type="button"
        className="btn btn--grande"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          color: '#3c4043',
          border: '1px solid #dadce0',
          fontWeight: 500,
          fontSize: 15,
          padding: '12px 16px',
          borderRadius: 6,
          cursor: 'pointer',
          marginBottom: 8,
        }}
        disabled={enviandoAzure || enviando}
        onClick={entrarConMicrosoft}
      >
        <MicrosoftLogo />
        {enviandoAzure ? 'Conectando con Microsoft…' : 'Iniciar sesión con Microsoft'}
      </button>

      {/* ---- Separador ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--borde, #333)' }} />
        <span className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>o</span>
        <div style={{ flex: 1, height: 1, background: 'var(--borde, #333)' }} />
      </div>

      {/* ---- Formulario de cuentas demo ---- */}
      <form onSubmit={enviar} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
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
            autoComplete="current-password"
            required
          />
        </div>
        {error && <Aviso tono="bad">{error}</Aviso>}
        <button type="submit" className="btn btn--primario btn--grande" disabled={enviando || enviandoAzure || !email || !clave}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <div style={{ marginTop: 22 }}>
        <div className="etiqueta">Cuentas de prueba</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CUENTAS_PRUEBA.map((c) => (
            <button
              type="button"
              key={c.email}
              className="btn btn--ghost"
              onClick={() => {
                setEmail(c.email)
                setClave(c.clave)
                setError(null)
              }}
            >
              {c.etiqueta} · {c.email}
            </button>
          ))}
        </div>
        <p className="tenue" style={{ fontSize: 12, marginTop: 12 }}>
          Acceso de demostración o con tu cuenta institucional Microsoft. <Link to="/">Volver a la tienda</Link>
        </p>
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
