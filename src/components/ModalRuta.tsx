import { useEffect } from 'react'
import { urlRuta } from '../lib/pedidos'
import type { Pedido } from '../lib/types'

/* ---------------------------------------------------------------------------
   Modal con el mapa de la ruta (public/ruta-paquete.html, Leaflet + OSRM).
   Se carga en un iframe para que Leaflet y sus estilos no se mezclen con los
   de la tienda. El mapa avisa por postMessage cuando el usuario presiona
   Escape DENTRO del iframe (el foco está allá y la tienda no lo vería).
   ------------------------------------------------------------------------- */

export function ModalRuta({ pedido, onCerrar }: { pedido: Pedido; onCerrar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    const mensaje = (e: MessageEvent) => {
      /* Sólo se acepta el aviso del propio origen: el iframe es nuestro. */
      if (e.origin === window.location.origin && e.data?.type === 'p360-route-close') onCerrar()
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener('message', mensaje)
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('message', mensaje)
    }
  }, [onCerrar])

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Ruta del paquete" onClick={(e) => e.stopPropagation()}>
        <div className="modal__cab">
          <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            Seguimiento en vivo · {pedido.id}
          </span>
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        <iframe src={urlRuta(pedido)} title="Mapa con la ruta del paquete" />
      </div>
    </div>
  )
}
