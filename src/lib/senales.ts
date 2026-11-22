/* ---------------------------------------------------------------------------
   Señales de esta sesión para el panel "Tu perfil" de «Para ti».

   No son la fuente de las recomendaciones (eso lo calcula ms-recomendaciones
   con los eventos de Kafka): son el ESPEJO local de los eventos que esta
   tienda provocó —VER_PRODUCTO al abrir un detalle, AGREGAR_CARRITO, COMPRA—
   para que el cliente entienda por qué cambia la lista. Los pesos son los del
   motor (§5: ver 1, carrito 3, compra 5) para que ambas vistas cuenten igual.

   El prototipo además medía el tiempo con el cursor encima de cada tarjeta;
   eso nunca llegaba al backend (no existe un evento de "dwell"), así que se
   quitó en lugar de mostrar un perfil que el motor no conoce.
   ------------------------------------------------------------------------- */

export type TipoSenal = 'ver' | 'carrito' | 'compra'
export type Senal = { tipo: TipoSenal; productoId: string; nombre: string; categoria: string; t: number }

export const PESO: Record<TipoSenal, number> = { ver: 1, carrito: 3, compra: 5 }
const MAX = 100
const clave = (usuarioId: string) => `p360.senales.${usuarioId}`

export function leerSenales(usuarioId: string): Senal[] {
  try {
    const crudo = localStorage.getItem(clave(usuarioId))
    const lista = crudo ? (JSON.parse(crudo) as Senal[]) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

export function registrarSenal(usuarioId: string, s: Omit<Senal, 't'>, ahora = Date.now()): Senal[] {
  const lista = [...leerSenales(usuarioId), { ...s, t: ahora }].slice(-MAX)
  try {
    localStorage.setItem(clave(usuarioId), JSON.stringify(lista))
  } catch {
    /* sin storage el perfil simplemente no se recuerda */
  }
  return lista
}

export function borrarSenales(usuarioId: string): void {
  try {
    localStorage.removeItem(clave(usuarioId))
  } catch {
    /* nada */
  }
}

export type Perfil = {
  afinidad: { categoria: string; pct: number }[]
  vistos: number
  alCarrito: number
  compras: number
  masRevisado: string | null
}

export function calcularPerfil(senales: Senal[]): Perfil {
  const porCat = new Map<string, number>()
  const porProd = new Map<string, { nombre: string; peso: number }>()
  let total = 0
  for (const s of senales) {
    const w = PESO[s.tipo]
    total += w
    porCat.set(s.categoria, (porCat.get(s.categoria) ?? 0) + w)
    const p = porProd.get(s.productoId) ?? { nombre: s.nombre, peso: 0 }
    p.peso += w
    porProd.set(s.productoId, p)
  }
  const afinidad = [...porCat.entries()]
    .map(([categoria, w]) => ({ categoria, pct: total > 0 ? Math.round((w / total) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct)
  const top = [...porProd.values()].sort((a, b) => b.peso - a.peso)[0]
  return {
    afinidad,
    vistos: senales.filter((s) => s.tipo === 'ver').length,
    alCarrito: senales.filter((s) => s.tipo === 'carrito').length,
    compras: senales.filter((s) => s.tipo === 'compra').length,
    masRevisado: top ? top.nombre : null,
  }
}
