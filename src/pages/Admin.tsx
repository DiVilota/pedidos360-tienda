import { useCallback, useEffect, useState } from 'react'
import { Aviso, Insignia, Vacio } from '../components/ui'
import { ApiError, adminCarrito, productos as apiProductos } from '../lib/api'
import { COLOR_NIVEL, DIAS_VENTANA, ETIQUETA_NIVEL, alturasBarras, anchoStock, rotacion, segmentosCategoria } from '../lib/admin'
import { etiquetaCategoria } from '../lib/catalogo'
import { clp, decimal, diaMes, fechaHora, num } from '../lib/format'
import { ETIQUETA_ESTADO, tonoEstado } from '../lib/pedidos'
import type { Pedido, ResumenAdmin, StockAdmin } from '../lib/types'
import { useTienda } from '../state/contexto'

/* ---------------------------------------------------------------------------
   Panel admin con datos REALES:
   - GET /api/admin/resumen        (ms-carrito)   ventas, más vendidos, categorías
   - GET /api/admin/pedidos        (ms-carrito)   últimos pedidos
   - GET /api/productos/admin/stock (ms-productos) inventario y nivel
   - PUT /api/productos/{id}/stock  (ms-productos) reponer
   El prototipo dibujaba todo esto con constantes SEED/DAILY y una "venta
   aleatoria" por día. Cada panel maneja su propio error: si ms-productos cae,
   las ventas de ms-carrito se siguen viendo, y al revés.
   ------------------------------------------------------------------------- */

const REPOSICION = 10
const REFRESCO_MS = 30000

type Carga<T> = { datos: T | null; error: string | null }
const vacio = <T,>(): Carga<T> => ({ datos: null, error: null })
const textoError = (e: unknown, servicio: string) =>
  e instanceof ApiError && e.esDeRed ? `${servicio} no responde.` : e instanceof Error ? e.message : 'error desconocido'

function Panel({ titulo, sub, error, children, completo }: { titulo: string; sub?: string; error?: string | null; children: React.ReactNode; completo?: boolean }) {
  return (
    <div className={`panel${completo ? ' completo' : ''}`}>
      <h3>{titulo}</h3>
      {sub && <p className="panel__sub">{sub}</p>}
      {error ? <Aviso tono="bad">{error}</Aviso> : children}
    </div>
  )
}

export function Admin() {
  const { categorias, avisar, recargarCatalogo, usuarioId } = useTienda()
  const [resumen, setResumen] = useState<Carga<ResumenAdmin>>(vacio)
  const [stock, setStock] = useState<Carga<StockAdmin[]>>(vacio)
  const [pedidos, setPedidos] = useState<Carga<Pedido[]>>(vacio)
  const [reponiendo, setReponiendo] = useState<string | null>(null)
  const [actualizado, setActualizado] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    const [r, s, p] = await Promise.allSettled([
      adminCarrito.resumen(usuarioId),
      apiProductos.stockAdmin(usuarioId),
      adminCarrito.pedidos(usuarioId),
    ])
    setResumen(r.status === 'fulfilled' ? { datos: r.value, error: null } : (prev) => ({ datos: prev.datos, error: textoError(r.reason, 'ms-carrito') }))
    setStock(s.status === 'fulfilled' ? { datos: s.value, error: null } : (prev) => ({ datos: prev.datos, error: textoError(s.reason, 'ms-productos') }))
    setPedidos(p.status === 'fulfilled' ? { datos: p.value, error: null } : (prev) => ({ datos: prev.datos, error: textoError(p.reason, 'ms-carrito') }))
    setActualizado(Date.now())
  }, [usuarioId])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  const reponer = async (s: StockAdmin) => {
    setReponiendo(s.id)
    try {
      await apiProductos.reponer(s.id, REPOSICION, usuarioId)
      avisar(`${s.nombre}: +${REPOSICION} unidades`)
      const nuevo = await apiProductos.stockAdmin(usuarioId)
      setStock({ datos: nuevo, error: null })
      /* El catálogo de la tienda también muestra stock: se relee. */
      void recargarCatalogo()
    } catch (e) {
      avisar(`No se pudo reponer: ${textoError(e, 'ms-productos')}`, 'bad')
    } finally {
      setReponiendo(null)
    }
  }

  const R = resumen.datos
  const S = stock.datos
  const bajos = S?.filter((x) => x.nivel !== 'NORMAL').length
  const dias = R?.ventasPorDia ?? []
  const alturas = alturasBarras(dias.map((d) => d.total))
  const maxVendidas = Math.max(1, ...(R?.masVendidos ?? []).map((m) => m.unidades))
  const segs = R ? segmentosCategoria(R) : []
  const rot = R && S ? rotacion(S, R).slice(0, 8) : []
  const recientes = [...(pedidos.datos ?? [])].sort((a, b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? '')).slice(0, 8)

  return (
    <section className="pagina pagina--ancha">
      <div className="seccion__cab" style={{ borderBottom: 0 }}>
        <div>
          <div className="eyebrow">// administración</div>
          <h1 className="h1">Dashboard de productos</h1>
          <p>Ventas de los últimos {DIAS_VENTANA} días (pedidos pagados), stock y rotación.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="tenue mono" style={{ fontSize: 11.5 }}>
            {actualizado ? `actualizado ${new Date(actualizado).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}` : 'cargando…'}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void cargar()}>
            Actualizar
          </button>
        </div>
      </div>

      <dl className="kpis">
        <div>
          <dt>Ingresos {DIAS_VENTANA} días</dt>
          <dd>{R ? clp(R.ingresosTotales) : '—'}</dd>
        </div>
        <div>
          <dt>Unidades vendidas</dt>
          <dd>{R ? num(R.unidadesVendidas) : '—'}</dd>
        </div>
        <div>
          <dt>Pedidos en curso</dt>
          <dd>{R ? num(R.pedidosActivos) : '—'}</dd>
        </div>
        <div>
          <dt>Stock bajo o agotado</dt>
          <dd>
            {bajos ?? '—'} <small>productos</small>
          </dd>
        </div>
      </dl>

      <div className="admin-grid">
        <Panel titulo={`Ventas por día · últimos ${DIAS_VENTANA} días`} sub="Millones de CLP · ms-carrito" error={!R ? resumen.error : null}>
          {!R ? (
            <div className="skel" style={{ height: 190 }} />
          ) : dias.every((d) => d.total === 0) ? (
            <Vacio>Aún no hay ventas pagadas en la ventana.</Vacio>
          ) : (
            <div className="grafico" role="img" aria-label="Gráfico de ventas por día">
              {dias.map((d, i) => (
                <div key={d.fecha} title={`${d.fecha}: ${clp(d.total)}`}>
                  <span>{d.total > 0 ? decimal(d.total / 1e6) : ''}</span>
                  <i style={{ height: alturas[i] }} />
                  <span>{diaMes(d.fecha)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel titulo="Más vendidos" sub={`Unidades en ${DIAS_VENTANA} días`} error={!R ? resumen.error : null}>
          {!R ? (
            <div className="skel" style={{ height: 190 }} />
          ) : R.masVendidos.length === 0 ? (
            <Vacio>Sin ventas todavía.</Vacio>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {R.masVendidos.slice(0, 6).map((m) => (
                <div key={m.productoId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                    <span>{m.nombre}</span>
                    <span className="mono muted">{num(m.unidades)}</span>
                  </div>
                  <div className="barra">
                    <span style={{ width: `${Math.round((m.unidades / maxVendidas) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel titulo="Ventas por categoría" sub="Participación en ingresos" error={!R ? resumen.error : null}>
          {!R ? (
            <div className="skel" style={{ height: 120 }} />
          ) : segs.length === 0 ? (
            <Vacio>Sin ventas todavía.</Vacio>
          ) : (
            <>
              <div className="segmentos" style={{ marginBottom: 16 }} role="img" aria-label="Participación por categoría">
                {segs.map((c) => (
                  <span key={c.categoria} style={{ width: `${c.pct}%`, background: c.color }} title={`${c.categoria} ${c.pct}%`} />
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {segs.map((c) => (
                  <div className="leyenda" key={c.categoria}>
                    <i style={{ background: c.color }} />
                    <span>{etiquetaCategoria(c.categoria, categorias)}</span>
                    <span className="mono muted">{clp(c.total)}</span>
                    <span className="mono" style={{ textAlign: 'right' }}>
                      {c.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel titulo="Rotación de inventario" sub="Cobertura = días de stock al ritmo de venta de la ventana" error={!R ? resumen.error : !S ? stock.error : null}>
          {!R || !S ? (
            <div className="skel" style={{ height: 190 }} />
          ) : (
            <div className="desborde">
              <div className="tabla tabla--rotacion">
                <div className="tabla__fila tabla__cab">
                  <span>Producto</span>
                  <span className="num">Vend.</span>
                  <span className="num">Stock</span>
                  <span className="num">Cobertura</span>
                  <span>Rotación</span>
                </div>
                {rot.map((r) => (
                  <div className="tabla__fila" key={r.id}>
                    <span>{r.nombre}</span>
                    <span className="num">{num(r.vendidas)}</span>
                    <span className="num">{num(r.stock)}</span>
                    <span className="num">{r.coberturaDias == null ? 'sin ventas' : `${Math.round(r.coberturaDias)} d`}</span>
                    <span>
                      <Insignia tono={r.rotacion === 'Alta' ? 'ok' : r.rotacion === 'Media' ? 'info' : 'neutral'}>{r.rotacion}</Insignia>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel titulo="Gestión de stock" sub={`Reponer suma ${REPOSICION} unidades en ms-productos · bajo = 10 o menos`} error={!S ? stock.error : null} completo>
          {!S ? (
            <div className="skel" style={{ height: 220 }} />
          ) : (
            <div className="desborde">
              <div className="tabla tabla--stock">
                <div className="tabla__fila tabla__cab">
                  <span>Producto</span>
                  <span>Nivel</span>
                  <span className="num">Stock</span>
                  <span>Estado</span>
                  <span />
                </div>
                {[...S]
                  .sort((a, b) => a.stock - b.stock)
                  .map((s) => (
                    <div className="tabla__fila" key={s.id}>
                      <span>
                        {s.nombre} <span className="tenue mono" style={{ fontSize: 11 }}>{s.id}</span>
                      </span>
                      <div className="barra">
                        <span style={{ width: `${anchoStock(s.stock)}%`, background: COLOR_NIVEL[s.nivel], boxShadow: 'none' }} />
                      </div>
                      <span className="num">{s.stock}</span>
                      <span style={{ color: COLOR_NIVEL[s.nivel], fontSize: 12 }}>{ETIQUETA_NIVEL[s.nivel]}</span>
                      <button type="button" className="btn btn--ghost btn--sm" disabled={reponiendo === s.id} onClick={() => void reponer(s)} aria-label={`Reponer ${REPOSICION} unidades de ${s.nombre}`}>
                        {reponiendo === s.id ? '…' : `+ ${REPOSICION}`}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {S && stock.error && <Aviso tono="warn">{stock.error}</Aviso>}
        </Panel>

        <Panel titulo="Pedidos recientes" sub="Todos los clientes · ms-carrito" error={!pedidos.datos ? pedidos.error : null} completo>
          {!pedidos.datos ? (
            <div className="skel" style={{ height: 160 }} />
          ) : recientes.length === 0 ? (
            <Vacio>Todavía no hay pedidos.</Vacio>
          ) : (
            <div className="desborde">
              <div className="tabla tabla--pedidos">
                <div className="tabla__fila tabla__cab">
                  <span>Pedido</span>
                  <span>Cliente</span>
                  <span>Entrega</span>
                  <span>Estado</span>
                  <span className="num">Total</span>
                </div>
                {recientes.map((p) => (
                  <div className="tabla__fila" key={p.id}>
                    <span className="mono">{p.id}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.usuarioId}>
                      {p.usuarioId}
                    </span>
                    <span className="muted">{p.metodoEnvio === 'RETIRO' ? 'Retiro' : 'Envío'}</span>
                    <span>
                      <Insignia tono={tonoEstado(p.estado)}>{ETIQUETA_ESTADO[p.estado]}</Insignia>
                      <span className="tenue" style={{ fontSize: 11, marginLeft: 6 }}>
                        {fechaHora(p.creadoEn)}
                      </span>
                    </span>
                    <span className="num">{clp(p.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </section>
  )
}
