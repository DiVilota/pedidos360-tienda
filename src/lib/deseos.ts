/* Lista de deseos: no hay endpoint en el contrato para guardarla, así que vive
   en este navegador (y la UI lo dice). Se guardan IDs de ms-productos, no
   copias de los productos: precio y stock se leen siempre del catálogo. */

const CLAVE = 'p360.deseos'

export function leerDeseos(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function guardarDeseos(ids: string[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(ids))
  } catch {
    /* sin storage la lista dura lo que la pestaña */
  }
}

export const alternar = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
