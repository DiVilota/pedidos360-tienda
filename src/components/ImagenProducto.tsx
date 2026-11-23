import { useState } from 'react'
import { IconoCategoria } from './iconos'

/* ---------------------------------------------------------------------------
   Imagen de producto. Hoy imagenUrl llega en null (§7.1) y se dibuja un
   placeholder DELIBERADO —patrón de la marca, ícono de la categoría, etiqueta
   y la inicial del producto— en lugar del "[ nombre ]" gris del prototipo,
   que se leía como imagen rota. Si algún día llega una URL y falla, se vuelve
   al mismo placeholder en vez de mostrar el ícono roto del navegador.
   ------------------------------------------------------------------------- */

type Props = {
  nombre: string
  categoria: string
  etiquetaCategoria?: string
  imagenUrl?: string | null
  tam?: 'normal' | 'mini' | 'xs' | 'xxs'
  insignia?: string
}

export function ImagenProducto({ nombre, categoria, etiquetaCategoria, imagenUrl, tam = 'normal', insignia }: Props) {
  const [fallo, setFallo] = useState(false)
  const clase = tam === 'normal' ? 'ph' : `ph ph--mini${tam === 'xs' ? ' ph--xs' : tam === 'xxs' ? ' ph--xxs' : ''}`
  const usarFoto = imagenUrl && !fallo

  return (
    <div className={clase} role="img" aria-label={usarFoto ? undefined : `${nombre} (imagen ilustrativa)`}>
      {usarFoto ? (
        <img src={imagenUrl} alt={nombre} loading="lazy" onError={() => setFallo(true)} />
      ) : (
        <>
          <IconoCategoria slug={categoria} />
          {tam === 'normal' && (
            <>
              <span className="ph__texto">{etiquetaCategoria ?? categoria}</span>
              <span className="ph__inicial" aria-hidden="true">
                {nombre.trim().charAt(0).toUpperCase()}
              </span>
            </>
          )}
        </>
      )}
      {insignia && <span className="ph__insignia">{insignia}</span>}
    </div>
  )
}
