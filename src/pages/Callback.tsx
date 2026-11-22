import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Aviso, Insignia } from '../components/ui'
import { pedidos as apiPedidos } from '../lib/api'
import { TITULO, bajada, estadoVisual, glifo, leerCallback } from '../lib/callback'
import { clp, fechaHora } from '../lib/format'
import { ETIQUETA_ESTADO, tonoEstado } from '../lib/pedidos'
import type { Pedido } from '../lib/types'
import { useTienda } from '../state/contexto'

/* ---------------------------------------------------------------------------
   /callback — resultado del pago.

   Llega por redirect de ms-pago tras el commit de Webpay (origen TIENDA →
   FRONT_URL_TIENDA/callback) o desde el checkout con la pasarela simulada.

   Lo que dice la URL es lo que informó la PASARELA. El estado del pedido lo
   decide ms-carrito cuando consume `pagos-resultado` (asíncrono, por Kafka),
   así que se consulta GET /api/pedidos/{orden} unas veces hasta que deje de
   estar PENDIENTE_PAGO, y se muestra aparte, con su propia etiqueta.
   ------------------------------------------------------------------------- */

const SONDEOS = 8
const CADA_MS = 1500

export function Callback() {
  const [params] = useSearchParams()
  const d = leerCallback(params)
  const { usuarioId, sesion, refrescarCarrito, refrescarRecomendaciones, agregar, registrar } = useTienda()
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [sondeoAgotado, setSondeoAgotado] = useState(false)
  const [rearmando, setRearmando] = useState(false)
  const [rearmado, setRearmado] = useState(false)
  const avisado = useRef(false)
  const compraRegistrada = useRef<string | null>(null)

  /* Un pago resuelto cambia el carrito (se vació al crear el pedido) y las
     recomendaciones (COMPRA pesa 5): se refrescan una vez al llegar. */
  useEffect(() => {
    if (avisado.current) return
    avisado.current = true
    void refrescarCarrito()
    refrescarRecomendaciones()
  }, [refrescarCarrito, refrescarRecomendaciones])

  useEffect(() => {
    if (!d.orden || !sesion) return
    let vivo = true
    let n = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const leer = async () => {
      n += 1
      try {
        const p = await apiPedidos.obtener(usuarioId, d.orden!)
        if (!vivo) return
        setPedido(p)
        if (p.estado !== 'PENDIENTE_PAGO') return
      } catch {
        /* sin ms-carrito igual se muestra el resultado de la pasarela */
      }
      if (!vivo) return
      if (n >= SONDEOS) setSondeoAgotado(true)
      else timer = setTimeout(() => void leer(), CADA_MS)
    }
    void leer()
    return () => {
      vivo = false
      clearTimeout(timer)
    }
  }, [d.orden, usuarioId, sesion])

  /* La compra cuenta en «Tu perfil» sólo cuando ms-carrito confirma el pago
     (sirve igual para Webpay y para la pasarela simulada), una vez por pedido. */
  useEffect(() => {
    if (!pedido || compraRegistrada.current === pedido.id) return
    if (pedido.estado === 'PENDIENTE_PAGO' || pedido.estado === 'PAGO_RECHAZADO') return
    compraRegistrada.current = pedido.id
    for (const i of pedido.items) registrar({ tipo: 'compra', productoId: i.productoId, nombre: i.nombre, categoria: i.categoria })
  }, [pedido, registrar])

  const rearmar = async () => {
    if (!pedido) return
    setRearmando(true)
    for (const i of pedido.items) await agregar({ id: i.productoId, nombre: i.nombre, categoria: i.categoria }, i.cantidad)
    setRearmando(false)
    setRearmado(true)
  }

  const visual = estadoVisual(d.resultado)
  return (
    <section className="resultado">
      <div className={`resultado__icono resultado__icono--${visual}`} aria-hidden="true">
        {glifo(d.resultado)}
      </div>
      <div className="eyebrow">// resultado del pago · {d.pasarela === 'WEBPAY' ? 'webpay plus' : 'pasarela de prueba'}</div>
      <h1 className="h1">{TITULO[d.resultado]}</h1>
      <p className="muted" style={{ fontSize: 15, margin: '10px 0 22px' }}>
        {bajada(d.resultado, d.pasarela)}
      </p>

      {(d.orden || d.monto != null) && (
        <dl className="ficha">
          {d.orden && (
            <>
              <dt>Pedido</dt>
              <dd className="mono">{d.orden}</dd>
            </>
          )}
          {d.monto != null && (
            <>
              <dt>Monto</dt>
              <dd className="mono">{clp(d.monto)}</dd>
            </>
          )}
          {d.tarjeta && (
            <>
              <dt>Tarjeta</dt>
              <dd className="mono">•••• {d.tarjeta}</dd>
            </>
          )}
          {d.autorizacion && (
            <>
              <dt>Autorización</dt>
              <dd className="mono">{d.autorizacion}</dd>
            </>
          )}
          {d.fecha && (
            <>
              <dt>Fecha</dt>
              <dd className="mono">{d.fecha}</dd>
            </>
          )}
          {d.estadoCrudo && (
            <>
              <dt>Respuesta</dt>
              <dd className="mono">{d.estadoCrudo}</dd>
            </>
          )}
          {pedido && (
            <>
              <dt>Estado del pedido</dt>
              <dd>
                <Insignia tono={tonoEstado(pedido.estado)}>{ETIQUETA_ESTADO[pedido.estado]}</Insignia>
                <span className="tenue" style={{ fontSize: 12, marginLeft: 8 }}>
                  ms-carrito · {fechaHora(pedido.actualizadoEn)}
                </span>
              </dd>
            </>
          )}
        </dl>
      )}

      {d.detalle && (
        <div style={{ marginBottom: 18 }}>
          <Aviso tono="bad" titulo="Detalle técnico">
            {d.detalle}
          </Aviso>
        </div>
      )}
      {pedido?.estado === 'PENDIENTE_PAGO' && sondeoAgotado && d.resultado === 'aprobado' && (
        <div style={{ marginBottom: 18 }}>
          <Aviso tono="info">El pago se aprobó y el pedido se confirmará en unos segundos. Lo verás actualizado en «Mis pedidos».</Aviso>
        </div>
      )}
      {!sesion && d.orden && (
        <div style={{ marginBottom: 18 }}>
          <Aviso tono="info">Ingresa con tu cuenta para ver el estado del pedido.</Aviso>
        </div>
      )}
      {rearmado && (
        <div style={{ marginBottom: 18 }}>
          <Aviso tono="ok">Volvimos a poner los productos en tu carrito.</Aviso>
        </div>
      )}

      <div className="acciones">
        {d.resultado === 'aprobado' && sesion && (
          <Link to="/pedidos" className="btn btn--primario">
            Ver mis pedidos
          </Link>
        )}
        {(d.resultado === 'rechazado' || d.resultado === 'anulado' || d.resultado === 'error') && pedido && !rearmado && (
          <button type="button" className="btn btn--primario" disabled={rearmando} onClick={() => void rearmar()}>
            {rearmando ? 'Armando…' : 'Volver a armar el carrito'}
          </button>
        )}
        {pedido?.estado === 'PENDIENTE_PAGO' && d.resultado !== 'aprobado' && (
          <Link to={`/checkout?pedido=${encodeURIComponent(pedido.id)}`} className="btn btn--contorno">
            Reintentar el pago
          </Link>
        )}
        <Link to="/" className="btn btn--ghost">
          Seguir comprando
        </Link>
      </div>
    </section>
  )
}
