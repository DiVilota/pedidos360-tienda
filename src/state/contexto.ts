import { createContext, useContext } from 'react'
import type { Sesion } from '../lib/auth'
import type { Servicio } from '../config'
import type { Carrito, Categoria, Notificacion, Producto } from '../lib/types'
import type { Senal } from '../lib/senales'

/* ---------------------------------------------------------------------------
   Estado compartido de la tienda. El contexto y el hook viven separados del
   Provider para que el archivo del componente exporte sólo componentes (lo
   exige el refresco en caliente de Vite y la regla de oxlint).
   ------------------------------------------------------------------------- */

/** Lo mínimo para agregar al carrito: sirve tanto un Producto como una recomendación. */
export type ProductoMin = Pick<Producto, 'id' | 'nombre' | 'categoria'>

export type EstadoServicio = 'arriba' | 'degradado' | 'caido' | null
export type EstadoStream = 'conectando' | 'abierto' | 'reintentando' | 'rendido'

export type Toast = { id: number; texto: string; tono: 'ok' | 'bad'; verCarrito?: boolean }

export type Tienda = {
  /* identidad: la emite Amazon Cognito (ver lib/auth.ts y lib/cognito.ts) */
  sesion: Sesion | null
  usuarioId: string
  ingresar: (email: string, clave: string) => Promise<{ ok: true; sesion: Sesion } | { ok: false; error: string }>
  registrarse: (email: string, clave: string, nombre: string) => Promise<{ ok: true; sesion: Sesion } | { ok: false; error: string }>
  salir: () => void

  /* catálogo completo en memoria: deseos, populares, hero y nombres */
  catalogo: Producto[]
  categorias: Categoria[]
  catalogoError: string | null
  recargarCatalogo: () => Promise<void>

  /* carrito (ms-carrito) */
  carrito: Carrito | null
  carritoError: string | null
  cantidadCarrito: number
  ocupado: boolean
  agregar: (p: ProductoMin, cantidad?: number) => Promise<boolean>
  cambiarCantidad: (productoId: string, cantidad: number) => Promise<void>
  fijarCarrito: (c: Carrito | null) => void
  refrescarCarrito: () => Promise<void>
  justoAgregado: string | null
  bump: boolean

  /* lista de deseos (local) */
  deseos: string[]
  alternarDeseo: (id: string) => void

  /* paneles y avisos */
  carritoAbierto: boolean
  deseosAbierto: boolean
  abrirCarrito: () => void
  abrirDeseos: () => void
  cerrarPaneles: () => void
  toast: Toast | null
  avisar: (texto: string, tono?: 'ok' | 'bad', verCarrito?: boolean) => void
  cerrarToast: () => void

  /* recomendaciones: se vuelven a pedir cada vez que sube este contador */
  recTick: number
  /** vuelve a pedir «Para ti» tras una interacción que no es ver/agregar (cupón, envío, pago) */
  refrescarRecomendaciones: () => void
  senales: Senal[]
  registrar: (s: Omit<Senal, 't'>) => void
  reiniciarPerfil: () => void

  /* salud real de los cinco servicios */
  salud: Record<Servicio, EstadoServicio>
  revisarSalud: () => void

  /* notificaciones (SSE de ms-notificaciones) */
  notificaciones: Notificacion[]
  noLeidas: number
  estadoStream: EstadoStream
  eventoTick: number
  marcarLeida: (id: string) => void
  marcarTodas: () => void
  reconectarStream: () => void
}

export const TiendaContext = createContext<Tienda | null>(null)

export function useTienda(): Tienda {
  const t = useContext(TiendaContext)
  if (!t) throw new Error('useTienda fuera de <TiendaProvider>')
  return t
}
