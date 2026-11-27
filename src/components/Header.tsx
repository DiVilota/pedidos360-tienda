import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SERVICIOS } from '../config'
import { resumirSalud } from '../hooks/useSalud'
import { pedidos as apiPedidos } from '../lib/api'
import { haceCuanto } from '../lib/format'
import { agrupar, tieneRuta } from '../lib/pedidos'
import type { Pedido } from '../lib/types'
import { useTienda, type EstadoServicio } from '../state/contexto'
import { Avatar, IconoCampana, Logo } from './iconos'

const TEXTO_SERVICIO: Record<Exclude<EstadoServicio, null>, string> = {
  arriba: 'UP',
  degradado: 'degradado',
  caido: 'sin respuesta',
}
const TONO_SERVICIO: Record<Exclude<EstadoServicio, null>, string> = { arriba: 'ok', degradado: 'warn', caido: 'bad' }

/* Insignia de salud. En el prototipo estaba escondida (display:none) y decía
   "backend conectado" en cuanto UNA llamada respondía; ahora resume el
   /actuator/health de los cinco servicios y el detalle está a un clic. */
function InsigniaSalud() {
  const { salud, revisarSalud } = useTienda()
  const [abierto, setAbierto] = useState(false)
  const r = resumirSalud(salud)
  return (
    <div className="salud">
      <button type="button" className="salud__btn" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-haspopup="dialog">
        <span className={`punto punto--${r.tono === 'neutral' ? '' : r.tono}`} />
        {r.etiqueta}
      </button>
      {abierto && (
        <>
          <div className="cierre-fondo" onClick={() => setAbierto(false)} />
          <div className="popover" role="dialog" aria-label="Estado de los servicios">
            {SERVICIOS.map((s) => {
              const e = salud[s.clave]
              return (
                <div className="salud__fila" key={s.clave}>
                  <span className={`punto ${e ? `punto--${TONO_SERVICIO[e]}` : ''}`} />
                  <span>{s.nombre}</span>
                  <span>{e ? TEXTO_SERVICIO[e] : '…'}</span>
                </div>
              )
            })}
            <div className="salud__pie">
              <span>/actuator/health · cada 20 s</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={revisarSalud}>
                Revisar ahora
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Campana() {
  const { notificaciones, noLeidas, marcarLeida, marcarTodas, estadoStream, reconectarStream } = useTienda()
  const [abierto, setAbierto] = useState(false)
  const navegar = useNavigate()
  const estado =
    estadoStream === 'abierto'
      ? 'en vivo'
      : estadoStream === 'sondeo'
        ? 'al día · se actualiza cada 5 s'
        : estadoStream === 'rendido'
        ? 'sin conexión'
        : estadoStream === 'reintentando'
          ? 'reconectando…'
          : 'conectando…'

  return (
    <div className="campana">
      <button
        type="button"
        className="campana__btn"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Notificaciones${noLeidas ? `, ${noLeidas} sin leer` : ''}`}
        aria-expanded={abierto}
      >
        <IconoCampana />
        {noLeidas > 0 && (
          <span className="campana__n" key={noLeidas}>
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>
      {abierto && (
        <>
          <div className="cierre-fondo" onClick={() => setAbierto(false)} />
          <div className="popover notifs" role="dialog" aria-label="Notificaciones">
            <div className="notifs__cab">
              <b>Notificaciones</b>
              <button type="button" className="btn btn--ghost btn--sm" onClick={marcarTodas} disabled={noLeidas === 0}>
                Marcar todas como leídas
              </button>
            </div>
            <div className="notifs__lista">
              {notificaciones.length === 0 && (
                <p style={{ padding: '22px 14px', margin: 0, color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
                  Aún no tienes notificaciones. Te avisaremos cuando agregues productos, compres o tu pedido avance.
                </p>
              )}
              {notificaciones.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  className={`notif${n.leida ? ' notif--leida' : ''}`}
                  onClick={() => {
                    if (!n.leida) marcarLeida(n.id)
                    if (n.idPedido) {
                      setAbierto(false)
                      navegar('/pedidos')
                    }
                  }}
                >
                  <span className="notif__marca" aria-hidden="true" />
                  <span>
                    <b>{n.titulo}</b>
                    <p>{n.mensaje}</p>
                    <small>
                      {haceCuanto(n.creadaEn)}
                      {n.idPedido ? ` · ${n.idPedido}` : ''}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <div className="notifs__pie">
              <span>
                <span className={`punto punto--${estadoStream === 'abierto' || estadoStream === 'sondeo' ? 'ok' : estadoStream === 'rendido' ? 'bad' : 'warn'}`} style={{ display: 'inline-block', marginRight: 6 }} />
                {estado}
              </span>
              {estadoStream === 'rendido' && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={reconectarStream}>
                  Reintentar
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MenuCuenta() {
  const { sesion, usuarioId, salir, abrirDeseos, deseos, eventoTick } = useTienda()
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState<Pedido[] | null>(null)
  const navegar = useNavigate()

  /* Los pedidos del menú se piden al abrirlo (no en cada carga de página):
     son un dato del menú, no de la tienda. */
  useEffect(() => {
    if (!abierto || sesion?.rol !== 'cliente') return
    let vivo = true
    apiPedidos
      .listar(usuarioId)
      .then((l) => vivo && setLista(l))
      .catch(() => vivo && setLista(null))
    return () => {
      vivo = false
    }
  }, [abierto, sesion, usuarioId, eventoTick])

  if (!sesion) return null
  const { enCurso } = agrupar(lista ?? [])
  const conRuta = enCurso.find((p) => tieneRuta(p))
  const ir = (ruta: string) => {
    setAbierto(false)
    navegar(ruta)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="avatar"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Menú de ${sesion.nombre}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
      >
        <Avatar />
      </button>
      <span className="avatar__online" aria-hidden="true" />
      {abierto && (
        <>
          <div className="cierre-fondo" onClick={() => setAbierto(false)} />
          <div className="popover menu" role="menu" aria-label="Cuenta">
            <div className="menu__cab">
              <div style={{ width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--accent)', overflow: 'hidden', flex: 'none' }}>
                <Avatar tam={42} />
              </div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b>{sesion.nombre}</b>
                <span style={{ fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sesion.email}
                </span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ok)' }}>
                  ● {sesion.rol === 'admin' ? 'administrador' : 'cliente'}
                </span>
              </div>
            </div>
            {sesion.rol === 'cliente' && (
              <>
                <button type="button" role="menuitem" className="menu__item" onClick={() => ir('/pedidos')}>
                  Mis pedidos<small>{lista ? `${enCurso.length} en curso` : '…'}</small>
                </button>
                {conRuta && (
                  <button type="button" role="menuitem" className="menu__item" onClick={() => ir(`/pedidos?ruta=${encodeURIComponent(conRuta.id)}`)}>
                    Seguir mi envío<small>{conRuta.id}</small>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="menu__item"
                  onClick={() => {
                    setAbierto(false)
                    abrirDeseos()
                  }}
                >
                  Lista de deseos<small>{deseos.length}</small>
                </button>
              </>
            )}
            {sesion.rol === 'admin' && (
              <button type="button" role="menuitem" className="menu__item" onClick={() => ir('/admin')}>
                Panel admin<small>stock · ventas</small>
              </button>
            )}
            <div className="menu__sep" />
            <button
              type="button"
              role="menuitem"
              className="menu__item menu__item--salir"
              onClick={() => {
                setAbierto(false)
                salir()
                navegar('/')
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function Header() {
  const { sesion, abrirCarrito, abrirDeseos, deseos, cantidadCarrito, bump } = useTienda()
  return (
    <header className="header">
      <Link to="/" className="marca" aria-label="Pedidos360, ir al inicio">
        <Logo />
        <span className="marca__texto">
          Pedidos<span>360</span>
        </span>
      </Link>
      <div className="header__acciones">
        <InsigniaSalud />
        <Campana />
        <button type="button" className="btn btn--contorno header__btn" onClick={abrirDeseos}>
          Deseos <span className="contador contador--claro">{deseos.length}</span>
        </button>
        <button type="button" className="btn btn--primario header__btn" onClick={abrirCarrito}>
          Carrito <span className={`contador${bump ? ' contador--bump' : ''}`}>{cantidadCarrito}</span>
        </button>
        {sesion ? (
          <MenuCuenta />
        ) : (
          /* Dos accesos, no uno: con solo "Ingresar", quien no tiene cuenta no
             sabe que puede crearla y abandona en la puerta. */
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/ingresar" className="btn btn--ghost" style={{ height: 40, fontSize: 13 }}>
              Ingresar
            </Link>
            <Link to="/ingresar?modo=crear" className="btn btn--primario" style={{ height: 40, fontSize: 13 }}>
              Crear cuenta
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
