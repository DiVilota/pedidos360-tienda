/* ---------------------------------------------------------------------------
   Ruta base donde vive la tienda.

   La MISMA imagen se sirve en dos lugares:
     - en la raíz del nginx:            http://IP:8091/
     - bajo la etapa del API Gateway:   https://<api>.execute-api.<region>.amazonaws.com/desarrollo/
   En el segundo caso todo lo que la tienda pide "desde la raíz" (/assets,
   /img, /config.js, /ruta-paquete.html, las rutas de React Router) tiene que
   llevar delante /desarrollo, o cae en una ruta que el gateway no publica y
   responde 403 "Missing Authentication Token".

   La base la calcula un script en línea de index.html ANTES de cargar nada
   (ahí mismo escribe el <base href>, que resuelve los assets y config.js).
   Acá sólo se lee, para lo que <base> no cubre: el basename del router y las
   rutas absolutas que arma el código.
   ------------------------------------------------------------------------- */

declare global {
  interface Window {
    PEDIDOS360_BASE?: string
  }
}

/** Siempre termina en "/": "/" en nginx, "/desarrollo/" detrás del gateway. */
export const BASE: string = (typeof window !== 'undefined' && window.PEDIDOS360_BASE) || '/'

/** basename de React Router: sin barra final, y undefined en la raíz. */
export const BASENAME: string | undefined = BASE === '/' ? undefined : BASE.replace(/\/$/, '')

/** Antepone la base a una ruta absoluta del mismo origen ("/img/x.svg").
    Las URL completas (http://…) y las relativas se devuelven tal cual. */
export function conBase(ruta: string): string {
  if (!ruta.startsWith('/') || ruta.startsWith('//')) return ruta
  return BASE + ruta.slice(1)
}
