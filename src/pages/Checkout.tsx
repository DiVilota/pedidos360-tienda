import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ImagenProducto } from '../components/ImagenProducto'
import { Aviso, Vacio } from '../components/ui'
import { ApiError, carrito as apiCarrito, pedidos as apiPedidos } from '../lib/api'
import {
  ENTREGA_VACIA,
  SUCURSALES,
  formatearTarjeta,
  horaBloqueo,
  luhnValido,
  notaEnvio,
  urlResultadoSimulado,
  validarEntrega,
  type DatosEntrega,
  type DesenlacePago,
  type ErroresEntrega,
} from '../lib/checkout'
import { etiquetaCategoria } from '../lib/catalogo'
import { ejecutarPago, guardarEntrega, quedaPendiente } from '../lib/flujoPago'
import { clp } from '../lib/format'
import type { ErrorStock, ItemCarrito, MetodoEnvio, Pasarela, Pedido } from '../lib/types'
import { irAWebpay } from '../lib/webpay'
import { useTienda } from '../state/contexto'

/* ---------------------------------------------------------------------------
   Checkout en dos pasos, cada uno contra el servicio que manda:

   Paso «Entrega»  → PUT /api/carrito/envio. ms-carrito responde el carrito
                     con el costo de envío calculado, así el total que se ve
                     al pagar es EL del servicio y no una cuenta de la tienda.
   Paso «Pago»     → POST /api/pedidos (reserva stock, PENDIENTE_PAGO) y
                     POST /api/pagos/iniciar con origen TIENDA.

   Si el pago no se resuelve (429 antifraude, servicio caído), el pedido queda
   en la URL (?pedido=P-12): recargar o volver desde «Mis pedidos» retoma el
   MISMO pedido en vez de reservar stock dos veces.
   ------------------------------------------------------------------------- */

/* Tarjetas de prueba de la pasarela SIMULADA de ms-pago: aprueba todo salvo
   lo que termina en 0002 (PasarelaSimulada.SUFIJO_RECHAZO). Ambas pasan Luhn. */
const TARJETAS_PRUEBA = [
  { etiqueta: 'Aprobada', numero: '4051 8856 0044 6623' },
  { etiqueta: 'Rechazada', numero: '4000 0000 0000 0002' },
]

type Fallo = { titulo: string; texto: ReactNode; tono: 'bad' | 'warn' }

function Campo(props: {
  id: keyof DatosEntrega
  etiqueta: string
  valor: string
  error?: string
  onChange: (v: string) => void
  tipo?: string
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <div>
      <label htmlFor={`f-${props.id}`} className="etiqueta">
        {props.etiqueta}
      </label>
      <input
        id={`f-${props.id}`}
        className={`input input--grande${props.error ? ' input--error' : ''}`}
        type={props.tipo ?? 'text'}
        value={props.valor}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        aria-invalid={Boolean(props.error)}
        aria-describedby={props.error ? `e-${props.id}` : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error && (
        <div className="error-campo" id={`e-${props.id}`}>
          {props.error}
        </div>
      )}
    </div>
  )
}

function Lineas({ items, catalogoCat }: { items: ItemCarrito[]; catalogoCat: (slug: string) => string }) {
  return (
    <div>
      {items.map((i) => (
        <div className="item-resumen" key={i.productoId}>
          <ImagenProducto nombre={i.nombre} categoria={i.categoria} etiquetaCategoria={catalogoCat(i.categoria)} tam="xs" />
          <span>
            {i.nombre} <span className="tenue">× {i.cantidad}</span>
          </span>
          <span>{clp(i.subtotal ?? i.precioUnitario * i.cantidad)}</span>
        </div>
      ))}
    </div>
  )
}

export function Checkout() {
  const { usuarioId, sesion, carrito, fijarCarrito, refrescarCarrito, categorias, catalogo, refrescarRecomendaciones } = useTienda()
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const idPedidoUrl = params.get('pedido')

  const [paso, setPaso] = useState<'entrega' | 'pago'>(idPedidoUrl ? 'pago' : 'entrega')
  const [metodo, setMetodo] = useState<MetodoEnvio>(carrito?.metodoEnvio ?? 'ENVIO')
  const [datos, setDatos] = useState<DatosEntrega>(() => ({ ...ENTREGA_VACIA, nombre: sesion?.nombre ?? '' }))
  const [errores, setErrores] = useState<ErroresEntrega>({})
  const [guardando, setGuardando] = useState(false)

  const [cupon, setCupon] = useState('')
  const [cuponError, setCuponError] = useState<string | null>(null)
  const [cuponOcupado, setCuponOcupado] = useState(false)

  const [pasarela, setPasarela] = useState<Pasarela>('WEBPAY')
  const [tarjeta, setTarjeta] = useState('')
  const [tarjetaError, setTarjetaError] = useState<string | null>(null)
  const [pagando, setPagando] = useState(false)
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const [faltantes, setFaltantes] = useState<ErrorStock['faltantes']>([])

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [pedidoError, setPedidoError] = useState<string | null>(null)

  /* La lista de sucursales la publica ms-carrito (GET /api/carrito/sucursales);
     la constante local es sólo el respaldo si el servicio no responde, y es
     la misma lista cerrada del enum Sucursal del backend. */
  const [sucursales, setSucursales] = useState<{ nombre: string; direccion: string }[]>([...SUCURSALES])
  useEffect(() => {
    let vivo = true
    apiCarrito
      .sucursales()
      .then((l) => vivo && Array.isArray(l) && l.length > 0 && setSucursales(l.map((s) => ({ nombre: s.nombre, direccion: s.direccion }))))
      .catch(() => {
        /* se queda con el respaldo local */
      })
    return () => {
      vivo = false
    }
  }, [])

  const nombreCat = (slug: string) => etiquetaCategoria(slug, categorias)

  /* Retomar un pedido pendiente (desde «Mis pedidos» o tras recargar). */
  useEffect(() => {
    if (!idPedidoUrl) {
      setPedido(null)
      return
    }
    let vivo = true
    apiPedidos
      .obtener(usuarioId, idPedidoUrl)
      .then((p) => {
        if (!vivo) return
        setPedido(p)
        setPaso('pago')
        if (p.estado !== 'PENDIENTE_PAGO') setPedidoError(`El pedido ${p.id} ya no espera pago (estado: ${p.estado}).`)
      })
      .catch((e: unknown) => vivo && setPedidoError(e instanceof ApiError && e.status === 404 ? 'No encontramos ese pedido.' : 'No se pudo leer el pedido en ms-carrito.'))
    return () => {
      vivo = false
    }
  }, [idPedidoUrl, usuarioId])

  /* Si el carrito ya tenía entrega guardada, se precarga UNA vez (sin
     inventar datos): después manda lo que el cliente edite. */
  const precargado = useRef(false)
  useEffect(() => {
    if (precargado.current || !carrito?.envioDefinido) return
    precargado.current = true
    setMetodo((m) => carrito.metodoEnvio ?? m)
    setDatos((d) => ({
      ...d,
      comuna: d.comuna || carrito.comuna || '',
      sucursal: d.sucursal || SUCURSALES.find((s) => carrito.sucursal?.startsWith(s.nombre))?.nombre || '',
    }))
  }, [carrito])

  const items = pedido ? pedido.items : (carrito?.items ?? [])
  const stockDe = useMemo(() => new Map(catalogo.map((p) => [p.id, p.stock])), [catalogo])

  if (!pedido && !idPedidoUrl && carrito && carrito.items.length === 0) {
    return (
      <section className="pagina pagina--angosta">
        <div className="eyebrow">// checkout</div>
        <h1 className="h1" style={{ marginBottom: 20 }}>
          Finalizar compra
        </h1>
        <Vacio>
          No tienes productos en el carrito.
          <Link to="/#productos" className="btn btn--ghost">
            Ver productos
          </Link>
        </Vacio>
      </section>
    )
  }

  const fijar = (k: keyof DatosEntrega, v: string) => {
    setDatos((d) => ({ ...d, [k]: v }))
    if (errores[k]) setErrores((e) => ({ ...e, [k]: undefined }))
  }

  const continuarAPago = async () => {
    const e = validarEntrega(datos, metodo)
    setErrores(e)
    if (Object.keys(e).length > 0) return
    setGuardando(true)
    setFallo(null)
    const r = await guardarEntrega(usuarioId, metodo, datos)
    setGuardando(false)
    if (!r.ok) {
      setFallo({ titulo: 'No se pudo guardar la entrega', texto: r.mensaje, tono: 'bad' })
      return
    }
    fijarCarrito(r.carrito)
    refrescarRecomendaciones()
    setPaso('pago')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const aplicarCupon = async () => {
    if (!cupon.trim()) return
    setCuponOcupado(true)
    setCuponError(null)
    try {
      fijarCarrito(await apiCarrito.aplicarCupon(usuarioId, cupon.trim()))
      setCupon('')
      refrescarRecomendaciones()
    } catch (e) {
      /* 404 = no existe o no vigente · 422 = no alcanza el mínimo. El texto lo
         redacta ms-carrito con el monto exacto que falta. */
      setCuponError(e instanceof ApiError && e.esDeRed ? 'El carrito no responde.' : (e as Error).message)
    } finally {
      setCuponOcupado(false)
    }
  }

  const quitarCupon = async () => {
    setCuponOcupado(true)
    try {
      fijarCarrito(await apiCarrito.quitarCupon(usuarioId))
    } catch (e) {
      setCuponError((e as Error).message)
    } finally {
      setCuponOcupado(false)
    }
  }

  const presentar = (d: DesenlacePago, p: Pedido) => {
    switch (d.tipo) {
      case 'webpay':
        /* Webpay exige POST de token_ws y vuelve por redirect de ms-pago a
           /callback: misma pestaña, ver lib/webpay.ts. */
        irAWebpay(d.url, d.token)
        return
      case 'aprobado':
      case 'rechazado':
        navegar(urlResultadoSimulado(d, p.total))
        return
      case 'antifraude': {
        const hora = horaBloqueo(d.bloqueadoHasta)
        setFallo({
          tono: 'bad',
          titulo: 'Pago bloqueado por seguridad',
          texto: (
            <>
              {d.mensaje}
              {d.intentos != null && <> Detectamos {d.intentos} intentos con la misma tarjeta en pocos segundos.</>}
              {hora && (
                <>
                  {' '}
                  Podrás volver a intentar después de las <b style={{ display: 'inline' }}>{hora}</b>.
                </>
              )}{' '}
              Tu pedido {p.id} sigue reservado y no se realizó ningún cobro.
            </>
          ),
        })
        return
      }
      default:
        setFallo({ tono: 'warn', titulo: 'No se pudo completar el pago', texto: `${d.mensaje} Tu pedido ${p.id} sigue esperando pago; puedes reintentar.` })
    }
  }

  const pagar = async () => {
    if (pasarela === 'SIMULADA' && !luhnValido(tarjeta)) {
      setTarjetaError('Revisa el número: no es una tarjeta válida.')
      return
    }
    setPagando(true)
    setFallo(null)
    setFaltantes([])
    const r = await ejecutarPago({
      usuarioId,
      pasarela,
      numeroTarjeta: pasarela === 'SIMULADA' ? tarjeta : undefined,
      pedidoPendiente: pedido,
      alActualizarCarrito: fijarCarrito,
    })
    if (!r.ok) {
      setPagando(false)
      if (r.faltantes?.length) {
        setFaltantes(r.faltantes)
        void refrescarCarrito()
      }
      setFallo({ titulo: r.paso === 'pedido' ? 'No se pudo crear el pedido' : 'No se pudo iniciar el pago', texto: r.mensaje, tono: 'bad' })
      if (r.pedido) setPedido(r.pedido)
      return
    }
    /* Desde acá el pedido existe: se fija en la URL para que un reintento o
       una recarga usen el mismo id (y la misma reserva de stock). */
    setPedido(r.pedido)
    if (idPedidoUrl !== r.pedido.id) setParams({ pedido: r.pedido.id }, { replace: true })
    presentar(r.desenlace, r.pedido)
    /* Webpay navega fuera y aprobado/rechazado van a /callback: sólo un
       desenlace que deja el pedido pendiente vuelve a habilitar el botón. */
    if (quedaPendiente(r.desenlace)) setPagando(false)
  }

  /* Montos: los del pedido si ya existe; si no, los del carrito (ms-carrito). */
  const m = pedido ?? carrito
  const envioTexto =
    pedido || (carrito?.envioDefinido && carrito.metodoEnvio === metodo)
      ? m && m.costoEnvio === 0
        ? 'Gratis'
        : clp(m?.costoEnvio)
      : metodo === 'RETIRO'
        ? 'Gratis'
        : 'Se calcula al continuar'
  const total = pedido || (carrito?.envioDefinido && carrito.metodoEnvio === metodo) ? m?.total : (carrito?.subtotal ?? 0) - (carrito?.descuento ?? 0)
  const pedidoNoPagable = pedido != null && pedido.estado !== 'PENDIENTE_PAGO'

  return (
    <section className="pagina">
      <Link to="/#productos" className="btn btn--ghost btn--sm" style={{ marginBottom: 18 }}>
        ← Seguir comprando
      </Link>
      <div className="eyebrow">// checkout · {paso === 'entrega' ? 'paso 1 de 2' : 'paso 2 de 2'}</div>
      <h1 className="h1" style={{ marginBottom: 24 }}>
        Finalizar compra
      </h1>

      <div className="dos-col">
        <div className="dos-col__main">
          {pedidoError && <Aviso tono="warn">{pedidoError}</Aviso>}

          {paso === 'entrega' && (
            <>
              <div className="panel">
                <h2>1 · Método de entrega</h2>
                <div className="opciones" role="radiogroup" aria-label="Método de entrega">
                  <button type="button" role="radio" aria-checked={metodo === 'ENVIO'} className={`opcion${metodo === 'ENVIO' ? ' opcion--activa' : ''}`} onClick={() => setMetodo('ENVIO')}>
                    <b>Envío a domicilio</b>
                    <span>{notaEnvio(carrito?.subtotal ?? 0)}</span>
                  </button>
                  <button type="button" role="radio" aria-checked={metodo === 'RETIRO'} className={`opcion${metodo === 'RETIRO' ? ' opcion--activa' : ''}`} onClick={() => setMetodo('RETIRO')}>
                    <b>Retiro en tienda</b>
                    <span>Gratis · te avisamos cuando esté listo</span>
                  </button>
                </div>
              </div>

              <div className="panel">
                <h2>{metodo === 'ENVIO' ? '2 · Datos de despacho' : '2 · Quién retira'}</h2>
                <div className="campos">
                  <Campo id="nombre" etiqueta="Nombre completo" valor={datos.nombre} error={errores.nombre} onChange={(v) => fijar('nombre', v)} autoComplete="name" />
                  <Campo id="telefono" etiqueta="Teléfono" tipo="tel" valor={datos.telefono} error={errores.telefono} onChange={(v) => fijar('telefono', v)} placeholder="+56 9 1234 5678" autoComplete="tel" />
                  {metodo === 'ENVIO' && (
                    <>
                      <Campo id="direccion" etiqueta="Dirección" valor={datos.direccion} error={errores.direccion} onChange={(v) => fijar('direccion', v)} placeholder="Calle y número" autoComplete="street-address" />
                      <Campo id="comuna" etiqueta="Comuna" valor={datos.comuna} error={errores.comuna} onChange={(v) => fijar('comuna', v)} autoComplete="address-level2" />
                      <Campo id="indicaciones" etiqueta="Indicaciones (opcional)" valor={datos.indicaciones} onChange={(v) => fijar('indicaciones', v)} placeholder="Depto, conserjería…" />
                    </>
                  )}
                </div>
                {metodo === 'RETIRO' && (
                  <div style={{ marginTop: 16 }}>
                    <span className="etiqueta">Sucursal</span>
                    <div className="opciones" role="radiogroup" aria-label="Sucursal">
                      {sucursales.map((s) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={datos.sucursal === s.nombre}
                          key={s.nombre}
                          className={`opcion opcion--fila${datos.sucursal === s.nombre ? ' opcion--activa' : ''}`}
                          onClick={() => fijar('sucursal', s.nombre)}
                        >
                          <b>{s.nombre}</b>
                          <span>{s.direccion}</span>
                        </button>
                      ))}
                    </div>
                    {errores.sucursal && <div className="error-campo">{errores.sucursal}</div>}
                  </div>
                )}
                <p className="ayuda" style={{ marginTop: 14 }}>
                  {metodo === 'ENVIO'
                    ? 'El nombre, el teléfono y las indicaciones viajan junto a la dirección para el repartidor.'
                    : 'Presenta el número de pedido al retirar.'}
                </p>
              </div>
            </>
          )}

          {paso === 'pago' && (
            <>
              {!pedido && carrito?.envioDefinido && (
                <div className="panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <span className="etiqueta">{carrito.metodoEnvio === 'RETIRO' ? 'Retiro en' : 'Despacho a'}</span>
                      <span>{carrito.metodoEnvio === 'RETIRO' ? carrito.sucursal : `${carrito.direccion}, ${carrito.comuna}`}</span>
                    </div>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPaso('entrega')} disabled={pagando}>
                      Cambiar
                    </button>
                  </div>
                </div>
              )}
              {pedido && (
                <div className="panel">
                  <span className="etiqueta">Pedido {pedido.id}</span>
                  <span>{pedido.metodoEnvio === 'RETIRO' ? `Retiro en ${pedido.destino}` : `Despacho a ${pedido.destino}`}</span>
                  <p className="ayuda">El stock de este pedido está reservado mientras completas el pago.</p>
                </div>
              )}

              <div className="panel">
                <h2>3 · Pago</h2>
                <div className="opciones" role="radiogroup" aria-label="Medio de pago">
                  <button type="button" role="radio" aria-checked={pasarela === 'WEBPAY'} className={`opcion${pasarela === 'WEBPAY' ? ' opcion--activa' : ''}`} onClick={() => setPasarela('WEBPAY')}>
                    <b>Webpay Plus</b>
                    <span>Crédito o débito en la página segura de Transbank</span>
                  </button>
                  <button type="button" role="radio" aria-checked={pasarela === 'SIMULADA'} className={`opcion${pasarela === 'SIMULADA' ? ' opcion--activa' : ''}`} onClick={() => setPasarela('SIMULADA')}>
                    <b>Tarjeta (pasarela de prueba)</b>
                    <span>Pago inmediato, sin salir de la tienda</span>
                  </button>
                </div>
                {pasarela === 'WEBPAY' ? (
                  <p className="ayuda" style={{ marginTop: 14 }}>
                    Te llevaremos a Webpay en esta misma pestaña y volverás aquí con el resultado.
                  </p>
                ) : (
                  <div style={{ marginTop: 16 }}>
                    <label htmlFor="tarjeta" className="etiqueta">
                      Número de tarjeta
                    </label>
                    <input
                      id="tarjeta"
                      className={`input input--grande mono${tarjetaError ? ' input--error' : ''}`}
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="0000 0000 0000 0000"
                      value={tarjeta}
                      onChange={(e) => {
                        setTarjeta(formatearTarjeta(e.target.value))
                        setTarjetaError(null)
                      }}
                    />
                    {tarjetaError && <div className="error-campo">{tarjetaError}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                      <span className="tenue" style={{ fontSize: 12 }}>
                        Tarjetas de prueba:
                      </span>
                      {TARJETAS_PRUEBA.map((t) => (
                        <button type="button" key={t.numero} className="btn btn--ghost btn--sm mono" onClick={() => setTarjeta(t.numero)}>
                          {t.etiqueta} · {t.numero.slice(-4)}
                        </button>
                      ))}
                    </div>
                    <p className="ayuda">
                      El número viaja sólo a ms-pago para calcular la huella antifraude; la tienda no lo guarda. Más de 3 intentos con la misma tarjeta en 10 s
                      bloquean la tarjeta temporalmente.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="resumen panel">
          <h2 style={{ margin: 0 }}>Resumen</h2>
          <Lineas items={items} catalogoCat={nombreCat} />
          {!pedido && faltantes && faltantes.length > 0 && (
            <Aviso tono="bad" titulo="Sin stock suficiente">
              {faltantes.map((f) => {
                const n = items.find((i) => i.productoId === f.productoId)?.nombre ?? f.productoId
                return (
                  <div key={f.productoId}>
                    {n}: quedan {f.disponible}
                  </div>
                )
              })}
            </Aviso>
          )}

          {!pedido && carrito && (
            <div>
              {carrito.cupon ? (
                <div className="cupon-activo">
                  <span>
                    Cupón <b>{carrito.cupon}</b>
                    {carrito.cuponAplicado ? '' : ' (sin efecto)'}
                  </span>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void quitarCupon()} disabled={cuponOcupado || pagando}>
                    Quitar
                  </button>
                </div>
              ) : (
                <form
                  className="cupon"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void aplicarCupon()
                  }}
                >
                  <label htmlFor="cupon" className="sr-only">
                    Código de cupón
                  </label>
                  <input id="cupon" className="input" placeholder="Cupón de descuento" value={cupon} onChange={(e) => setCupon(e.target.value)} maxLength={40} />
                  <button type="submit" className="btn btn--ghost" disabled={cuponOcupado || !cupon.trim()}>
                    Aplicar
                  </button>
                </form>
              )}
              {carrito.avisoCupon && <div className="ayuda" style={{ color: 'var(--warn)' }}>{carrito.avisoCupon}</div>}
              {cuponError && <div className="error-campo">{cuponError}</div>}
            </div>
          )}

          <div className="filas-monto">
            <div>
              <span>Subtotal</span>
              <span>{clp(m?.subtotal)}</span>
            </div>
            {(m?.descuento ?? 0) > 0 && (
              <div className="descuento">
                <span>Descuento{m?.cupon ? ` · ${m.cupon}` : ''}</span>
                <span>−{clp(m?.descuento)}</span>
              </div>
            )}
            <div>
              <span>Envío</span>
              <span>{envioTexto}</span>
            </div>
            {!pedido && carrito && metodo === 'ENVIO' && carrito.faltaParaEnvioGratis > 0 && (
              <div className="tenue" style={{ fontSize: 12 }}>
                <span>Te faltan {clp(carrito.faltaParaEnvioGratis)} para envío gratis</span>
                <span />
              </div>
            )}
          </div>
          <div className="total">
            <span className="muted">Total</span>
            <b>{clp(total)}</b>
          </div>

          {fallo && (
            <Aviso tono={fallo.tono} titulo={fallo.titulo}>
              {fallo.texto}
            </Aviso>
          )}

          {paso === 'entrega' ? (
            <button type="button" className="btn btn--primario btn--grande btn--ancho" onClick={() => void continuarAPago()} disabled={guardando || items.length === 0}>
              {guardando ? 'Guardando…' : 'Continuar al pago'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primario btn--grande btn--ancho"
              onClick={() => void pagar()}
              disabled={pagando || pedidoNoPagable || items.length === 0 || (pasarela === 'SIMULADA' && !tarjeta)}
            >
              {pagando ? (pasarela === 'WEBPAY' ? 'Conectando con Webpay…' : 'Procesando pago…') : `Pagar ${clp(total)}`}
            </button>
          )}
          <div className="tenue" style={{ fontSize: 12, textAlign: 'center' }}>
            {paso === 'pago' && !pedido ? 'Al pagar reservamos el stock y creamos tu pedido.' : 'Pago seguro · Webpay Plus'}
          </div>
          {items.some((i) => (stockDe.get(i.productoId) ?? Infinity) < i.cantidad) && !pedido && (
            <Aviso tono="warn">Algún producto tiene menos stock que lo que llevas; ajusta el carrito antes de pagar.</Aviso>
          )}
        </aside>
      </div>
    </section>
  )
}
