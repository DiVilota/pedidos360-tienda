import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { etiquetaCategoria } from '../lib/catalogo'
import { clp } from '../lib/format'
import { useTienda } from '../state/contexto'
import { ImagenProducto } from './ImagenProducto'

/* Paneles laterales (carrito y deseos) y el aviso flotante. Escape cierra lo
   que esté abierto, igual que en el prototipo. */

function useEscape(activo: boolean, cerrar: () => void) {
  useEffect(() => {
    if (!activo) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [activo, cerrar])
}

export function CarritoDrawer() {
  const { carritoAbierto, cerrarPaneles, carrito, carritoError, cambiarCantidad, catalogo, categorias, sesion, ocupado } = useTienda()
  const navegar = useNavigate()
  useEscape(carritoAbierto, cerrarPaneles)
  if (!carritoAbierto) return null

  const items = carrito?.items ?? []
  const vacio = items.length === 0
  const stockDe = (id: string) => catalogo.find((p) => p.id === id)?.stock

  const continuar = () => {
    cerrarPaneles()
    if (!sesion) navegar('/ingresar?volver=/checkout&motivo=compra')
    else navegar('/checkout')
  }

  return (
    <>
      <div className="velo" onClick={cerrarPaneles} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Tu carrito">
        <div className="drawer__cab">
          <b>Tu carrito</b>
          <button type="button" className="btn btn--ghost btn--sm" onClick={cerrarPaneles}>
            Cerrar
          </button>
        </div>
        <div className="drawer__cuerpo">
          {carritoError && (
            <div className="aviso aviso--bad" style={{ marginTop: 16 }}>
              {carritoError}
            </div>
          )}
          {vacio && !carritoError && (
            <div className="vacio" style={{ marginTop: 24, padding: '34px 14px' }}>
              Tu carrito está vacío.
              <Link to="/#productos" className="btn btn--ghost" onClick={cerrarPaneles}>
                Ver productos
              </Link>
            </div>
          )}
          {items.map((i) => {
            const prod = catalogo.find((p) => p.id === i.productoId)
            const stock = stockDe(i.productoId)
            return (
              <div className="linea" key={i.productoId}>
                <ImagenProducto
                  nombre={i.nombre}
                  categoria={prod?.categoria ?? ''}
                  etiquetaCategoria={prod ? etiquetaCategoria(prod.categoria, categorias) : undefined}
                  imagenUrl={prod?.imagenUrl}
                  tam="mini"
                />
                <div className="linea__info">
                  <Link to={`/producto/${encodeURIComponent(i.productoId)}`} onClick={cerrarPaneles}>
                    {i.nombre}
                  </Link>
                  <span>{clp(i.precioUnitario * i.cantidad)}</span>
                </div>
                <div className="cantidad">
                  <button
                    type="button"
                    className="btn btn--icono"
                    aria-label={i.cantidad === 1 ? `Quitar ${i.nombre}` : `Quitar uno de ${i.nombre}`}
                    disabled={ocupado}
                    onClick={() => void cambiarCantidad(i.productoId, i.cantidad - 1)}
                  >
                    −
                  </button>
                  <span aria-label="cantidad">{i.cantidad}</span>
                  <button
                    type="button"
                    className="btn btn--icono"
                    aria-label={`Agregar uno de ${i.nombre}`}
                    disabled={ocupado || (stock != null && i.cantidad >= stock)}
                    title={stock != null && i.cantidad >= stock ? 'No hay más stock disponible' : undefined}
                    onClick={() => void cambiarCantidad(i.productoId, i.cantidad + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="drawer__pie">
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>El envío o retiro y los cupones se eligen al pagar.</div>
          <div className="total">
            <span className="muted">Subtotal</span>
            <b>{clp(carrito?.subtotal ?? 0)}</b>
          </div>
          <button type="button" className="btn btn--primario btn--grande btn--ancho" disabled={vacio} onClick={continuar}>
            {sesion ? 'Continuar al pago' : 'Ingresar para continuar'}
          </button>
        </div>
      </aside>
    </>
  )
}

export function DeseosDrawer() {
  const { deseosAbierto, cerrarPaneles, deseos, alternarDeseo, catalogo, categorias, agregar, carrito } = useTienda()
  useEscape(deseosAbierto, cerrarPaneles)
  if (!deseosAbierto) return null

  /* Se cruzan los IDs guardados con el catálogo vigente de ms-productos: un
     producto que ya no existe simplemente no aparece (y no rompe la lista). */
  const items = catalogo.filter((p) => deseos.includes(p.id))

  return (
    <>
      <div className="velo" onClick={cerrarPaneles} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Lista de deseos">
        <div className="drawer__cab">
          <b>Lista de deseos</b>
          <button type="button" className="btn btn--ghost btn--sm" onClick={cerrarPaneles}>
            Cerrar
          </button>
        </div>
        <div className="drawer__cuerpo">
          {items.length === 0 && (
            <div className="vacio" style={{ marginTop: 24, padding: '34px 14px' }}>
              Aún no guardas productos. Toca ♡ en cualquier producto para guardarlo aquí.
              <Link to="/#productos" className="btn btn--ghost" onClick={cerrarPaneles}>
                Ver productos
              </Link>
            </div>
          )}
          {items.map((p) => {
            const enCarrito = carrito?.items.find((i) => i.productoId === p.id)?.cantidad ?? 0
            const sinStock = p.stock - enCarrito <= 0
            return (
              <div className="linea" key={p.id}>
                <ImagenProducto nombre={p.nombre} categoria={p.categoria} etiquetaCategoria={etiquetaCategoria(p.categoria, categorias)} imagenUrl={p.imagenUrl} tam="mini" />
                <div className="linea__info">
                  <Link to={`/producto/${encodeURIComponent(p.id)}`} onClick={cerrarPaneles}>
                    {p.nombre}
                  </Link>
                  <span>{clp(p.precio)}</span>
                </div>
                <div className="cantidad">
                  <button
                    type="button"
                    className="btn btn--primario btn--sm"
                    disabled={sinStock}
                    onClick={async () => {
                      if (await agregar(p)) alternarDeseo(p.id)
                    }}
                  >
                    {p.stock <= 0 ? 'Agotado' : sinStock ? 'Sin stock' : 'Al carrito'}
                  </button>
                  <button type="button" className="btn btn--icono btn--peligro" aria-label={`Quitar ${p.nombre} de la lista`} onClick={() => alternarDeseo(p.id)}>
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="drawer__pie" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          Tu lista se guarda en este navegador.
        </div>
      </aside>
    </>
  )
}

export function Toast() {
  const { toast, cerrarToast, abrirCarrito } = useTienda()
  if (!toast) return null
  return (
    <div className={`toast${toast.tono === 'bad' ? ' toast--bad' : ''}`} role="status" key={toast.id}>
      <span className={`punto punto--${toast.tono === 'bad' ? 'bad' : 'ok'}`} />
      <span>{toast.texto}</span>
      {toast.verCarrito && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            cerrarToast()
            abrirCarrito()
          }}
        >
          Ver carrito
        </button>
      )}
      <button type="button" className="toast__x" aria-label="Cerrar aviso" onClick={cerrarToast}>
        ×
      </button>
    </div>
  )
}
