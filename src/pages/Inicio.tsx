import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImagenProducto } from '../components/ImagenProducto'
import { ParaTi } from '../components/ParaTi'
import { TarjetaProducto } from '../components/TarjetaProducto'
import { Aviso, SkelTarjeta, Vacio } from '../components/ui'
import { ApiError, productos as apiProductos, recomendaciones as apiRecs } from '../lib/api'
import { etiquetaCategoria, totalCatalogo } from '../lib/catalogo'
import { clp, num } from '../lib/format'
import type { Metricas, OrdenCatalogo, Producto } from '../lib/types'
import { useTienda } from '../state/contexto'

/* ---------------------------------------------------------------------------
   Portada: hero, catálogo, «Para ti», populares y servicios (mismo orden y
   textos que el prototipo). Lo que cambió es de dónde sale cada dato:
   - catálogo y categorías → ms-productos (antes: 20 productos escritos en el
     HTML y categorías inventadas que no existían en el backend);
   - populares → GET /api/metricas de ms-recomendaciones (antes: un ranking
     calculado con pesos locales sobre clics de esta pestaña).
   ------------------------------------------------------------------------- */

const ORDENES: { valor: OrdenCatalogo; etiqueta: string }[] = [
  { valor: 'relevancia', etiqueta: 'Relevancia' },
  { valor: 'precio_asc', etiqueta: 'Precio: menor a mayor' },
  { valor: 'precio_desc', etiqueta: 'Precio: mayor a menor' },
]

const esOrden = (v: string | null): v is OrdenCatalogo => ORDENES.some((o) => o.valor === v)

function Hero() {
  const { catalogo, categorias } = useTienda()
  /* Destacado = el mejor calificado con stock, según ms-productos (no uno
     elegido a mano en el código). */
  const destacado = useMemo(
    () => [...catalogo].filter((p) => p.stock > 0).sort((a, b) => b.calificacion - a.calificacion || b.precio - a.precio)[0],
    [catalogo],
  )
  return (
    <section className="hero">
      <div>
        <div className="eyebrow">// envío a domicilio · retiro en tienda</div>
        <h1>Tecnología que llega a tu puerta.</h1>
        <p>Celulares, laptops, audio y gaming. Paga con Webpay y recibe en casa o retira en tienda.</p>
        <nav aria-label="Secciones de la tienda" className="hero__nav">
          <a href="#productos" className="hero__link hero__link--primario">
            <b>Productos</b>
            <span>Catálogo completo</span>
          </a>
          <a href="#para-ti" className="hero__link">
            <b>Para ti</b>
            <span>Según tus gustos</span>
          </a>
          <a href="#populares" className="hero__link">
            <b>Populares</b>
            <span>Lo más visto</span>
          </a>
          <a href="#servicios" className="hero__link">
            <b>Servicios</b>
            <span>Envío y retiro</span>
          </a>
        </nav>
      </div>
      {destacado ? (
        <Link to={`/producto/${encodeURIComponent(destacado.id)}`} className="destacado" aria-label={`Producto destacado: ${destacado.nombre}`}>
          <ImagenProducto
            nombre={destacado.nombre}
            categoria={destacado.categoria}
            etiquetaCategoria={destacado.categoriaEtiqueta ?? etiquetaCategoria(destacado.categoria, categorias)}
            imagenUrl={destacado.imagenUrl}
            insignia="Destacado"
          />
          <div className="destacado__pie">
            <span>
              <span className="tarjeta__meta" style={{ display: 'block' }}>
                {destacado.marca} · ★ {destacado.calificacion.toFixed(1)}
              </span>
              <b style={{ fontSize: 17 }}>{destacado.nombre}</b>
            </span>
            <span className="precio">{clp(destacado.precio)}</span>
          </div>
        </Link>
      ) : (
        <div className="destacado" aria-hidden="true">
          <div className="skel" style={{ aspectRatio: '4/3', borderRadius: 0 }} />
          <div className="destacado__pie">
            <div className="skel" style={{ height: 18, width: '50%' }} />
            <div className="skel" style={{ height: 18, width: '25%' }} />
          </div>
        </div>
      )}
    </section>
  )
}

function Catalogo() {
  const { categorias, catalogoError, recargarCatalogo } = useTienda()
  const [params, setParams] = useSearchParams()
  const categoria = params.get('categoria') ?? ''
  const orden: OrdenCatalogo = esOrden(params.get('orden')) ? (params.get('orden') as OrdenCatalogo) : 'relevancia'
  const qUrl = params.get('q') ?? ''
  const [q, setQ] = useState(qUrl)
  const [lista, setLista] = useState<Producto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  /* Los filtros viven en la URL: un enlace a "/?categoria=audio" se puede
     compartir y el botón Atrás deshace un filtro. */
  const fijar = useCallback(
    (cambios: Record<string, string>) =>
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(cambios)) {
            if (v) n.set(k, v)
            else n.delete(k)
          }
          return n
        },
        { replace: true, preventScrollReset: true },
      ),
    [setParams],
  )

  /* La búsqueda espera 300 ms sin teclear: si no, cada letra es un GET. */
  useEffect(() => {
    if (q.trim() === qUrl) return
    const t = setTimeout(() => fijar({ q: q.trim() }), 300)
    return () => clearTimeout(t)
  }, [q, qUrl, fijar])

  /* El filtrado y el orden los hace ms-productos (§7.2); la tienda no
     reordena por su cuenta para no contradecir al servicio. */
  useEffect(() => {
    /* AbortController propio: al cambiar de filtro se cancela la petición
       anterior, para que una respuesta lenta no pise a la más reciente. */
    const ctrl = new AbortController()
    let vencido = false
    const timer = setTimeout(() => {
      vencido = true
      ctrl.abort()
    }, 8000)
    setError(null)
    apiProductos
      .listar({ categoria, q: qUrl, orden }, ctrl.signal)
      .then((l) => setLista(l))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError' && !vencido) return
        setError(e instanceof ApiError && !e.esDeRed ? e.message : 'El catálogo (ms-productos) no responde.')
        setLista([])
      })
      .finally(() => clearTimeout(timer))
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [categoria, qUrl, orden, intento])

  const total = totalCatalogo(categorias)
  const conFiltros = Boolean(categoria || qUrl)
  const resumen =
    lista === null
      ? 'Cargando catálogo…'
      : conFiltros
        ? `${num(lista.length)} de ${num(total)} productos`
        : `${num(lista.length)} productos`

  return (
    <section id="productos" className="contenedor" style={{ paddingTop: 24, paddingBottom: 56 }}>
      <div className="seccion__cab">
        <div>
          <h2>Productos</h2>
          <p aria-live="polite">{resumen}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className="sr-only" htmlFor="buscar">
            Buscar productos
          </label>
          <input
            id="buscar"
            className="input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, marca…"
            maxLength={100}
            style={{ width: 240 }}
          />
          <label className="sr-only" htmlFor="orden">
            Ordenar
          </label>
          <select id="orden" className="select" value={orden} onChange={(e) => fijar({ orden: e.target.value === 'relevancia' ? '' : e.target.value })}>
            {ORDENES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }} role="group" aria-label="Categorías">
        <button type="button" className={`chip${!categoria ? ' chip--activo' : ''}`} aria-pressed={!categoria} onClick={() => fijar({ categoria: '' })}>
          Todo <small>{total || ''}</small>
        </button>
        {categorias.map((c) => (
          <button
            type="button"
            key={c.slug}
            className={`chip${categoria === c.slug ? ' chip--activo' : ''}`}
            aria-pressed={categoria === c.slug}
            onClick={() => fijar({ categoria: categoria === c.slug ? '' : c.slug })}
          >
            {c.etiqueta} <small>{c.cantidad}</small>
          </button>
        ))}
      </div>

      {catalogoError && categorias.length === 0 && (
        <div style={{ marginBottom: 16 }}>
          <Aviso tono="warn" titulo="No pudimos cargar las categorías">
            ms-productos: {catalogoError}.{' '}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void recargarCatalogo()}>
              Reintentar
            </button>
          </Aviso>
        </div>
      )}

      {error ? (
        <Vacio>
          {error}
          <button type="button" className="btn btn--ghost" onClick={() => setIntento((i) => i + 1)}>
            Reintentar
          </button>
        </Vacio>
      ) : (
        <div className="grilla">
          {lista === null && Array.from({ length: 8 }, (_, k) => <SkelTarjeta key={k} />)}
          {lista?.map((p) => <TarjetaProducto key={p.id} producto={p} />)}
        </div>
      )}

      {!error && lista !== null && lista.length === 0 && (
        <Vacio>
          Sin resultados para esos filtros.
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setQ('')
              fijar({ categoria: '', q: '', orden: '' })
            }}
          >
            Limpiar filtros
          </button>
        </Vacio>
      )}
    </section>
  )
}

function Populares() {
  const { catalogo, agregar, ocupado, recTick } = useTienda()
  const [m, setM] = useState<Metricas | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    apiRecs
      .metricas()
      .then((r) => {
        if (!vivo) return
        setM(r)
        setError(false)
      })
      .catch(() => vivo && setError(true))
    return () => {
      vivo = false
    }
  }, [recTick])

  const top = (m?.topProductos ?? []).slice(0, 5)
  return (
    <section id="populares" className="banda">
      <div className="contenedor" style={{ padding: 0 }}>
        <div className="seccion__cab" style={{ borderBottom: 0, marginBottom: 6 }}>
          <div>
            <h2>Los más populares</h2>
            <p>Top 5 por vistas de los últimos 15 minutos, medido por ms-recomendaciones con los eventos de toda la tienda.</p>
          </div>
        </div>
        {error && <Vacio>No pudimos obtener las métricas (ms-recomendaciones no responde).</Vacio>}
        {!error && m && top.length === 0 && <Vacio>Todavía no hay actividad reciente. Abre algunos productos y vuelve a mirar.</Vacio>}
        {!error && !m && <div className="skel" style={{ height: 120 }} />}
        {top.length > 0 && (
          <div className="top">
            {top.map((t, i) => {
              const p = catalogo.find((x) => x.id === t.productoId)
              return (
                <div className="top__item" key={t.productoId}>
                  <span className="top__rank">{String(i + 1).padStart(2, '0')}</span>
                  <Link to={`/producto/${encodeURIComponent(t.productoId)}`}>{t.nombre}</Link>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {p ? clp(p.precio) : '—'} · {num(t.vistas)} {t.vistas === 1 ? 'vista' : 'vistas'}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    style={{ alignSelf: 'flex-start' }}
                    disabled={!p || p.stock <= 0 || ocupado}
                    onClick={() => p && void agregar(p)}
                  >
                    {p && p.stock <= 0 ? 'Agotado' : 'Agregar'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function Servicios() {
  return (
    <section id="servicios" className="contenedor" style={{ paddingTop: 48, paddingBottom: 56 }}>
      <h2 className="h2" style={{ marginBottom: 18 }}>
        Cómo recibes tu compra
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
        <div className="servicio">
          <b>Envío a domicilio</b>
          <p>Despacho a todo el país, directo a tu dirección. $3.990, gratis sobre $100.000.</p>
        </div>
        <div className="servicio">
          <b>Retiro en tienda</b>
          <p>Compra online y retira gratis en Santiago Centro, Providencia o Maipú cuando tu pedido esté listo.</p>
        </div>
      </div>
    </section>
  )
}

export function Inicio() {
  return (
    <>
      <Hero />
      <Catalogo />
      <ParaTi />
      <Populares />
      <Servicios />
      <footer className="pie">
        <span>Pedidos360 · pagos con Webpay Plus</span>
        <span>DSY1107 · imágenes ilustrativas</span>
      </footer>
    </>
  )
}
