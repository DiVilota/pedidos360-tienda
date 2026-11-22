import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImagenProducto } from '../components/ImagenProducto'
import { ModalRuta } from '../components/ModalRuta'
import { Aviso, Insignia, SkelPedido, Vacio } from '../components/ui'
import { ApiError, pedidos as apiPedidos } from '../lib/api'
import { conJitter, debeRendirse, describirEspera, siguienteEspera } from '../lib/backoff'
import { etiquetaCategoria } from '../lib/catalogo'
import { clp, fechaHora } from '../lib/format'
import { ETAPAS, ETIQUETA_ESTADO, agrupar, esFinal, indiceEtapa, instanteEstado, tieneRuta, tonoEstado, totalComprado } from '../lib/pedidos'
import type { Pedido } from '../lib/types'
import { useTienda } from '../state/contexto'

/* ---------------------------------------------------------------------------
   «Mis pedidos». Las etapas son las que reporta ms-carrito (su @Scheduled
   avanza la logística simulada) y ya no un reloj local del navegador.

   Se actualiza de dos formas: al llegar una notificación por SSE (eventoTick)
   y con una relectura periódica de respaldo, con backoff si el servicio cae
   (sin eso, cada pestaña abierta golpearía a ms-carrito cada 10 s para
   siempre justo cuando está caído).
   ------------------------------------------------------------------------- */

const REFRESCO_MS = 10000

function TarjetaPedido({ p, onRuta }: { p: Pedido; onRuta: (p: Pedido) => void }) {
  const { categorias } = useTienda()
  const etapas = ETAPAS[p.metodoEnvio]
  const actual = indiceEtapa(p)
  const fin = esFinal(p.estado) && p.estado !== 'PAGO_RECHAZADO'

  return (
    <article className="pedido">
      <div className="pedido__cab">
        <div>
          <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
            {p.id}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {fechaHora(p.creadoEn)} · {p.metodoEnvio === 'RETIRO' ? `Retiro en ${p.destino}` : `Envío a ${p.destino}`}
          </div>
        </div>
        <Insignia tono={tonoEstado(p.estado)}>
          {ETIQUETA_ESTADO[p.estado]} · {fechaHora(instanteEstado(p))}
        </Insignia>
      </div>

      {p.estado === 'PENDIENTE_PAGO' && (
        <Aviso tono="warn" titulo="Esperando el pago">
          El stock está reservado. Si cerraste la ventana de pago, puedes completarlo ahora.{' '}
          <Link to={`/checkout?pedido=${encodeURIComponent(p.id)}`} className="btn btn--primario btn--sm" style={{ marginTop: 8 }}>
            Pagar ahora
          </Link>
        </Aviso>
      )}
      {p.estado === 'PAGO_RECHAZADO' && <Aviso tono="bad">El pago no se aprobó y el stock reservado se liberó. No se realizó ningún cobro.</Aviso>}

      {actual >= 0 && (
        <div className={`etapas${fin ? ' etapas--fin' : ''}`} aria-label={`Etapa ${actual + 1} de ${etapas.length}`}>
          {etapas.map((e, i) => (
            <div key={e.estado} className={`etapa${i <= actual ? ' etapa--hecha' : ''}${i === actual ? ' etapa--actual' : ''}`}>
              <i />
              <span>{e.nombre}</span>
            </div>
          ))}
        </div>
      )}

      {tieneRuta(p) && (
        <button type="button" className="btn-ruta" onClick={() => onRuta(p)}>
          <i />
          {p.estado === 'ENTREGADO' ? 'Ver el recorrido' : 'Ver la ruta del paquete'}
        </button>
      )}

      <div>
        {p.items.map((it) => (
          <div className="item-resumen" key={it.productoId}>
            <ImagenProducto nombre={it.nombre} categoria={it.categoria} etiquetaCategoria={etiquetaCategoria(it.categoria, categorias)} tam="xs" />
            <span>
              <Link to={`/producto/${encodeURIComponent(it.productoId)}`} style={{ color: 'var(--ink)', textDecoration: 'none' }}>
                {it.nombre}
              </Link>{' '}
              <span className="tenue">× {it.cantidad}</span>
            </span>
            <span>{clp(it.subtotal ?? it.precioUnitario * it.cantidad)}</span>
          </div>
        ))}
      </div>
      <div className="filas-monto">
        {p.descuento > 0 && (
          <div className="descuento">
            <span>Descuento{p.cupon ? ` · ${p.cupon}` : ''}</span>
            <span>−{clp(p.descuento)}</span>
          </div>
        )}
        <div>
          <span>Envío</span>
          <span>{p.costoEnvio === 0 ? 'Gratis' : clp(p.costoEnvio)}</span>
        </div>
        <div>
          <span>Total{p.codigoAutorizacion ? ` · autorización ${p.codigoAutorizacion}` : ''}</span>
          <span style={{ fontWeight: 650, color: 'var(--ink)' }}>{clp(p.total)}</span>
        </div>
      </div>
    </article>
  )
}

export function MisPedidos() {
  const { usuarioId, sesion, eventoTick } = useTienda()
  const [params, setParams] = useSearchParams()
  const [lista, setLista] = useState<Pedido[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendido, setRendido] = useState(false)
  const [esperaMs, setEsperaMs] = useState<number | null>(null)
  const [intento, setIntento] = useState(0)
  const fallos = useRef(0)

  const cargar = useCallback(async () => {
    try {
      const l = await apiPedidos.listar(usuarioId)
      setLista(l)
      setError(null)
      fallos.current = 0
      return true
    } catch (e) {
      fallos.current += 1
      setError(e instanceof ApiError && e.esDeRed ? 'ms-carrito no responde.' : (e as Error).message)
      setLista((prev) => prev ?? [])
      return false
    }
  }, [usuarioId])

  useEffect(() => {
    let vivo = true
    let timer: ReturnType<typeof setTimeout> | undefined
    fallos.current = 0
    setRendido(false)
    const ciclo = async () => {
      await cargar()
      if (!vivo) return
      if (debeRendirse(fallos.current)) {
        setRendido(true)
        setEsperaMs(null)
        return
      }
      const espera = fallos.current === 0 ? REFRESCO_MS : siguienteEspera(fallos.current)
      setEsperaMs(fallos.current === 0 ? null : espera)
      timer = setTimeout(() => void ciclo(), conJitter(espera))
    }
    void ciclo()
    return () => {
      vivo = false
      clearTimeout(timer)
    }
  }, [cargar, intento])

  /* Una notificación (pedido pagado, envío actualizado) adelanta la relectura. */
  useEffect(() => {
    if (eventoTick > 0) void cargar()
  }, [eventoTick, cargar])

  const idRuta = params.get('ruta')
  const pedidoRuta = idRuta ? lista?.find((p) => p.id === idRuta) : undefined
  const abrirRuta = (p: Pedido) => setParams({ ruta: p.id }, { replace: false })
  const cerrarRuta = useCallback(() => setParams({}, { replace: true }), [setParams])

  const { enCurso, historial } = agrupar(lista ?? [])
  const grupos = [
    { titulo: 'En curso', pedidos: enCurso, vacio: 'No tienes pedidos en curso.' },
    { titulo: 'Historial', pedidos: historial, vacio: 'Aquí verás tus pedidos entregados, retirados o rechazados.' },
  ]

  return (
    <section className="pagina pagina--angosta">
      <div className="eyebrow">// mis pedidos</div>
      <h1 className="h1">Hola, {sesion?.nombre.split(' ')[0]}</h1>
      <p className="muted" style={{ margin: '6px 0 22px' }}>
        Sigue el estado de tus pedidos en todo momento.
      </p>

      {error && (
        <div style={{ marginBottom: 18 }}>
          <Aviso tono="warn" titulo="No pudimos actualizar tus pedidos">
            {error}{' '}
            {rendido ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIntento((i) => i + 1)}>
                Reintentar
              </button>
            ) : (
              esperaMs != null && <>Reintentamos en {describirEspera(esperaMs)}.</>
            )}
          </Aviso>
        </div>
      )}

      <dl className="kpis">
        <div>
          <dt>En curso</dt>
          <dd>{lista ? enCurso.length : '—'}</dd>
        </div>
        <div>
          <dt>Pedidos totales</dt>
          <dd>{lista ? lista.length : '—'}</dd>
        </div>
        <div>
          <dt>Total comprado</dt>
          <dd>{lista ? clp(totalComprado(lista)) : '—'}</dd>
        </div>
      </dl>

      {lista === null && [0, 1].map((k) => <SkelPedido key={k} />)}
      {lista !== null &&
        grupos.map((g) => (
          <div key={g.titulo} style={{ marginBottom: 28 }}>
            <h2 className="grupo-titulo">{g.titulo}</h2>
            {g.pedidos.length === 0 ? (
              <Vacio>
                {g.vacio}
                {g.titulo === 'En curso' && (
                  <Link to="/#productos" className="btn btn--ghost">
                    Ver productos
                  </Link>
                )}
              </Vacio>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {g.pedidos.map((p) => (
                  <TarjetaPedido key={p.id} p={p} onRuta={abrirRuta} />
                ))}
              </div>
            )}
          </div>
        ))}

      {pedidoRuta && tieneRuta(pedidoRuta) && <ModalRuta pedido={pedidoRuta} onCerrar={cerrarRuta} />}
    </section>
  )
}
