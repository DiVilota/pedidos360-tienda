import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { recomendaciones as api } from '../lib/api'
import { afinidades, etiquetaCategoria } from '../lib/catalogo'
import { calcularPerfil } from '../lib/senales'
import type { ProductoEnriquecido } from '../lib/types'
import { useTienda } from '../state/contexto'
import { TarjetaRecomendacion } from './TarjetaProducto'
import { SkelTarjeta } from './ui'

/* ---------------------------------------------------------------------------
   «Para ti»: GET /api/recomendaciones?userId=<id estable>, con el `motivo`
   que redacta ms-recomendaciones.

   El prototipo la pedía UNA vez al montar y con un id recién inventado, así
   que siempre volvía vacía y el ranking real nunca se mostraba. Ahora se
   vuelve a pedir cada vez que sube recTick, que la tienda incrementa tras ver
   un detalle, agregar al carrito, aplicar un cupón o volver de un pago.
   ------------------------------------------------------------------------- */

export function ParaTi({ excluir, titulo = 'Recomendado para ti', compacto = false }: { excluir?: string; titulo?: string; compacto?: boolean }) {
  const { usuarioId, recTick, senales, reiniciarPerfil, categorias, sesion } = useTienda()
  const [recs, setRecs] = useState<ProductoEnriquecido[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api
      .para(usuarioId)
      .then((l) => {
        if (!vivo) return
        setRecs(Array.isArray(l) ? l : [])
        setError(null)
      })
      .catch((e: Error) => {
        if (!vivo) return
        setError(e.message)
        setRecs((prev) => prev ?? [])
      })
    return () => {
      vivo = false
    }
  }, [usuarioId, recTick])

  const lista = (recs ?? []).filter((r) => r.itemId !== excluir).slice(0, 4)
  const afin = afinidades(lista)
  const perfil = calcularPerfil(senales)
  const conSenales = senales.length > 0

  const grilla = (
    <div className={compacto ? 'grilla' : 'grilla grilla--recs'} style={{ flex: '3 1 480px', minWidth: 0 }}>
      {recs === null && [0, 1, 2, 3].map((k) => <SkelTarjeta key={k} />)}
      {recs !== null && lista.length === 0 && (
        <div className="vacio" style={{ gridColumn: '1/-1' }}>
          {error
            ? `No pudimos obtener recomendaciones (ms-recomendaciones: ${error}).`
            : 'Todavía no hay recomendaciones. Abre algunos productos y vuelve a mirar acá.'}
        </div>
      )}
      {lista.map((r, i) => (
        <TarjetaRecomendacion key={r.itemId} rec={r} afinidad={afin[i]} />
      ))}
    </div>
  )

  if (compacto) {
    return (
      <section style={{ marginTop: 48 }}>
        <div className="seccion__cab">
          <div>
            <div className="eyebrow">// parecidos a lo que miras · ms-recomendaciones</div>
            <h2>{titulo}</h2>
          </div>
        </div>
        {grilla}
      </section>
    )
  }

  return (
    <section id="para-ti" className="contenedor" style={{ paddingTop: 16, paddingBottom: 56 }}>
      <div className="seccion__cab" style={{ marginBottom: 22 }}>
        <div>
          <div className="eyebrow">// personalizado · {sesion ? sesion.nombre.toLowerCase() : 'visitante'}</div>
          <h2>{titulo}</h2>
          <p>Se ajusta a lo que haces en la tienda: los productos que abres, lo que agregas al carrito y lo que compras.</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <aside className="perfil">
          <div>
            <b style={{ fontSize: 15 }}>Tu perfil</b>
            <p style={{ margin: '2px 0 0', color: 'var(--ink-3)', fontSize: 12.5 }}>Señales que esta sesión envió a la tienda</p>
          </div>
          {conSenales ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="etiqueta" style={{ marginBottom: 0 }}>
                  Interés por categoría
                </div>
                {perfil.afinidad.slice(0, 4).map((a) => (
                  <div key={a.categoria}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                      <span>{etiquetaCategoria(a.categoria, categorias)}</span>
                      <span className="mono muted">{a.pct}%</span>
                    </div>
                    <div className="barra">
                      <span style={{ width: `${a.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mini-kpis">
                <div>
                  <b>{perfil.vistos}</b>
                  <span>Vistos</span>
                </div>
                <div>
                  <b>{perfil.alCarrito}</b>
                  <span>Al carrito</span>
                </div>
                <div>
                  <b>{perfil.compras}</b>
                  <span>Compras</span>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                Lo que más revisas: <b style={{ color: 'var(--ink)' }}>{perfil.masRevisado ?? '—'}</b>
              </div>
            </>
          ) : (
            <div className="vacio" style={{ padding: '28px 12px', fontSize: 13 }}>
              Aún te estamos conociendo. Abre un producto o agrega alguno al carrito.
              <Link to="/#productos" className="btn btn--ghost">
                Explorar productos
              </Link>
            </div>
          )}
          <button type="button" className="btn btn--ghost" onClick={reiniciarPerfil} title="Borra el resumen local; el historial del servidor no se toca">
            Reiniciar mi resumen
          </button>
        </aside>
        {grilla}
      </div>
    </section>
  )
}
