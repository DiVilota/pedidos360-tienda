import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNotificaciones } from '../hooks/useNotificaciones'
import { useSalud } from '../hooks/useSalud'
import { ApiError, carrito as apiCarrito, productos as apiProductos } from '../lib/api'
import { cerrarSesion, crearCuenta, iniciarSesion, idAnonimo, sesionActual, usuarioIdActual, type Sesion } from '../lib/auth'
import { alternar, guardarDeseos, leerDeseos } from '../lib/deseos'
import { borrarSenales, leerSenales, registrarSenal, type Senal } from '../lib/senales'
import type { Carrito, Categoria, Producto } from '../lib/types'
import { TiendaContext, type ProductoMin, type Tienda, type Toast } from './contexto'

/* ms-recomendaciones recalcula al CONSUMIR el evento de Kafka, no al recibir
   el HTTP de ms-productos/ms-carrito: si se relee al instante, llega la lista
   vieja. Esta espera cubre el viaje productor → tópico → consumidor. */
const ESPERA_RECALCULO_MS = 900

export function TiendaProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(() => sesionActual())
  const usuarioId = useMemo(() => usuarioIdActual(sesion), [sesion])

  const [catalogo, setCatalogo] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [catalogoError, setCatalogoError] = useState<string | null>(null)

  const [carrito, setCarrito] = useState<Carrito | null>(null)
  const [carritoError, setCarritoError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [justoAgregado, setJustoAgregado] = useState<string | null>(null)
  const [bump, setBump] = useState(false)

  const [deseos, setDeseos] = useState<string[]>(() => leerDeseos())
  const [carritoAbierto, setCarritoAbierto] = useState(false)
  const [deseosAbierto, setDeseosAbierto] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  const [recTick, setRecTick] = useState(0)
  const [senales, setSenales] = useState<Senal[]>(() => leerSenales(usuarioIdActual(sesionActual())))

  const { salud, revisar } = useSalud()
  const notif = useNotificaciones(usuarioId)

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const despues = useCallback((clave: string, fn: () => void, ms: number) => {
    clearTimeout(timers.current[clave])
    timers.current[clave] = setTimeout(fn, ms)
  }, [])

  /* ---------------------------- avisos ---------------------------- */
  const avisar = useCallback(
    (texto: string, tono: 'ok' | 'bad' = 'ok', verCarrito = false) => {
      setToast({ id: Date.now(), texto, tono, verCarrito })
      despues('toast', () => setToast(null), tono === 'bad' ? 5000 : 3200)
    },
    [despues],
  )

  const pedirRecomendaciones = useCallback(() => {
    despues('rec', () => setRecTick((t) => t + 1), ESPERA_RECALCULO_MS)
  }, [despues])

  const registrar = useCallback(
    (s: Omit<Senal, 't'>) => {
      setSenales(registrarSenal(usuarioId, s))
      pedirRecomendaciones()
    },
    [usuarioId, pedirRecomendaciones],
  )

  const reiniciarPerfil = useCallback(() => {
    borrarSenales(usuarioId)
    setSenales([])
  }, [usuarioId])

  useEffect(() => setSenales(leerSenales(usuarioId)), [usuarioId])

  /* --------------------------- catálogo --------------------------- */
  const recargarCatalogo = useCallback(async () => {
    try {
      const [lista, cats] = await Promise.all([apiProductos.listar(), apiProductos.categorias()])
      setCatalogo(lista)
      setCategorias(cats)
      setCatalogoError(null)
    } catch (e) {
      setCatalogoError(e instanceof Error ? e.message : 'error desconocido')
    }
  }, [])

  useEffect(() => {
    void recargarCatalogo()
  }, [recargarCatalogo])

  /* ---------------------------- carrito ---------------------------- */
  const refrescarCarrito = useCallback(async () => {
    try {
      setCarrito(await apiCarrito.obtener(usuarioId))
      setCarritoError(null)
    } catch (e) {
      setCarritoError(e instanceof ApiError && e.esDeRed ? 'El carrito (ms-carrito) no responde.' : (e as Error).message)
    }
  }, [usuarioId])

  useEffect(() => {
    void refrescarCarrito()
  }, [refrescarCarrito])

  const agregar = useCallback(
    async (p: ProductoMin, cantidad = 1) => {
      setOcupado(true)
      try {
        setCarrito(await apiCarrito.agregar(usuarioId, p.id, cantidad))
        setCarritoError(null)
        setJustoAgregado(p.id)
        setBump(true)
        despues('bump', () => setBump(false), 280)
        despues('justo', () => setJustoAgregado(null), 1300)
        avisar(`${p.nombre} agregado al carrito`, 'ok', true)
        registrar({ tipo: 'carrito', productoId: p.id, nombre: p.nombre, categoria: p.categoria })
        return true
      } catch (e) {
        avisar(
          e instanceof ApiError && e.esDeRed ? 'No se pudo agregar: el carrito no responde.' : `No se pudo agregar: ${(e as Error).message}`,
          'bad',
        )
        return false
      } finally {
        setOcupado(false)
      }
    },
    [usuarioId, avisar, despues, registrar],
  )

  const cambiarCantidad = useCallback(
    async (productoId: string, cantidad: number) => {
      setOcupado(true)
      try {
        setCarrito(await apiCarrito.cambiarCantidad(usuarioId, productoId, Math.max(0, cantidad)))
      } catch (e) {
        avisar(`No se pudo actualizar el carrito: ${(e as Error).message}`, 'bad')
      } finally {
        setOcupado(false)
      }
    },
    [usuarioId, avisar],
  )

  /* ---------------------------- sesión ---------------------------- */
  const ingresar = useCallback(
    async (email: string, clave: string) => {
      const r = await iniciarSesion(email, clave)
      if (!r.ok) return r
      /* El carrito armado como anónimo se traslada a la cuenta: si no, al
         iniciar sesión para pagar el cliente vería su carrito vacío. */
      const anonimo = idAnonimo()
      try {
        const previo = await apiCarrito.obtener(anonimo)
        if (previo.items.length > 0) {
          for (const it of previo.items) await apiCarrito.agregar(r.sesion.email, it.productoId, it.cantidad)
          await apiCarrito.vaciar(anonimo)
        }
      } catch {
        /* si falla el traslado, el carrito anónimo sigue ahí; no bloquea el login */
      }
      setSesion(r.sesion)
      return r
    },
    [],
  )

  const salir = useCallback(() => {
    cerrarSesion()
    setSesion(null)
    setCarritoAbierto(false)
    setDeseosAbierto(false)
  }, [])

  /* Crear cuenta y entrar: el traslado del carrito anónimo es el mismo trabajo
     que al iniciar sesión, así que se reusa `ingresar` en vez de duplicarlo.
     Importa de verdad acá: quien se registra suele venir de armar un carrito
     sin cuenta y, al llegar al checkout, crearla. */
  const registrarse = useCallback(
    async (email: string, clave: string, nombre: string) => {
      const alta = await crearCuenta(email, clave, nombre)
      if (!alta.ok) return alta
      return await ingresar(email, clave)
    },
    [ingresar],
  )

  /* ----------------------------- deseos ----------------------------- */
  const alternarDeseo = useCallback((id: string) => {
    setDeseos((prev) => {
      const n = alternar(prev, id)
      guardarDeseos(n)
      return n
    })
  }, [])

  /* Un pedido pagado o un envío que avanza cambia el carrito (se vacía) y las
     recomendaciones (COMPRA pesa 5): se refrescan al llegar la notificación. */
  useEffect(() => {
    if (notif.eventoTick === 0) return
    void refrescarCarrito()
    pedirRecomendaciones()
  }, [notif.eventoTick, refrescarCarrito, pedirRecomendaciones])

  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach(clearTimeout)
  }, [])

  const valor: Tienda = {
    sesion,
    usuarioId,
    ingresar,
    registrarse,
    salir,
    catalogo,
    categorias,
    catalogoError,
    recargarCatalogo,
    carrito,
    carritoError,
    cantidadCarrito: carrito?.items.reduce((a, i) => a + i.cantidad, 0) ?? 0,
    ocupado,
    agregar,
    cambiarCantidad,
    fijarCarrito: setCarrito,
    refrescarCarrito,
    justoAgregado,
    bump,
    deseos,
    alternarDeseo,
    carritoAbierto,
    deseosAbierto,
    abrirCarrito: () => {
      setDeseosAbierto(false)
      setCarritoAbierto(true)
    },
    abrirDeseos: () => {
      setCarritoAbierto(false)
      setDeseosAbierto(true)
    },
    cerrarPaneles: () => {
      setCarritoAbierto(false)
      setDeseosAbierto(false)
    },
    toast,
    avisar,
    cerrarToast: () => setToast(null),
    recTick,
    refrescarRecomendaciones: pedirRecomendaciones,
    senales,
    registrar,
    reiniciarPerfil,
    salud,
    revisarSalud: () => void revisar(),
    ...notif,
  }

  return <TiendaContext.Provider value={valor}>{children}</TiendaContext.Provider>
}
