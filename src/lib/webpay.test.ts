import { describe, expect, it } from 'vitest'
import { armarFormularioWebpay } from './webpay'

describe('salto a Webpay', () => {
  it('es un POST con token_ws en el cuerpo, en la MISMA pestaña', () => {
    const f = armarFormularioWebpay('https://webpay3gint.transbank.cl/webpayserver/initTransaction', 'tok123')
    expect(f.method.toLowerCase()).toBe('post')
    expect(f.target).toBe('_self')
    expect(f.action).toBe('https://webpay3gint.transbank.cl/webpayserver/initTransaction')
    const input = f.querySelector('input[name="token_ws"]') as HTMLInputElement
    expect(input.type).toBe('hidden')
    expect(input.value).toBe('tok123')
    expect(f.action).not.toContain('tok123')
  })
})
