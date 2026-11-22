import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ImagenProducto } from '../components/ImagenProducto'
import { ParaTi } from '../components/ParaTi'
import { Aviso, Estrellas, Vacio } from '../components/ui'
import { ApiError, productos as apiProductos } from '../lib/api'
import { estadoStock, etiquetaCategoria } from '../lib/catalogo'
import { clp } from '../lib/format'
import type { Producto as TProducto } from '../lib/types'
import { useTienda } from '../state/contexto'

/* ---------------------------------------------------------------------------
   Detalle de producto. Abrir esta página ES la interacción VER_PRODUCTO:
   GET /api/productos/{id} con X-Usuario-Id hace que ms-productos publique el
   evento en `interacciones-user`, y ms-recomendaciones lo consume. Por eso el
   detalle se pide siempre al servicio (no se reutiliza el del catálogo en
   memoria) y después se refrescan las recomendaciones.
   ------------------------------------------------------------------------- */

export function Producto() {
  const { id = '' } = useParams()
  const { usuarioId, categorias, agregar, ocupado, carrito, deseos, alternarDeseo, registrar } = useTienda()
  const [p, setP] = useState<TProducto | null>(null)
  const [error, setError] = useState<{ status: number; texto: string } | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [intento, setIntento] = useState(0)
  /* StrictMode monta dos veces en desarrollo: sin esta marca se publicarían
     dos VER_PRODUCTO por cada visita y el perfil contaría doble. */
  const yaVisto = useRef<string | null>(null)

  useEffect(() => {
    let vivo = true
    setP(null)
    setError(null)
    setCantidad(1)
    apiProductos
      .detalle(id, usuarioId)
      .then((prod) => {
        if (!vivo) return
        setP(prod)
        const clave = `${usuarioId}|${prod.id}|${intento}`
        if (yaVisto.current !== clave) {
          yaVisto.current = clave
          registrar({ tipo: 'ver', productoId: prod.id, nombre: prod.nombre, categoria: prod.categoria })
        }
      })
      .catch((e: unknown) => {
        if (!vivo) return
        if (e instanceof ApiError) setError({ status: e.status, texto: e.esDeRed ? 'ms-productos no responde.' : e.message })
        else setError({ status: 0, texto: 'Error inesperado.' })
      })
    return () => {
      vivo = false
    }
  }, [id, usuarioId, intento, registrar])

  if (error) {
    return (
      <div className="pagina">
        <nav className="migas" aria-label="Ruta">
          <Link to="/">Tienda</Link>
          <span>/</span>
          <span>Producto</span>
        </nav>
        <Vacio>
          {error.status === 404 ? 'Este producto no existe o ya no está en el catálogo.' : `No pudimos cargar el producto: ${error.texto}`}
          <span style={{ display: 'flex', gap: 8 }}>
            {error.status !== 404 && (
              <button type="button" className="btn btn--ghost" onClick={() => setIntento((i) => i + 1)}>
                Reintentar
              </button>
            )}
            <Link to="/#productos" className="btn btn--ghost">
              Ver productos
            </Link>
          </span>
        </Vacio>
      </div>
    )
  }

  if (!p) {
    return (
      <div className="pagina pagina--ancha" aria-busy="true">
        <div className="skel" style={{ height: 12, width: 180, marginBottom: 18 }} />
        <div className="detalle">
          <div className="skel" style={{ aspectRatio: '4/3' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="skel" style={{ height: 12, width: '30%' }} />
            <div className="skel" style={{ height: 36, width: '70%' }} />
            <div className="skel" style={{ height: 14, width: '90%' }} />
            <div className="skel" style={{ height: 28, width: '35%' }} />
          </div>
        </div>
      </div>
    )
  }

  const etiqueta = p.categoriaEtiqueta ?? etiquetaCategoria(p.categoria, categorias)
  const enCarrito = carrito?.items.find((i) => i.productoId === p.id)?.cantidad ?? 0
  const disponible = Math.max(0, p.stock - enCarrito)
  const st = estadoStock(p.stock)
  const enDeseos = deseos.includes(p.id)

  return (
    <div className="pagina pagina--ancha">
      <nav className="migas" aria-label="Ruta">
        <Link to="/">Tienda</Link>
        <span>/</span>
        <Link to={`/?categoria=${encodeURIComponent(p.categoria)}#productos`}>{etiqueta}</Link>
        <span>/</span>
        <span>{p.nombre}</span>
      </nav>
      <div className="detalle">
        <ImagenProducto nombre={p.nombre} categoria={p.categoria} etiquetaCategoria={etiqueta} imagenUrl={p.imagenUrl} />
        <div>
          <span className="tarjeta__meta">
            {etiqueta} · {p.marca}
          </span>
          <h1>{p.nombre}</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <Estrellas valor={p.calificacion} />
            <span className="muted mono">{p.calificacion.toFixed(1)}</span>
          </div>
          <p className="muted" style={{ fontSize: 15, margin: '14px 0' }}>
            {p.descripcion}
          </p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
            <span className="precio" style={{ fontSize: 30 }}>
              {clp(p.precio)}
            </span>
            {st.etiqueta && <span className={`stock stock--${st.tono}`}>{st.etiqueta}</span>}
          </div>

          <dl className="ficha">
            <dt>Marca</dt>
            <dd>{p.marca}</dd>
            <dt>Categoría</dt>
            <dd>{etiqueta}</dd>
            <dt>Línea</dt>
            <dd>{p.subcategoria.replace(/-/g, ' ')}</dd>
            <dt>Código</dt>
            <dd className="mono">{p.id}</dd>
            <dt>Disponibles</dt>
            <dd className="mono">{p.stock}</dd>
          </dl>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="cantidad" aria-label="Cantidad">
              <button type="button" className="btn btn--icono" aria-label="Uno menos" disabled={cantidad <= 1} onClick={() => setCantidad((c) => c - 1)}>
                −
              </button>
              <span aria-live="polite">{cantidad}</span>
              <button
                type="button"
                className="btn btn--icono"
                aria-label="Uno más"
                disabled={cantidad >= disponible}
                onClick={() => setCantidad((c) => c + 1)}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="btn btn--primario btn--grande"
              style={{ minWidth: 200 }}
              disabled={disponible <= 0 || ocupado}
              onClick={async () => {
                if (await agregar(p, cantidad)) setCantidad(1)
              }}
            >
              {p.stock <= 0 ? 'Agotado' : disponible <= 0 ? 'Ya tienes todo el stock' : 'Agregar al carrito'}
            </button>
            <button
              type="button"
              className={`btn btn--contorno btn--grande`}
              aria-pressed={enDeseos}
              onClick={() => alternarDeseo(p.id)}
            >
              {enDeseos ? '♥ En tu lista' : '♡ Guardar'}
            </button>
          </div>
          {enCarrito > 0 && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono="info">Tienes {enCarrito} en el carrito.</Aviso>
            </div>
          )}
        </div>
      </div>
      <ParaTi excluir={p.id} titulo="También te puede interesar" compacto />
    </div>
  )
}
