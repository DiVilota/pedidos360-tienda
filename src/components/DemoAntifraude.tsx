import { useState } from 'react'
import { pagos } from '../lib/api'
import { normalizarTarjeta, peticionPago } from '../lib/checkout'

/* ---------------------------------------------------------------------------
   Herramientas de DEMO del antifraude, dentro del checkout.

   - Ráfaga: 4 intentos SIMULADA seguidos con la misma tarjeta. La regla es
     "más de 3 en 10 s": los 3 primeros pasan y el 4.º recibe 429 y bloquea la
     tarjeta 30 min. Los ids de orden RAFAGA-* no son pedidos, así que
     ms-carrito ignora sus resultados (no se toca stock ni pedidos reales).
   - Reset: DELETE /api/alertas, para no esperar los 30 min del bloqueo.

   Después de la ráfaga, pagar el pedido con esa tarjeta (simulada o Webpay)
   tiene que terminar rechazado por el antifraude.
   ------------------------------------------------------------------------- */

const TARJETA_DEFECTO = '4051 8856 0044 6623'

export function DemoAntifraude({ usuarioId, tarjeta }: { usuarioId: string; tarjeta: string }) {
  const [ocupado, setOcupado] = useState<'rafaga' | 'reset' | null>(null)
  const [resultado, setResultado] = useState<{ tono: 'ok' | 'bad' | 'warn'; texto: string } | null>(null)
  const numero = normalizarTarjeta(tarjeta).length >= 13 ? tarjeta : TARJETA_DEFECTO

  const rafaga = async () => {
    setOcupado('rafaga')
    setResultado(null)
    const codigos: string[] = []
    for (let i = 1; i <= 4; i++) {
      try {
        const { status } = await pagos.iniciar(peticionPago({ id: `RAFAGA-${Date.now()}-${i}`, total: 1000 }, usuarioId, 'SIMULADA', numero))
        codigos.push(String(status))
      } catch {
        codigos.push('error')
      }
    }
    const bloqueo = codigos.includes('429')
    setResultado({
      tono: bloqueo ? 'ok' : 'warn',
      texto: `Ráfaga con ****${normalizarTarjeta(numero).slice(-4)}: ${codigos.join(' · ')}. ${
        bloqueo ? 'Tarjeta bloqueada 30 min: paga ahora con ella y el pago debe rechazarse.' : 'No hubo bloqueo.'
      }`,
    })
    setOcupado(null)
  }

  const reset = async () => {
    setOcupado('reset')
    setResultado(null)
    try {
      await pagos.resetAntifraude(usuarioId)
      setResultado({ tono: 'ok', texto: 'Antifraude reseteado: no quedan tarjetas bloqueadas.' })
    } catch (e) {
      setResultado({ tono: 'bad', texto: `No se pudo resetear: ${(e as Error).message}` })
    }
    setOcupado(null)
  }

  return (
    <div style={{ marginTop: 18, padding: 12, border: '1px dashed var(--borde, #334155)', borderRadius: 10 }}>
      <div className="tenue" style={{ fontSize: 12, marginBottom: 8 }}>
        Demo antifraude · tarjeta ****{normalizarTarjeta(numero).slice(-4)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--ghost btn--sm" disabled={ocupado !== null} onClick={() => void rafaga()}>
          {ocupado === 'rafaga' ? 'Enviando ráfaga…' : 'Ráfaga (4 intentos en 10 s)'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={ocupado !== null} onClick={() => void reset()}>
          {ocupado === 'reset' ? 'Reseteando…' : 'Resetear antifraude'}
        </button>
      </div>
      {resultado && (
        <p className="ayuda" style={{ marginTop: 8, color: resultado.tono === 'bad' ? 'var(--bad, #f87171)' : undefined }}>
          {resultado.texto}
        </p>
      )}
    </div>
  )
}
