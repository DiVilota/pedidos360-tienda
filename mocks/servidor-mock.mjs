/* ============================================================================
   Servidor mock de los cinco microservicios que usa la tienda.

   Para qué: levantar el backend real exige Docker, Kafka, RabbitMQ, MySQL,
   DynamoDB y el sandbox de Transbank. Este script escucha en los MISMOS
   puertos y responde los MISMOS DTO (nombres de campo copiados de los records
   y clases de el paquete DTO de cada backend/ms-…), con estado en memoria, para poder recorrer
   la tienda completa en un navegador real.

     8086 ms-productos       catálogo §7.1, detalle (VER_PRODUCTO), stock admin
     8087 ms-carrito         carrito, cupones, envío, pedidos, resumen admin
     8083 ms-pago            WEBPAY (formulario simulado) · SIMULADA · antifraude
     8084 ms-recomendaciones recomendaciones con `motivo` y métricas
     8088 ms-notificaciones  listado + SSE (evento "notificacion")

   Uso:   npm run mock
   Variables:
     MOCK_FRONT=http://localhost:5174   adonde redirige el commit de Webpay
     MOCK_AVANCE_MS=15000               cada cuánto avanza la logística
     MOCK_CAIDOS=recomendaciones,pagos  servicios que NO se levantan (para ver
                                        la insignia "backend parcial")

   Reglas que imita a propósito (para que la UI las muestre igual que en real):
   - CORS sólo para los orígenes de CORS_ORIGENES (5173, 5174, 8090, 8091).
   - X-Usuario-Id obligatorio en ms-carrito (400 si falta).
   - El pago NO marca el pedido como pagado al instante: el resultado "viaja"
     ~1 s (lo que tardaría pagos-resultado por Kafka) antes de que ms-carrito
     lo procese.
   - Antifraude: el 4.º intento con la misma huella en 10 s responde 429 y
     bloquea 30 min. SIMULADA = huella de la tarjeta; WEBPAY = huella de la
     cuenta (clientId), igual que ServicioPagos.
   - Pasarela SIMULADA: aprueba todo salvo tarjetas que terminan en 0002.
   ========================================================================= */

import http from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const FRONT = (process.env.MOCK_FRONT ?? 'http://localhost:5174').replace(/\/+$/, '')
const AVANCE_MS = Number(process.env.MOCK_AVANCE_MS ?? 15000)
const CAIDOS = new Set((process.env.MOCK_CAIDOS ?? '').split(',').map((s) => s.trim()).filter(Boolean))
const ORIGENES = new Set(['http://localhost:5173', 'http://localhost:5174', 'http://localhost:8090', 'http://localhost:8091'])

const log = (svc, ...a) => console.log(new Date().toISOString().slice(11, 19), `[${svc}]`, ...a)
const ahora = () => Date.now()
const iso = (t = ahora()) => new Date(t).toISOString()
/* LocalDateTime de Java (sin zona), como el bloqueadoHasta de ms-pago. */
const localDateTime = (t) => {
  const d = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL')
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/* ------------------------------ catálogo §7.1 ------------------------------ */
const CATEGORIAS = [
  ['celulares', 'Celulares'],
  ['laptops', 'Laptops'],
  ['audio', 'Audio'],
  ['gaming', 'Gaming'],
  ['tv-video', 'TV y video'],
  ['smart-home', 'Smart home'],
  ['accesorios', 'Accesorios'],
  ['camaras', 'Cámaras'],
]
const ETIQUETA = Object.fromEntries(CATEGORIAS)

const productos = [
  ['item_101', 'Galaxy S24', 'Samsung', 'celulares', 'gama-alta', 649990, 14, 4.7, '6.2" AMOLED, 256 GB.'],
  ['item_102', 'iPhone 15', 'Apple', 'celulares', 'gama-alta', 799990, 6, 4.8, 'Chip A16, cámara de 48 MP.'],
  ['item_103', 'Moto G84', 'Motorola', 'celulares', 'gama-media', 229990, 40, 4.4, 'Pantalla pOLED, 5G.'],
  ['item_104', 'ZenBook 14', 'ASUS', 'laptops', 'ultraliviana', 749990, 22, 4.6, 'Ryzen 7, 16 GB, SSD 512 GB.'],
  ['item_105', 'MacBook Air M2', 'Apple', 'laptops', 'ultraliviana', 1099990, 9, 4.9, '13.6", 8 GB, 256 GB.'],
  ['item_106', 'IdeaPad Slim 3', 'Lenovo', 'laptops', 'uso-diario', 429990, 33, 4.3, 'Core i5, 8 GB, SSD 512 GB.'],
  ['item_107', 'WH-1000XM5', 'Sony', 'audio', 'audifonos', 299990, 18, 4.8, 'Cancelación de ruido activa.'],
  ['item_108', 'AirPods Pro 2', 'Apple', 'audio', 'audifonos', 249990, 12, 4.7, 'Audio espacial, estuche USB-C.'],
  ['item_109', 'Flip 6', 'JBL', 'audio', 'parlantes', 119990, 52, 4.6, 'Parlante portátil IP67.'],
  ['item_110', 'PlayStation 5', 'Sony', 'gaming', 'consolas', 549990, 5, 4.9, 'Consola con lector de discos.'],
  ['item_111', 'Switch OLED', 'Nintendo', 'gaming', 'consolas', 329990, 27, 4.8, 'Pantalla OLED de 7".'],
  ['item_112', 'DualSense', 'Sony', 'gaming', 'controles', 74990, 70, 4.6, 'Control inalámbrico háptico.'],
  ['item_113', 'Bravia 55" 4K', 'Sony', 'tv-video', 'televisores', 699990, 10, 4.6, 'Google TV, HDR10, 120 Hz.'],
  ['item_114', 'Fire TV Stick 4K', 'Amazon', 'tv-video', 'streaming', 59990, 45, 4.4, 'Streaming 4K con Alexa.'],
  ['item_115', 'Echo Dot 5', 'Amazon', 'smart-home', 'asistentes', 54990, 38, 4.5, 'Parlante inteligente con Alexa.'],
  ['item_116', 'Hue White & Color', 'Philips', 'smart-home', 'iluminacion', 39990, 60, 4.4, 'Ampolleta inteligente E27.'],
  ['item_117', 'Cargador GaN 65 W', 'Anker', 'accesorios', 'carga', 34990, 80, 4.7, 'USB-C, carga rápida para laptop.'],
  ['item_118', 'Funda MagSafe iPhone 15', 'Apple', 'accesorios', 'fundas', 49990, 35, 4.3, 'Silicona con imanes MagSafe.'],
  ['item_119', 'Alpha a6400', 'Sony', 'camaras', 'mirrorless', 899990, 7, 4.8, '24 MP, enfoque en tiempo real.'],
  ['item_120', 'HERO12 Black', 'GoPro', 'camaras', 'accion', 429990, 15, 4.7, '5.3K, sumergible 10 m.'],
].map(([id, nombre, marca, categoria, subcategoria, precio, stock, calificacion, descripcion]) => ({
  id, nombre, marca, categoria, subcategoria, precio, stock, calificacion, imagenUrl: null, descripcion, actualizadoEn: ahora(),
}))
const prodPorId = new Map(productos.map((p) => [p.id, p]))
const productoDTO = (p) => ({ ...p, categoriaEtiqueta: ETIQUETA[p.categoria] ?? p.categoria })
const nivel = (s) => (s <= 0 ? 'AGOTADO' : s <= 10 ? 'BAJO' : 'NORMAL')

/* ------------------------------ estado en memoria ------------------------------ */
const CUPONES = {
  BIENVENIDA10: { tipo: 'PORCENTAJE', valor: 10, minimoCompra: 0 },
  ENVIOGRATIS: { tipo: 'ENVIO_GRATIS', valor: 0, minimoCompra: 0 },
  GAMER5000: { tipo: 'MONTO', valor: 5000, minimoCompra: 50000 },
}
const SUCURSALES = [
  ['Santiago Centro', 'Huérfanos 1160'],
  ['Providencia', 'Av. Providencia 2124'],
  ['Maipú', 'Av. Pajaritos 3450'],
].map(([nombre, direccion]) => ({ nombre, direccion, etiqueta: `${nombre} · ${direccion}` }))

const carritos = new Map() // usuarioId → { items:[{productoId,cantidad,precioUnitario,nombre,categoria,marca}], cupon, metodoEnvio, direccion, comuna, sucursal, actualizadoEn }
const pedidos = new Map() // id → PedidoDTO interno
let secuencia = 1000
const eventos = [] // { usuarioId, tipoEvento, productoId, t }
const notificaciones = new Map() // usuarioId → NotificacionRespuestaDTO[]
const suscriptores = new Map() // usuarioId → Set<res>
const intentos = new Map() // huella → [t]
const bloqueos = new Map() // huella → { hasta, intentos }
const transacciones = new Map() // token → { orden, monto, clientId, origen }

const ETAPAS = {
  ENVIO: ['PAGADO', 'PREPARANDO', 'ENVIADO', 'EN_CAMINO', 'ENTREGADO'],
  RETIRO: ['PAGADO', 'PREPARANDO', 'LISTO_RETIRO', 'RETIRADO'],
}
const TEXTO_ESTADO = {
  PENDIENTE_PAGO: 'pendiente de pago', PAGADO: 'pagado', PREPARANDO: 'en preparación', ENVIADO: 'enviado',
  EN_CAMINO: 'en camino', ENTREGADO: 'entregado', LISTO_RETIRO: 'listo para retiro', RETIRADO: 'retirado', PAGO_RECHAZADO: 'rechazado',
}

/* ------------------------------ notificaciones ------------------------------ */
function notificar(usuarioId, tipo, titulo, mensaje, idPedido = null, datos = {}) {
  const n = { id: randomUUID(), usuarioId, tipo, titulo, mensaje, idPedido, datos, leida: false, creadaEn: iso() }
  const lista = notificaciones.get(usuarioId) ?? []
  lista.unshift(n)
  notificaciones.set(usuarioId, lista.slice(0, 200))
  for (const res of suscriptores.get(usuarioId) ?? []) res.write(`event: notificacion\ndata: ${JSON.stringify(n)}\n\n`)
  return n
}

function registrarEvento(usuarioId, tipoEvento, productoId) {
  eventos.push({ usuarioId, tipoEvento, productoId, t: ahora() })
  if (eventos.length > 5000) eventos.splice(0, eventos.length - 5000)
}

/* ------------------------------ carrito ------------------------------ */
const carritoDe = (u) => {
  if (!carritos.has(u)) carritos.set(u, { items: [], cupon: null, metodoEnvio: null, direccion: null, comuna: null, sucursal: null, actualizadoEn: null })
  return carritos.get(u)
}

function motivoRechazoCupon(codigo, subtotal) {
  const c = CUPONES[codigo]
  if (!c) return `El cupón ${codigo} no está vigente`
  if (subtotal < c.minimoCompra) return `El cupón ${codigo} requiere una compra mínima de ${clp(c.minimoCompra)} (subtotal actual ${clp(subtotal)})`
  return null
}

/* Misma fórmula que CalculadoraTotales de ms-carrito. */
function totales(items, cupon, metodo) {
  const subtotal = items.reduce((a, i) => a + i.precioUnitario * i.cantidad, 0)
  const envio = metodo === 'ENVIO' ? (subtotal >= 100000 ? 0 : 3990) : 0
  let descuento = 0
  let aplicado = false
  let aviso = null
  if (cupon) {
    const rechazo = motivoRechazoCupon(cupon, subtotal)
    if (rechazo) aviso = rechazo
    else {
      aplicado = true
      const c = CUPONES[cupon]
      if (c.tipo === 'PORCENTAJE') descuento = Math.floor((subtotal * Math.min(c.valor, 100)) / 100)
      else if (c.tipo === 'MONTO') descuento = Math.min(c.valor, subtotal)
      else {
        descuento = envio
        if (metodo == null) aviso = 'Se aplicará al elegir despacho a domicilio'
        else if (metodo === 'RETIRO') aviso = 'El retiro en sucursal ya es gratis'
        else if (envio === 0) aviso = 'Tu compra ya tiene envío gratis'
      }
    }
  }
  return { subtotal, descuento, costoEnvio: envio, total: subtotal - descuento + envio, cuponAplicado: aplicado, avisoCupon: aviso, faltaParaEnvioGratis: Math.max(0, 100000 - subtotal) }
}

const itemDTO = (i) => ({ productoId: i.productoId, nombre: i.nombre, categoria: i.categoria, marca: i.marca, precioUnitario: i.precioUnitario, cantidad: i.cantidad, subtotal: i.precioUnitario * i.cantidad })

function carritoDTO(u) {
  const c = carritoDe(u)
  const t = totales(c.items, c.cupon, c.metodoEnvio)
  const envioDefinido = c.metodoEnvio === 'ENVIO' ? Boolean(c.direccion && c.comuna) : c.metodoEnvio === 'RETIRO' ? Boolean(c.sucursal) : false
  return {
    usuarioId: u, items: c.items.map(itemDTO), cantidadUnidades: c.items.reduce((a, i) => a + i.cantidad, 0),
    cupon: c.cupon, cuponAplicado: t.cuponAplicado, avisoCupon: t.avisoCupon, metodoEnvio: c.metodoEnvio,
    direccion: c.direccion, comuna: c.comuna, sucursal: c.sucursal, envioDefinido,
    subtotal: t.subtotal, descuento: t.descuento, costoEnvio: t.costoEnvio, total: t.total,
    envioGratisDesde: 100000, faltaParaEnvioGratis: t.faltaParaEnvioGratis, actualizadoEn: c.actualizadoEn,
  }
}

/* ------------------------------ pedidos ------------------------------ */
function cambiarEstado(p, estado, t = ahora()) {
  p.estado = estado
  p.actualizadoEn = iso(t)
  p.historial.push({ estado, instante: iso(t) })
}

function liberarStock(p) {
  for (const i of p.items) {
    const prod = prodPorId.get(i.productoId)
    if (prod) prod.stock += i.cantidad
  }
}

/* Lo que haría el consumidor grupo-carrito de pagos-resultado. */
function procesarResultadoPago({ idOrden, estado, monto, codigoAutorizacion }) {
  const p = pedidos.get(idOrden)
  if (!p) return log('carrito', `resultado para pedido inexistente ${idOrden}: ignorado`)
  if (p.estado !== 'PENDIENTE_PAGO') return log('carrito', `resultado repetido para ${idOrden} (${p.estado}): ignorado`)
  if (estado === 'AUTORIZADO' && monto === p.total) {
    p.codigoAutorizacion = codigoAutorizacion ?? null
    p.pagadoEn = iso()
    cambiarEstado(p, 'PAGADO')
    for (const i of p.items) registrarEvento(p.usuarioId, 'COMPRA', i.productoId)
    notificar(p.usuarioId, 'pedido.pagado', 'Pago confirmado', `Recibimos el pago de tu pedido ${p.id} por ${clp(p.total)}`, p.id)
  } else {
    const motivo = estado === 'AUTORIZADO' ? 'El monto pagado no coincide con el total del pedido' : `El pago fue ${String(estado).toLowerCase()}`
    cambiarEstado(p, 'PAGO_RECHAZADO')
    liberarStock(p)
    notificar(p.usuarioId, 'pedido.rechazado', 'Pago rechazado', `${motivo}. Tu pedido ${p.id} fue cancelado.`, p.id)
  }
  log('carrito', `pedido ${p.id} → ${p.estado}`)
}
/* El resultado no llega en el mismo instante: viaja por Kafka. */
const publicarResultado = (r) => setTimeout(() => procesarResultadoPago(r), 1000)

/* @Scheduled de logística simulada. */
setInterval(() => {
  for (const p of pedidos.values()) {
    const etapas = ETAPAS[p.metodoEnvio]
    const i = etapas.indexOf(p.estado)
    if (i < 0 || i === etapas.length - 1) continue
    const anterior = p.estado
    cambiarEstado(p, etapas[i + 1])
    notificar(p.usuarioId, 'envio.estado-actualizado', `Tu pedido ${p.id} está ${TEXTO_ESTADO[p.estado]}`, `Estado actualizado: ${TEXTO_ESTADO[anterior]} → ${TEXTO_ESTADO[p.estado]}`, p.id)
  }
}, AVANCE_MS)

/* Semilla: pedidos pagados de días anteriores para que el panel admin y el
   historial de Ana no partan vacíos. Son datos del MOCK, no de la tienda. */
function sembrarPedido(usuarioId, diasAtras, lineas, metodo, estadoFinal) {
  const t0 = ahora() - diasAtras * 86400000 - 3600000
  const items = lineas.map(([id, cant]) => {
    const pr = prodPorId.get(id)
    return { productoId: id, nombre: pr.nombre, categoria: pr.categoria, marca: pr.marca, precioUnitario: pr.precio, cantidad: cant, subtotal: pr.precio * cant }
  })
  const t = totales(items, null, metodo)
  const id = `P-${++secuencia}`
  const p = {
    id, usuarioId, estado: 'PENDIENTE_PAGO', metodoEnvio: metodo,
    destino: metodo === 'RETIRO' ? SUCURSALES[1].etiqueta : 'Av. Apoquindo 4500, Las Condes',
    items, subtotal: t.subtotal, descuento: 0, costoEnvio: t.costoEnvio, total: t.total, cupon: null,
    codigoAutorizacion: String(100000 + secuencia), creadoEn: iso(t0), actualizadoEn: iso(t0), pagadoEn: iso(t0 + 60000),
    historial: [{ estado: 'PENDIENTE_PAGO', instante: iso(t0) }],
  }
  const etapas = ETAPAS[metodo]
  for (let k = 0; k <= etapas.indexOf(estadoFinal); k++) cambiarEstado(p, etapas[k], t0 + (k + 1) * 3600000)
  pedidos.set(id, p)
}
sembrarPedido('ana@correo.cl', 9, [['item_107', 1]], 'ENVIO', 'ENTREGADO')
sembrarPedido('ana@correo.cl', 4, [['item_117', 2], ['item_114', 1]], 'RETIRO', 'RETIRADO')
const otros = ['carlos@correo.cl', 'mfernandez@correo.cl', 'jp.soto@correo.cl', 'valentina@correo.cl']
const lotes = [
  [['item_101', 1]], [['item_109', 2]], [['item_111', 1], ['item_112', 2]], [['item_104', 1]], [['item_116', 4]],
  [['item_103', 1], ['item_117', 1]], [['item_110', 1]], [['item_115', 2]], [['item_108', 1]], [['item_120', 1]],
  [['item_112', 1]], [['item_106', 1]], [['item_113', 1]], [['item_109', 1], ['item_114', 1]],
]
lotes.forEach((l, k) => sembrarPedido(otros[k % otros.length], 13 - k, l, k % 3 === 0 ? 'RETIRO' : 'ENVIO', k % 3 === 0 ? 'RETIRADO' : 'ENTREGADO'))

/* ------------------------------ recomendaciones ------------------------------ */
const PESOS = { VER_PRODUCTO: 1, APLICAR_CUPON: 0.5, GESTIONAR_ENVIO: 0, AGREGAR_CARRITO: 3, COMPRA: 5 }

function popularidad() {
  const m = new Map()
  for (const e of eventos) if (e.productoId) m.set(e.productoId, (m.get(e.productoId) ?? 0) + (PESOS[e.tipoEvento] ?? 0))
  const max = Math.max(1, ...m.values())
  return (id) => (m.get(id) ?? 0) / max
}

/* Versión reducida de MotorRecomendaciones (§5.2): afinidad por categoría,
   subcategoría y marca con decaimiento, excluye comprados y sin stock,
   castiga lo ya visto y redacta el motivo. */
function recomendar(userId) {
  const propios = eventos.filter((e) => e.usuarioId === userId && e.productoId).slice(-100)
  const pop = popularidad()
  const afin = { cat: new Map(), sub: new Map(), marca: new Map() }
  let total = 0
  const vistos = new Set()
  const comprados = new Set()
  for (const e of propios) {
    const p = prodPorId.get(e.productoId)
    if (!p) continue
    const w = (PESOS[e.tipoEvento] ?? 0) * 0.5 ** ((ahora() - e.t) / 86400000)
    total += w
    afin.cat.set(p.categoria, (afin.cat.get(p.categoria) ?? 0) + w)
    afin.sub.set(p.subcategoria, (afin.sub.get(p.subcategoria) ?? 0) + w)
    afin.marca.set(p.marca, (afin.marca.get(p.marca) ?? 0) + w)
    if (e.tipoEvento === 'VER_PRODUCTO') vistos.add(p.id)
    if (e.tipoEvento === 'COMPRA') comprados.add(p.id)
  }
  const norm = (m, k) => (total > 0 ? (m.get(k) ?? 0) / total : 0)
  const sinHistorial = total === 0
  const candidatos = productos.filter((p) => p.stock > 0 && !comprados.has(p.id))
  const puntuados = candidatos.map((p) => {
    const ac = norm(afin.cat, p.categoria)
    const as = norm(afin.sub, p.subcategoria)
    const am = norm(afin.marca, p.marca)
    let score = 3 * ac + 2 * as + am + 0.5 * pop(p.id) + (sinHistorial ? p.calificacion / 10 : 0)
    if (vistos.has(p.id)) score *= 0.8
    let motivo = 'Popular entre otros clientes'
    if (!sinHistorial) {
      const parecido = [...propios].reverse().map((e) => prodPorId.get(e.productoId)).find((v) => v && v.id !== p.id && v.subcategoria === p.subcategoria)
      if (parecido) motivo = `Porque viste ${parecido.nombre}`
      else if (ac >= am && ac > 0) motivo = `Te interesa ${ETIQUETA[p.categoria]} (${Math.round(ac * 100)} %)`
      else if (am > 0) motivo = `Marca que sueles revisar: ${p.marca}`
    }
    return { p, score, motivo }
  })
  puntuados.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
  return puntuados.slice(0, 5).map(({ p, score, motivo }, i) => ({
    rankPosition: i + 1, score: Math.round(score * 1000) / 1000, itemId: p.id, nombre: p.nombre, categoria: p.categoria,
    marca: p.marca, precio: p.precio, calificacion: p.calificacion, imagenUrl: p.imagenUrl, motivo, subcategoria: p.subcategoria, stock: p.stock,
  }))
}

function metricas() {
  const t = ahora()
  const ult15 = eventos.filter((e) => t - e.t < 15 * 60000)
  const vistas = new Map()
  for (const e of ult15) if (e.tipoEvento === 'VER_PRODUCTO') vistas.set(e.productoId, (vistas.get(e.productoId) ?? 0) + 1)
  const topProductos = [...vistas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => {
    const p = prodPorId.get(id)
    return { productoId: id, nombre: p?.nombre ?? id, categoria: p?.categoria ?? null, vistas: v }
  })
  const porTipo = {}
  for (const e of ult15) porTipo[e.tipoEvento] = (porTipo[e.tipoEvento] ?? 0) + 1
  const serieMinutos = Array.from({ length: 15 }, (_, k) => {
    const inicio = Math.floor(t / 60000) * 60000 - (14 - k) * 60000
    return { inicio, interacciones: eventos.filter((e) => e.t >= inicio && e.t < inicio + 60000).length }
  })
  return {
    tipo: 'METRICAS', timestamp: t, interaccionesPorMinuto: eventos.filter((e) => t - e.t < 60000).length, serieMinutos, topProductos,
    usuariosActivos: new Set(eventos.filter((e) => t - e.t < 5 * 60000).map((e) => e.usuarioId)).size,
    embudo: { vistas: porTipo.VER_PRODUCTO ?? 0, carritos: porTipo.AGREGAR_CARRITO ?? 0, compras: porTipo.COMPRA ?? 0 },
    porTipo, totalInteracciones: eventos.length, productosMasVistos: topProductos.map((x) => ({ productoId: x.productoId, nombre: x.nombre, vistas: x.vistas })),
  }
}

/* ------------------------------ HTTP genérico ------------------------------ */
function cors(req, res, metodos, headers) {
  const origen = req.headers.origin
  if (origen && ORIGENES.has(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', metodos)
    res.setHeader('Access-Control-Allow-Headers', headers)
    res.setHeader('Access-Control-Max-Age', '3600')
  }
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
const err = (res, status, error, detalle, extra = {}) => json(res, status, { error, detalle, timestamp: ahora(), ...extra })

async function leerCuerpo(req) {
  const trozos = []
  for await (const t of req) trozos.push(t)
  const texto = Buffer.concat(trozos).toString('utf8')
  if (!texto) return {}
  if ((req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(texto))
  try {
    return JSON.parse(texto)
  } catch {
    return Symbol.for('ilegible')
  }
}

function servir(nombre, puerto, rutas) {
  if (CAIDOS.has(nombre)) {
    log(nombre, `NO se levanta (MOCK_CAIDOS) · puerto ${puerto} libre`)
    return
  }
  const server = http.createServer(async (req, res) => {
    cors(req, res, 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Authorization, Content-Type, X-Usuario-Id')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }
    const url = new URL(req.url, `http://localhost:${puerto}`)
    if (url.pathname === '/actuator/health') return json(res, 200, { status: 'UP' })
    for (const [metodo, patron, fn] of rutas) {
      if (metodo !== req.method && !(Array.isArray(metodo) && metodo.includes(req.method))) continue
      const m = patron.exec(url.pathname)
      if (!m) continue
      try {
        const cuerpo = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await leerCuerpo(req) : {}
        if (cuerpo === Symbol.for('ilegible')) return err(res, 400, 'Cuerpo de la petición ilegible', 'El cuerpo no es JSON válido')
        log(nombre, req.method, url.pathname + url.search)
        return await fn({ req, res, url, m, cuerpo, usuario: req.headers['x-usuario-id'] })
      } catch (e) {
        console.error(e)
        return err(res, 500, 'Error interno', 'Error inesperado en el mock')
      }
    }
    err(res, 404, 'Recurso no encontrado', `${req.method} ${url.pathname}`)
  })
  server.listen(puerto, () => log(nombre, `escuchando en http://localhost:${puerto}`))
}

/* Igual que UsuarioActual de ms-carrito. */
function exigirUsuario(res, usuario) {
  if (!usuario || !usuario.trim()) {
    err(res, 400, 'Datos inválidos', 'Falta el header X-Usuario-Id')
    return null
  }
  if (!/^[A-Za-z0-9_.@:-]{1,64}$/.test(usuario.trim())) {
    err(res, 400, 'Datos inválidos', 'X-Usuario-Id inválido: 1 a 64 caracteres [A-Za-z0-9_.@:-]')
    return null
  }
  return usuario.trim()
}

/* ============================== ms-productos 8086 ============================== */
servir('productos', 8086, [
  ['GET', /^\/api\/productos$/, ({ res, url }) => {
    const categoria = url.searchParams.get('categoria')
    const q = normalizar(url.searchParams.get('q'))
    const orden = url.searchParams.get('orden') ?? 'relevancia'
    if (!['relevancia', 'precio_asc', 'precio_desc'].includes(orden))
      return err(res, 400, 'Petición inválida', `orden desconocido '${orden}'; valores válidos: relevancia, precio_asc, precio_desc`)
    let l = productos.filter((p) => !categoria || p.categoria === categoria)
    if (q) l = l.filter((p) => normalizar(`${p.nombre} ${p.marca} ${p.descripcion} ${ETIQUETA[p.categoria]} ${p.subcategoria}`).includes(q))
    l = [...l].sort((a, b) =>
      orden === 'precio_asc' ? a.precio - b.precio : orden === 'precio_desc' ? b.precio - a.precio : b.calificacion - a.calificacion || a.id.localeCompare(b.id))
    json(res, 200, l.map(productoDTO))
  }],
  ['GET', /^\/api\/productos\/categorias$/, ({ res }) =>
    json(res, 200, CATEGORIAS.map(([slug, etiqueta]) => ({ slug, etiqueta, cantidad: productos.filter((p) => p.categoria === slug).length })))],
  ['GET', /^\/api\/productos\/admin\/stock$/, ({ res }) => json(res, 200, productos.map((p) => ({ id: p.id, nombre: p.nombre, stock: p.stock, nivel: nivel(p.stock) })))],
  ['PUT', /^\/api\/productos\/([^/]+)\/stock$/, ({ res, m, cuerpo }) => {
    const p = prodPorId.get(decodeURIComponent(m[1]))
    if (!p) return err(res, 404, 'Producto no encontrado', `No existe el producto ${m[1]}`)
    const c = Number(cuerpo.cantidad)
    if (!Number.isInteger(c) || c < 1 || c > 10000) return err(res, 400, 'Petición inválida', 'cantidad: debe estar entre 1 y 10000')
    p.stock += c
    p.actualizadoEn = ahora()
    json(res, 200, productoDTO(p))
  }],
  ['GET', /^\/api\/productos\/([^/]+)$/, ({ res, m, usuario }) => {
    const p = prodPorId.get(decodeURIComponent(m[1]))
    if (!p) return err(res, 404, 'Producto no encontrado', `No existe el producto ${m[1]}`)
    /* Con X-Usuario-Id se "publica" VER_PRODUCTO en interacciones-user. */
    if (usuario) registrarEvento(usuario, 'VER_PRODUCTO', p.id)
    json(res, 200, productoDTO(p))
  }],
])

/* ============================== ms-carrito 8087 ============================== */
function agregarAlCarrito(u, productoId, cantidad) {
  const p = prodPorId.get(productoId)
  if (!p) return { status: 404, error: 'No encontrado', detalle: `No existe el producto ${productoId}` }
  const c = carritoDe(u)
  const item = c.items.find((i) => i.productoId === productoId)
  const final = (item?.cantidad ?? 0) + cantidad
  if (final > p.stock) return { status: 422, error: 'Operación no permitida', detalle: `Sólo quedan ${p.stock} unidades de ${p.nombre}` }
  if (item) item.cantidad = final
  else c.items.push({ productoId, nombre: p.nombre, categoria: p.categoria, marca: p.marca, precioUnitario: p.precio, cantidad: final })
  c.actualizadoEn = iso()
  return { status: 200, nombre: p.nombre }
}

servir('carrito', 8087, [
  ['GET', /^\/api\/carrito$/, ({ res, usuario }) => {
    const u = exigirUsuario(res, usuario)
    if (u) json(res, 200, carritoDTO(u))
  }],
  ['DELETE', /^\/api\/carrito$/, ({ res, usuario }) => {
    const u = exigirUsuario(res, usuario)
    if (!u) return
    carritoDe(u).items = []
    carritoDe(u).cupon = null
    json(res, 200, carritoDTO(u))
  }],
  ['POST', /^\/api\/carrito\/items$/, ({ res, usuario, cuerpo }) => {
    const u = exigirUsuario(res, usuario)
    if (!u) return
    const cantidad = Number(cuerpo.cantidad)
    if (!cuerpo.productoId || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99)
      return err(res, 400, 'Datos inválidos', 'cantidad debe estar entre 1 y 99; productoId es obligatorio')
    const r = agregarAlCarrito(u, cuerpo.productoId, cantidad)
    if (r.status !== 200) return err(res, r.status, r.error, r.detalle)
    registrarEvento(u, 'AGREGAR_CARRITO', cuerpo.productoId)
    notificar(u, 'carrito.producto-agregado', 'Producto agregado al carrito', `Agregaste ${cantidad} × ${r.nombre} a tu carrito`, null, { productoId: cuerpo.productoId, cantidad: String(cantidad) })
    json(res, 200, carritoDTO(u))
  }],
  ['PATCH', /^\/api\/carrito\/items\/([^/]+)$/, ({ res, usuario, cuerpo, m }) => {
    const u = exigirUsuario(res, usuario)
    if (!u) return
    const id = decodeURIComponent(m[1])
    const cantidad = Number(cuerpo.cantidad)
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 99) return err(res, 400, 'Datos inválidos', 'cantidad: entre 0 y 99')
    const c = carritoDe(u)
    const item = c.items.find((i) => i.productoId === id)
    if (!item) return err(res, 404, 'No encontrado', `El producto ${id} no está en el carrito`)
    const p = prodPorId.get(id)
    if (p && cantidad > p.stock) return err(res, 422, 'Operación no permitida', `Sólo quedan ${p.stock} unidades de ${p.nombre}`)
    if (cantidad === 0) c.items = c.items.filter((i) => i.productoId !== id)
    else item.cantidad = cantidad
    c.actualizadoEn = iso()
    json(res, 200, carritoDTO(u))
  }],
  ['POST', /^\/api\/carrito\/cupon$/, ({ res, usuario, cuerpo }) => {
    const u = exigirUsuario(res, usuario)
    if (!u) return
    const codigo = String(cuerpo.codigo ?? '').trim().toUpperCase()
    if (!codigo) return err(res, 400, 'Datos inválidos', 'codigo es obligatorio')
    if (!CUPONES[codigo]) return err(res, 404, 'No encontrado', `El cupón ${codigo} no existe o no está vigente`)
    const c = carritoDe(u)
    const rechazo = motivoRechazoCupon(codigo, totales(c.items, null, c.metodoEnvio).subtotal)
    if (rechazo) return err(res, 422, 'Operación no permitida', rechazo)
    c.cupon = codigo
    registrarEvento(u, 'APLICAR_CUPON', null)
    json(res, 200, carritoDTO(u))
  }],
  ['DELETE', /^\/api\/carrito\/cupon$/, ({ res, usuario }) => {
    const u = exigirUsuario(res, usuario)
    if (!u) return
    carritoDe(u).cupon = null
    json(res, 200, carritoDTO(u))
  }],
  ['GET', /^\/api\/carrito\/sucursales$/, ({ res }) =>
    json(res, 200, SUCURSALES.map((x, k) => ({ codigo: ['SANTIAGO_CENTRO', 'PROVIDENCIA', 'MAIPU'][k], nombre: x.nombre, direccion: x.direccion, etiqueta: x.etiqueta })))],
  ['PUT', /^\/api\/carrito\/envio$/, ({ res, usuario, cuerpo }) => {
    const u = exigirUsuario(res, usuario)
    if (!u) return
    const c = carritoDe(u)
    if (cuerpo.metodo === 'ENVIO') {
      if (!cuerpo.direccion?.trim() || !cuerpo.comuna?.trim()) return err(res, 400, 'Datos inválidos', 'Para ENVIO son obligatorias direccion y comuna')
      if (cuerpo.direccion.length > 200) return err(res, 400, 'Datos inválidos', 'direccion admite hasta 200 caracteres')
      Object.assign(c, { metodoEnvio: 'ENVIO', direccion: cuerpo.direccion.trim(), comuna: cuerpo.comuna.trim(), sucursal: null })
    } else if (cuerpo.metodo === 'RETIRO') {
      const s = SUCURSALES.find((x) => [x.etiqueta, x.nombre].some((v) => normalizar(v) === normalizar(cuerpo.sucursal)))
      if (!s) return err(res, 400, 'Datos inválidos', `Para RETIRO la sucursal debe ser una de: ${SUCURSALES.map((x) => x.etiqueta).join(' | ')}`)
      Object.assign(c, { metodoEnvio: 'RETIRO', sucursal: s.etiqueta })
    } else return err(res, 400, 'Datos inválidos', 'metodo es obligatorio (ENVIO o RETIRO)')
    c.actualizadoEn = iso()
    registrarEvento(u, 'GESTIONAR_ENVIO', null)
    json(res, 200, carritoDTO(u))
  }],
  ['POST', /^\/api\/pedidos$/, ({ res, usuario }) => {
    const u = exigirUsuario(res, usuario)
    if (!u) return
    const c = carritoDe(u)
    if (c.items.length === 0) return err(res, 422, 'Operación no permitida', 'El carrito está vacío')
    const dto = carritoDTO(u)
    if (!dto.envioDefinido) return err(res, 422, 'Operación no permitida', 'Falta definir el método de entrega')
    /* Reserva todo o nada en ms-productos: 409 con faltantes. */
    const faltantes = c.items.filter((i) => (prodPorId.get(i.productoId)?.stock ?? 0) < i.cantidad)
      .map((i) => ({ productoId: i.productoId, disponible: prodPorId.get(i.productoId)?.stock ?? 0 }))
    if (faltantes.length) return err(res, 409, 'Stock insuficiente', 'La reserva se rechazó completa: ningún producto fue descontado', { faltantes })
    for (const i of c.items) prodPorId.get(i.productoId).stock -= i.cantidad
    const t = ahora()
    const p = {
      id: `P-${++secuencia}`, usuarioId: u, estado: 'PENDIENTE_PAGO', metodoEnvio: c.metodoEnvio,
      destino: c.metodoEnvio === 'RETIRO' ? c.sucursal : `${c.direccion}, ${c.comuna}`,
      items: c.items.map(itemDTO), subtotal: dto.subtotal, descuento: dto.descuento, costoEnvio: dto.costoEnvio, total: dto.total,
      cupon: dto.cuponAplicado ? c.cupon : null, codigoAutorizacion: null, creadoEn: iso(t), actualizadoEn: iso(t), pagadoEn: null,
      historial: [{ estado: 'PENDIENTE_PAGO', instante: iso(t) }],
    }
    pedidos.set(p.id, p)
    carritos.set(u, { ...c, items: [], cupon: null })
    notificar(u, 'pedido.creado', `Pedido ${p.id} creado`, `Tu pedido por ${clp(p.total)} está pendiente de pago`, p.id)
    json(res, 200, p)
  }],
  ['GET', /^\/api\/pedidos$/, ({ res, usuario }) => {
    const u = exigirUsuario(res, usuario)
    if (u) json(res, 200, [...pedidos.values()].filter((p) => p.usuarioId === u).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)))
  }],
  ['GET', /^\/api\/pedidos\/([^/]+)$/, ({ res, usuario, m }) => {
    const u = exigirUsuario(res, usuario)
    if (!u) return
    const p = pedidos.get(decodeURIComponent(m[1]))
    if (!p || p.usuarioId !== u) return err(res, 404, 'No encontrado', `No existe el pedido ${m[1]}`)
    json(res, 200, p)
  }],
  ['GET', /^\/api\/admin\/resumen$/, ({ res }) => {
    const PAGADOS = new Set(['PAGADO', 'PREPARANDO', 'ENVIADO', 'EN_CAMINO', 'ENTREGADO', 'LISTO_RETIRO', 'RETIRADO'])
    const EN_CURSO = new Set(['PAGADO', 'PREPARANDO', 'ENVIADO', 'EN_CAMINO', 'LISTO_RETIRO'])
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const dias = Array.from({ length: 14 }, (_, k) => {
      const d = new Date(hoy.getTime() - (13 - k) * 86400000)
      return { clave: d.toDateString(), fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, total: 0 }
    })
    const vendidos = new Map()
    const porCat = new Map()
    let ingresos = 0
    let unidades = 0
    const pagados = [...pedidos.values()].filter((p) => PAGADOS.has(p.estado))
    for (const p of pagados) {
      const d = dias.find((x) => x.clave === new Date(p.pagadoEn ?? p.creadoEn).toDateString())
      if (!d) continue
      d.total += p.total
      ingresos += p.total
      for (const i of p.items) {
        unidades += i.cantidad
        const v = vendidos.get(i.productoId) ?? { productoId: i.productoId, nombre: i.nombre, unidades: 0 }
        v.unidades += i.cantidad
        vendidos.set(i.productoId, v)
        porCat.set(i.categoria, (porCat.get(i.categoria) ?? 0) + i.precioUnitario * i.cantidad)
      }
    }
    json(res, 200, {
      ventasPorDia: dias.map(({ fecha, total }) => ({ fecha, total })),
      masVendidos: [...vendidos.values()].sort((a, b) => b.unidades - a.unidades).slice(0, 10),
      ventasPorCategoria: [...porCat.entries()].map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total),
      pedidosActivos: [...pedidos.values()].filter((p) => EN_CURSO.has(p.estado)).length,
      ingresosTotales: ingresos,
      unidadesVendidas: unidades,
    })
  }],
  ['GET', /^\/api\/admin\/pedidos$/, ({ res, url }) => {
    const estado = url.searchParams.get('estado')
    json(res, 200, [...pedidos.values()].filter((p) => !estado || p.estado === estado).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)))
  }],
])

/* ============================== ms-pago 8083 ============================== */
const VENTANA_MS = 10000
const MAX_INTENTOS = 3
const BLOQUEO_MIN = 30

function antifraude(huella) {
  const t = ahora()
  const b = bloqueos.get(huella)
  if (b && b.hasta > t) return b
  const lista = (intentos.get(huella) ?? []).filter((x) => t - x < VENTANA_MS)
  lista.push(t)
  intentos.set(huella, lista)
  if (lista.length > MAX_INTENTOS) {
    const nuevo = { hasta: t + BLOQUEO_MIN * 60000, intentos: lista.length }
    bloqueos.set(huella, nuevo)
    return nuevo
  }
  return null
}

const paginaWebpay = (token, tx) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Webpay (simulado)</title>
<style>body{font-family:system-ui,sans-serif;background:#f3f4f6;margin:0;display:grid;place-items:center;min-height:100vh;color:#111}
.c{background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 10px 30px rgba(0,0,0,.12);width:min(92vw,420px)}
h1{font-size:20px;margin:0 0 4px;color:#d5006d}p{color:#555;margin:0 0 18px;font-size:14px}dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:14px}
dt{color:#777}dd{margin:0;font-family:ui-monospace,monospace}form{display:inline}button{border:0;border-radius:6px;padding:11px 16px;font-size:14px;font-weight:600;cursor:pointer;margin:14px 8px 0 0}
.ok{background:#d5006d;color:#fff}.no{background:#e5e7eb}.x{background:none;color:#555;text-decoration:underline}</style></head>
<body><div class="c"><h1>Webpay Plus · simulado</h1><p>Formulario del mock (npm run mock). En el entorno real aquí está la página de Transbank.</p>
<dl><dt>Orden</dt><dd>${tx.orden}</dd><dt>Monto</dt><dd>${clp(tx.monto)}</dd><dt>Comercio</dt><dd>Pedidos360</dd></dl>
<form method="post" action="/api/pagos/commit?origen=${tx.origen}&decision=aprobar"><input type="hidden" name="token_ws" value="${token}"><button class="ok">Pagar</button></form>
<form method="post" action="/api/pagos/commit?origen=${tx.origen}&decision=rechazar"><input type="hidden" name="token_ws" value="${token}"><button class="no">Rechazar tarjeta</button></form>
<form method="post" action="/api/pagos/commit?origen=${tx.origen}"><input type="hidden" name="TBK_TOKEN" value="${token}"><input type="hidden" name="TBK_ORDEN_COMPRA" value="${tx.orden}"><input type="hidden" name="TBK_ID_SESION" value="${tx.clientId}"><button class="x">Anular compra y volver</button></form>
</div></body></html>`

servir('pagos', 8083, [
  ['POST', /^\/api\/pagos\/iniciar$/, ({ res, cuerpo }) => {
    const errores = []
    if (!cuerpo.clientId || !String(cuerpo.clientId).trim()) errores.push('clientId no puede estar vacío')
    if (!(Number(cuerpo.amount) > 0)) errores.push('amount debe ser mayor a 0')
    if (!cuerpo.transactionId) errores.push('transactionId no puede estar vacío')
    const pasarela = cuerpo.pasarela ?? 'WEBPAY'
    const origen = cuerpo.origen ?? 'CONSOLA'
    if (!['WEBPAY', 'SIMULADA'].includes(pasarela) || !['TIENDA', 'CONSOLA'].includes(origen))
      return err(res, 400, 'Datos inválidos', 'El cuerpo no es JSON válido o trae un valor no permitido (pasarela: WEBPAY|SIMULADA, origen: TIENDA|CONSOLA)')
    const numero = String(cuerpo.tarjeta?.numero ?? '')
    if (pasarela === 'SIMULADA') {
      if (!numero) errores.push('tarjeta.numero es obligatorio cuando la pasarela es SIMULADA')
      else if (!/^(?:\d[ -]?){12,18}\d$/.test(numero)) errores.push('tarjeta.numero debe tener entre 13 y 19 dígitos')
    }
    if (errores.length) return err(res, 400, 'Datos inválidos', errores.sort().join('; '))

    const digitos = numero.replace(/\D/g, '')
    const huella = createHash('sha256').update(pasarela === 'SIMULADA' ? digitos : `cuenta:${cuerpo.clientId}`).digest('hex')
    const b = antifraude(huella)
    if (b) {
      log('pagos', `429 antifraude huella=${huella.slice(0, 8)}… intentos=${b.intentos}`)
      return json(res, 429, {
        message: `Demasiados intentos detectados. Estás bloqueado temporalmente por ${BLOQUEO_MIN} minutos. Por favor, espera.`,
        bloqueadoHasta: localDateTime(b.hasta), intentos: b.intentos, minutosRestantes: Math.ceil((b.hasta - ahora()) / 60000),
        error: 'Bloqueado por antifraude', timestamp: ahora(),
      })
    }
    const monto = Number(cuerpo.amount)
    if (pasarela === 'WEBPAY') {
      const token = randomBytes(24).toString('hex')
      transacciones.set(token, { orden: cuerpo.transactionId, monto, clientId: cuerpo.clientId, origen })
      return json(res, 200, { url: 'http://localhost:8083/mock-webpay', token })
    }
    const aprobado = !digitos.endsWith('0002')
    const ultimos4 = digitos.slice(-4)
    const codigo = aprobado ? String(Math.floor(Math.random() * 1e6)).padStart(6, '0') : null
    publicarResultado({ idOrden: cuerpo.transactionId, estado: aprobado ? 'AUTORIZADO' : 'RECHAZADO', monto, codigoAutorizacion: codigo })
    json(res, aprobado ? 200 : 402, { estado: aprobado ? 'AUTORIZADO' : 'RECHAZADO', idOrden: cuerpo.transactionId, ultimos4 })
  }],
  ['POST', /^\/mock-webpay$/, ({ res, cuerpo }) => {
    const tx = transacciones.get(cuerpo.token_ws)
    if (!tx) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('token_ws desconocido (¿se envió por POST en el cuerpo?)')
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(paginaWebpay(cuerpo.token_ws, tx))
  }],
  [['POST', 'GET'], /^\/api\/pagos\/commit$/, ({ res, url, cuerpo }) => {
    const p = { ...Object.fromEntries(url.searchParams), ...cuerpo }
    const destino = new URL(`${p.origen === 'CONSOLA' ? 'http://localhost:5173' : FRONT}/callback`)
    const tokenWs = p.token_ws
    if (!tokenWs) {
      const tx = transacciones.get(p.TBK_TOKEN)
      if (tx) publicarResultado({ idOrden: tx.orden, estado: 'ANULADO', monto: tx.monto })
      destino.searchParams.set('estado', 'ANULADO')
      destino.searchParams.set('orden', p.TBK_ORDEN_COMPRA ?? '')
      destino.searchParams.set('cliente', p.TBK_ID_SESION ?? '')
    } else {
      const tx = transacciones.get(tokenWs)
      if (!tx) {
        destino.searchParams.set('estado', 'ERROR')
        destino.searchParams.set('detalle', 'token desconocido')
      } else {
        const ok = p.decision !== 'rechazar'
        const codigo = ok ? String(Math.floor(Math.random() * 1e6)).padStart(6, '0') : ''
        publicarResultado({ idOrden: tx.orden, estado: ok ? 'AUTORIZADO' : 'RECHAZADO', monto: tx.monto, codigoAutorizacion: codigo })
        transacciones.delete(tokenWs)
        for (const [k, v] of Object.entries({
          estado: ok ? 'AUTHORIZED' : 'REJECTED', orden: tx.orden, cliente: tx.clientId, monto: String(tx.monto),
          autorizacion: codigo, fecha: new Date().toISOString().slice(0, 19), tarjeta: '6623',
        })) destino.searchParams.set(k, v)
      }
    }
    res.writeHead(302, { Location: destino.toString() })
    res.end()
  }],
  ['GET', /^\/api\/alertas$/, ({ res }) => {
    const t = ahora()
    const activos = [...bloqueos.entries()].filter(([, b]) => b.hasta > t)
    json(res, 200, {
      bloqueosActivos: activos.length, totalClientesVigilados: intentos.size,
      alertas: activos.map(([h, b]) => ({ idCliente: null, cantidadIntentos: b.intentos, bloqueadoHasta: localDateTime(b.hasta), minutosRestantes: Math.ceil((b.hasta - t) / 60000), actualizadoEn: localDateTime(t), huellaTarjeta: h, ultimos4: null })),
    })
  }],
])

/* ============================== ms-recomendaciones 8084 ============================== */
servir('recomendaciones', 8084, [
  ['GET', /^\/api\/recomendaciones$/, ({ res, url }) => {
    const u = url.searchParams.get('userId')
    if (!u) return err(res, 400, 'Petición inválida', 'userId es obligatorio')
    json(res, 200, recomendar(u))
  }],
  ['GET', /^\/api\/metricas$/, ({ res }) => json(res, 200, metricas())],
])

/* ============================== ms-notificaciones 8088 ============================== */
servir('notificaciones', 8088, [
  ['GET', /^\/api\/notificaciones$/, ({ res, url, usuario }) => {
    const u = url.searchParams.get('usuarioId') ?? usuario
    if (!u) return err(res, 400, 'Petición inválida', 'Falta usuarioId (query) o X-Usuario-Id (header)')
    json(res, 200, (notificaciones.get(u) ?? []).slice(0, 50))
  }],
  ['GET', /^\/api\/notificaciones\/stream$/, ({ req, res, url }) => {
    const u = url.searchParams.get('usuarioId')
    if (!u) return err(res, 400, 'Petición inválida', 'Falta usuarioId')
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write(`event: conectado\ndata: ${JSON.stringify({ usuarioId: u })}\n\n`)
    const set = suscriptores.get(u) ?? new Set()
    set.add(res)
    suscriptores.set(u, set)
    const latido = setInterval(() => res.write(': heartbeat\n\n'), 20000)
    req.on('close', () => {
      clearInterval(latido)
      set.delete(res)
    })
  }],
  ['PATCH', /^\/api\/notificaciones\/([^/]+)\/leida$/, ({ res, m }) => {
    for (const lista of notificaciones.values()) {
      const n = lista.find((x) => x.id === m[1])
      if (n) {
        n.leida = true
        return json(res, 200, n)
      }
    }
    err(res, 404, 'No encontrada', `No existe la notificación ${m[1]}`)
  }],
  ['POST', /^\/api\/notificaciones\/leidas$/, ({ res, url, usuario }) => {
    const u = url.searchParams.get('usuarioId') ?? usuario
    if (!u) return err(res, 400, 'Petición inválida', 'Falta usuarioId')
    let n = 0
    for (const x of notificaciones.get(u) ?? []) if (!x.leida) {
      x.leida = true
      n++
    }
    json(res, 200, { usuarioId: u, actualizadas: n })
  }],
  ['GET', /^\/api\/notificaciones\/fallidas$/, ({ res }) => json(res, 200, [])],
])

log('mock', `front de retorno Webpay: ${FRONT} · logística cada ${AVANCE_MS} ms${CAIDOS.size ? ` · caídos: ${[...CAIDOS].join(', ')}` : ''}`)
