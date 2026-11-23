import type { ReactNode } from 'react'

/* Primitivas pequeñas que se repiten en todas las pantallas. */

export type Tono = 'ok' | 'bad' | 'warn' | 'info'

export function Aviso({ tono, titulo, children }: { tono: Tono; titulo?: string; children?: ReactNode }) {
  return (
    <div className={`aviso aviso--${tono}`} role={tono === 'bad' ? 'alert' : 'status'}>
      {titulo && <b>{titulo}</b>}
      {children}
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>
}

export function Insignia({ tono = 'neutral', children }: { tono?: 'ok' | 'info' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) {
  return <span className={`insignia insignia--${tono}`}>{children}</span>
}

export function Estrellas({ valor }: { valor: number }) {
  const llenas = Math.round(valor)
  return (
    <span className="estrellas" aria-label={`${valor.toFixed(1)} de 5`}>
      {'★'.repeat(llenas)}
      <span style={{ color: 'var(--line)' }}>{'★'.repeat(Math.max(0, 5 - llenas))}</span>
    </span>
  )
}

export function SkelTarjeta() {
  return (
    <div aria-hidden="true" className="tarjeta" style={{ pointerEvents: 'none' }}>
      <div className="skel" style={{ aspectRatio: '4/3', borderRadius: 0 }} />
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="skel" style={{ height: 10, width: '40%' }} />
        <div className="skel" style={{ height: 16, width: '75%' }} />
        <div className="skel" style={{ height: 10, width: '90%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
          <div className="skel" style={{ height: 20, width: '34%' }} />
          <div className="skel" style={{ height: 34, width: '28%' }} />
        </div>
      </div>
    </div>
  )
}

export function SkelPedido() {
  return (
    <div aria-hidden="true" className="pedido" style={{ marginBottom: 14 }}>
      <div className="skel" style={{ height: 16, width: '30%' }} />
      <div className="skel" style={{ height: 6, width: '100%' }} />
      <div className="skel" style={{ height: 12, width: '70%' }} />
      <div className="skel" style={{ height: 12, width: '55%' }} />
    </div>
  )
}
