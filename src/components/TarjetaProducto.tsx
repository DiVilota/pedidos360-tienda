import { Link } from 'react-router-dom'
import { estadoStock, etiquetaCategoria } from '../lib/catalogo'
import { clp } from '../lib/format'
import type { Producto, ProductoEnriquecido } from '../lib/types'
import { useTienda } from '../state/contexto'
import { ImagenProducto } from './ImagenProducto'

/* Tarjetas del catálogo y de «Para ti». La imagen y el nombre son enlaces al
   detalle (/producto/:id): abrir el detalle es lo que dispara VER_PRODUCTO en
   ms-productos, así que es la interacción que alimenta las recomendaciones. */

function BotonDeseo({ id, nombre }: { id: string; nombre: string }) {
  const { deseos, alternarDeseo } = useTienda()
  const activo = deseos.includes(id)
  const texto = activo ? `Quitar ${nombre} de la lista de deseos` : `Guardar ${nombre} en la lista de deseos`
  return (
    <button
      type="button"
      className={`corazon${activo ? ' corazon--activo' : ''}`}
      onClick={() => alternarDeseo(id)}
      aria-label={texto}
      aria-pressed={activo}
      title={activo ? 'Quitar de la lista de deseos' : 'Guardar en lista de deseos'}
    >
      {activo ? '♥' : '♡'}
    </button>
  )
}

/** Cuántas unidades más se pueden agregar sin pasar el stock informado. */
function useDisponible(id: string, stock: number | undefined) {
  const { carrito } = useTienda()
  const enCarrito = carrito?.items.find((i) => i.productoId === id)?.cantidad ?? 0
  return stock == null ? Infinity : stock - enCarrito
}

export function TarjetaProducto({ producto: p }: { producto: Producto }) {
  const { categorias, agregar, justoAgregado, ocupado } = useTienda()
  const st = estadoStock(p.stock)
  const disponible = useDisponible(p.id, p.stock)
  const agotado = p.stock <= 0
  const etiqueta = etiquetaCategoria(p.categoria, categorias)

  return (
    <article className="tarjeta">
      <Link to={`/producto/${encodeURIComponent(p.id)}`} className="tarjeta__img" tabIndex={-1} aria-hidden="true">
        <ImagenProducto nombre={p.nombre} categoria={p.categoria} etiquetaCategoria={etiqueta} imagenUrl={p.imagenUrl} />
      </Link>
      <div className="tarjeta__cuerpo">
        <span className="tarjeta__meta">
          {etiqueta} · {p.marca}
        </span>
        <Link to={`/producto/${encodeURIComponent(p.id)}`} className="tarjeta__nombre">
          {p.nombre}
        </Link>
        <span className="tarjeta__desc">{p.descripcion}</span>
        <span className={`stock stock--${st.tono}`}>{st.etiqueta}</span>
        <div className="tarjeta__pie">
          <span className="precio">{clp(p.precio)}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <BotonDeseo id={p.id} nombre={p.nombre} />
            <button
              type="button"
              className="btn btn--primario"
              disabled={agotado || disponible <= 0 || ocupado}
              onClick={() => void agregar(p)}
              title={!agotado && disponible <= 0 ? 'Ya tienes todo el stock disponible en el carrito' : undefined}
            >
              {agotado ? 'Agotado' : justoAgregado === p.id ? 'Agregado' : disponible <= 0 ? 'Sin más stock' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export function TarjetaRecomendacion({ rec, afinidad }: { rec: ProductoEnriquecido; afinidad?: number }) {
  const { categorias, agregar, justoAgregado, ocupado, catalogo } = useTienda()
  /* El stock de la recomendación puede venir en el DTO (§5 lo agrega) o no:
     si falta, se toma del catálogo de ms-productos ya cargado. */
  const stock = rec.stock ?? catalogo.find((p) => p.id === rec.itemId)?.stock
  const disponible = useDisponible(rec.itemId, stock)
  const etiqueta = etiquetaCategoria(rec.categoria, categorias)
  const min = { id: rec.itemId, nombre: rec.nombre, categoria: rec.categoria }

  return (
    <article className="tarjeta">
      <Link to={`/producto/${encodeURIComponent(rec.itemId)}`} className="tarjeta__img" tabIndex={-1} aria-hidden="true">
        <ImagenProducto
          nombre={rec.nombre}
          categoria={rec.categoria}
          etiquetaCategoria={etiqueta}
          imagenUrl={rec.imagenUrl}
          insignia={afinidad != null ? `${afinidad}% afín` : undefined}
        />
      </Link>
      <div className="tarjeta__cuerpo">
        <span className="tarjeta__meta">
          {etiqueta} · {rec.marca}
        </span>
        <Link to={`/producto/${encodeURIComponent(rec.itemId)}`} className="tarjeta__nombre">
          {rec.nombre}
        </Link>
        <span className="tarjeta__motivo">{rec.motivo || 'Popular entre otros clientes'}</span>
        <div className="tarjeta__pie">
          <span className="precio" style={{ fontSize: 16 }}>
            {clp(rec.precio)}
          </span>
          <button type="button" className="btn btn--primario" disabled={disponible <= 0 || ocupado} onClick={() => void agregar(min)}>
            {disponible <= 0 ? 'Agotado' : justoAgregado === rec.itemId ? 'Agregado' : 'Agregar'}
          </button>
        </div>
      </div>
    </article>
  )
}
