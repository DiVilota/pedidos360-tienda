import { useCallback, useEffect, useRef, useState } from 'react'
import { notificaciones as api } from '../lib/api'
import { conJitter, debeRendirse, siguienteEspera } from '../lib/backoff'
import type { Notificacion } from '../lib/types'
import type { EstadoStream } from '../state/contexto'

/* ---------------------------------------------------------------------------
   Campana de notificaciones: listado inicial por REST + empuje por SSE.

   El stream va por query (?usuarioId=) porque EventSource no permite headers.
   Se escucha el evento con nombre "notificacion" y también el genérico
   "message": el contrato no fija el nombre del evento SSE, y escuchar ambos
   evita depender de esa decisión del backend.

   La reconexión nativa de EventSource se reemplaza por backoff propio: la
   nativa reintenta cada ~3 s para siempre, desde cada navegador abierto, y eso
   golpea a un servicio que justo está caído. Tras 5 fallos se deja de
   intentar y la campana ofrece "reintentar".

   Respaldo por SONDEO: el API Gateway REST no transmite SSE (junta la
   respuesta completa y corta a los 29 s), y la ruta /stream ni siquiera está
   publicada ahí: cae en el proxy de la tienda y devuelve HTML. Mientras el
   stream no esté abierto se relee el listado cada SONDEO_MS; lo nuevo y no
   leído dispara eventoTick igual que un evento SSE (toast, "Mis pedidos").
   ------------------------------------------------------------------------- */

const LIMITE = 50
const SONDEO_MS = 5000

function parsear(datos: string): Notificacion | null {
  try {
    const n = JSON.parse(datos) as Notificacion
    return n && typeof n.id === 'string' && typeof n.titulo === 'string' ? n : null
  } catch {
    return null
  }
}

export function useNotificaciones(usuarioId: string) {
  const [lista, setLista] = useState<Notificacion[]>([])
  const [estado, setEstado] = useState<EstadoStream>('conectando')
  const [eventoTick, setEventoTick] = useState(0)
  const [intento, setIntento] = useState(0)

  const fallos = useRef(0)
  /* ids ya vistos: null hasta la primera carga, para no avisar de lo viejo */
  const conocidas = useRef<Set<string> | null>(null)

  const cargar = useCallback(async () => {
    try {
      const l = await api.listar(usuarioId)
      const nuevas = Array.isArray(l) ? l.slice(0, LIMITE) : []
      const previas = conocidas.current
      if (previas && nuevas.some((n) => !n.leida && !previas.has(n.id))) setEventoTick((t) => t + 1)
      conocidas.current = new Set(nuevas.map((n) => n.id))
      setLista(nuevas)
    } catch {
      /* sin servicio la campana queda vacía; la insignia de salud ya lo dice */
    }
  }, [usuarioId])

  useEffect(() => {
    setLista([])
    conocidas.current = null
    void cargar()
  }, [cargar])

  useEffect(() => {
    if (estado === 'abierto') return
    const t = setInterval(() => void cargar(), SONDEO_MS)
    return () => clearInterval(t)
  }, [estado, cargar])

  useEffect(() => {
    /* Por el gateway no hay SSE posible: se va directo al sondeo. */
    if (typeof EventSource === 'undefined' || api.urlStream(usuarioId).includes('.execute-api.')) {
      setEstado('sondeo')
      return
    }
    let es: EventSource | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelado = false

    const recibir = (ev: MessageEvent) => {
      const n = parsear(ev.data)
      if (!n) return
      conocidas.current?.add(n.id)
      setLista((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, LIMITE))
      setEventoTick((t) => t + 1)
    }

    const abrir = () => {
      if (cancelado) return
      setEstado(fallos.current === 0 ? 'conectando' : 'reintentando')
      es = new EventSource(api.urlStream(usuarioId))
      es.onopen = () => {
        /* Lo que llegó mientras estaba desconectado no viene por el stream:
           se relee el listado al (re)abrir. */
        if (fallos.current > 0) void cargar()
        fallos.current = 0
        setEstado('abierto')
      }
      es.addEventListener('notificacion', recibir as EventListener)
      es.onmessage = recibir
      es.onerror = () => {
        es?.close()
        es = null
        if (cancelado) return
        fallos.current += 1
        if (debeRendirse(fallos.current)) {
          setEstado('rendido')
          return
        }
        setEstado('reintentando')
        timer = setTimeout(abrir, conJitter(siguienteEspera(fallos.current, 2000, 30000)))
      }
    }

    fallos.current = 0
    abrir()
    return () => {
      cancelado = true
      clearTimeout(timer)
      es?.close()
    }
  }, [usuarioId, cargar, intento])

  const marcarLeida = useCallback((id: string) => {
    setLista((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)))
    api.marcarLeida(id, usuarioId).catch(() => {
      /* si falla, la próxima carga la traerá como no leída: no se miente */
    })
  }, [usuarioId])

  const marcarTodas = useCallback(() => {
    setLista((prev) => prev.map((n) => ({ ...n, leida: true })))
    api.marcarTodas(usuarioId).catch(() => void cargar())
  }, [usuarioId, cargar])

  const reconectar = useCallback(() => setIntento((i) => i + 1), [])

  return {
    notificaciones: lista,
    noLeidas: lista.filter((n) => !n.leida).length,
    estadoStream: estado,
    eventoTick,
    marcarLeida,
    marcarTodas,
    reconectarStream: reconectar,
  }
}
