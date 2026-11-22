/* ---------------------------------------------------------------------------
   Espera creciente para reconexiones y lecturas periódicas (stream de
   notificaciones, refresco de "Mis pedidos").

   Sin esto, un servicio caído recibe una petición cada pocos segundos desde
   CADA navegador abierto, para siempre, y sus logs se llenan de la misma línea
   justo cuando más se necesitan para diagnosticar.

   La progresión base es determinista para poder testearla. A diferencia de la
   consola (un operador), la tienda tiene muchos clientes a la vez: si el
   servicio vuelve, todos reintentarían en el mismo instante. Por eso existe
   `conJitter`, que se aplica DESPUÉS, al programar el timer.
   ------------------------------------------------------------------------- */

export const ESPERA_BASE_MS = 5000
export const ESPERA_MAX_MS = 60000
export const FALLOS_PARA_RENDIRSE = 5

/**
 * Espera antes del próximo intento, duplicando por cada fallo consecutivo.
 *
 * fallos = 0 (todo bien)  -> base
 * fallos = 1              -> base
 * fallos = 2              -> base * 2
 * fallos = 3              -> base * 4 … hasta el techo
 */
export function siguienteEspera(
  fallosConsecutivos: number,
  base = ESPERA_BASE_MS,
  max = ESPERA_MAX_MS,
): number {
  if (fallosConsecutivos <= 1) return base
  const exponente = fallosConsecutivos - 1
  /* El exponente se acota antes de elevar: 2**1024 es Infinity y multiplicarlo
     por base daría NaN en lugar del techo. */
  if (exponente > 32) return max
  return Math.min(max, base * 2 ** exponente)
}

/** Tras N fallos seguidos se corta el ciclo y se espera una acción del usuario. */
export function debeRendirse(fallosConsecutivos: number, maxFallos = FALLOS_PARA_RENDIRSE): boolean {
  return fallosConsecutivos >= maxFallos
}

/** "5 s", "1 min", "1,5 min" — para decirle al usuario cuánto falta. */
export function describirEspera(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)} s`
  const minutos = ms / 60000
  return `${Number.isInteger(minutos) ? minutos : minutos.toFixed(1).replace('.', ',')} min`
}

/**
 * Reparte los reintentos de muchos navegadores en ±20 % alrededor de la espera.
 * El aleatorio se inyecta para que la prueba sea determinista.
 */
export function conJitter(ms: number, aleatorio: () => number = Math.random, fraccion = 0.2): number {
  const factor = 1 - fraccion + aleatorio() * 2 * fraccion
  return Math.round(ms * factor)
}
