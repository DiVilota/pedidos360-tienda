import { useCallback, useEffect, useState } from 'react'
import { API, SERVICIOS, type Servicio } from '../config'
import { salud as pedirSalud } from '../lib/api'
import type { EstadoServicio } from '../state/contexto'

/* ---------------------------------------------------------------------------
   Salud REAL de los cinco servicios, leída de /actuator/health (lo único que
   exponen por Actuator, §3.5). Reemplaza la insignia del prototipo, que decía
   "backend conectado" en cuanto UNA llamada a recomendaciones respondía 200.

   - 200 + UP              → arriba
   - 503 + DOWN, o otro HTTP → degradado: el proceso atiende pero algo falla
   - fallo de red          → caído (servicio apagado o bloqueado por CORS)
   ------------------------------------------------------------------------- */

const INICIAL = Object.fromEntries(SERVICIOS.map((s) => [s.clave, null])) as Record<Servicio, EstadoServicio>

async function sondear(servicio: Servicio): Promise<EstadoServicio> {
  try {
    const cuerpo = await pedirSalud(API[servicio])
    return cuerpo.status === 'UP' ? 'arriba' : 'degradado'
  } catch (e) {
    const status = (e as { status?: number }).status
    return status != null && status !== 0 ? 'degradado' : 'caido'
  }
}

export function useSalud(intervaloMs = 20000) {
  const [salud, setSalud] = useState(INICIAL)

  const revisar = useCallback(async () => {
    const estados = await Promise.all(SERVICIOS.map((s) => sondear(s.clave)))
    setSalud(Object.fromEntries(SERVICIOS.map((s, i) => [s.clave, estados[i]])) as Record<Servicio, EstadoServicio>)
  }, [])

  useEffect(() => {
    void revisar()
    const t = setInterval(() => void revisar(), intervaloMs)
    return () => clearInterval(t)
  }, [revisar, intervaloMs])

  return { salud, revisar }
}

export type ResumenSalud = { arriba: number; total: number; etiqueta: string; tono: 'ok' | 'warn' | 'bad' | 'neutral' }

export function resumirSalud(salud: Record<Servicio, EstadoServicio>): ResumenSalud {
  const valores = Object.values(salud)
  const total = valores.length
  if (valores.every((v) => v === null)) return { arriba: 0, total, etiqueta: 'verificando…', tono: 'neutral' }
  const arriba = valores.filter((v) => v === 'arriba').length
  const vivos = valores.filter((v) => v === 'arriba' || v === 'degradado').length
  if (arriba === total) return { arriba, total, etiqueta: 'backend conectado', tono: 'ok' }
  if (vivos === 0) return { arriba, total, etiqueta: 'modo demo · sin backend', tono: 'bad' }
  return { arriba, total, etiqueta: `backend parcial · ${arriba}/${total}`, tono: 'warn' }
}
