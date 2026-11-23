/* Tipos espejo de los DTO del contrato (backend/PLAN-INTEGRACION-EV3.md).
   Los nombres de campo son los que viajan en el JSON y NO se renombran: un
   desvío acá es un bug silencioso en runtime. Donde el contrato no fija un
   campo, el comentario lo dice y el README lo lista como supuesto. */

/* ---- Actuator (todos los servicios exponen sólo health) ---- */
export type EstadoActuator = {
  status: 'UP' | 'DOWN' | 'OUT_OF_SERVICE' | 'UNKNOWN' | string
  components?: Record<string, { status: string; details?: Record<string, unknown> }>
}

/* ---- ms-productos :8086 (§7) ---- */
export type Producto = {
  id: string
  nombre: string
  marca: string
  /** slug: celulares, laptops, audio, gaming, tv-video, smart-home, accesorios, camaras */
  categoria: string
  /** etiqueta legible que ya resuelve ms-productos ("TV y video") */
  categoriaEtiqueta?: string
  subcategoria: string
  precio: number
  stock: number
  calificacion: number
  /** null mientras no haya fotos: la tienda dibuja un placeholder deliberado */
  imagenUrl: string | null
  descripcion: string
  actualizadoEn?: number
}

export type Categoria = { slug: string; etiqueta: string; cantidad: number }

export type OrdenCatalogo = 'relevancia' | 'precio_asc' | 'precio_desc'

export type NivelStock = 'AGOTADO' | 'BAJO' | 'NORMAL'
export type StockAdmin = { id: string; nombre: string; stock: number; nivel: NivelStock }

/* ---- ms-carrito :8087 (§8) ---- */
export type MetodoEnvio = 'ENVIO' | 'RETIRO'

/* ItemCarritoDTO / ItemPedidoDTO de ms-carrito (mismos campos). */
export type ItemCarrito = {
  productoId: string
  nombre: string
  categoria: string
  marca: string
  precioUnitario: number
  cantidad: number
  subtotal: number
}

/* CarritoDTO de ms-carrito. Todos los montos los calcula el servicio con los
   precios de ms-productos: la tienda sólo los muestra. */
export type Carrito = {
  usuarioId: string
  items: ItemCarrito[]
  cantidadUnidades: number
  cupon: string | null
  /** false = el cupón quedó guardado pero hoy no descuenta (ver avisoCupon) */
  cuponAplicado: boolean
  avisoCupon: string | null
  metodoEnvio: MetodoEnvio | null
  direccion: string | null
  comuna: string | null
  /** etiqueta completa: "Providencia · Av. Providencia 2124" */
  sucursal: string | null
  envioDefinido: boolean
  subtotal: number
  descuento: number
  costoEnvio: number
  total: number
  envioGratisDesde: number
  faltaParaEnvioGratis: number
  actualizadoEn: string | null
}

export type EstadoPedido =
  | 'PENDIENTE_PAGO'
  | 'PAGADO'
  | 'PREPARANDO'
  | 'ENVIADO'
  | 'EN_CAMINO'
  | 'ENTREGADO'
  | 'LISTO_RETIRO'
  | 'RETIRADO'
  | 'PAGO_RECHAZADO'

export type ItemPedido = ItemCarrito

export type HistorialEstado = { estado: EstadoPedido; instante: string }

/* PedidoDTO de ms-carrito. Las fechas son Instant: ISO-8601 con zona (Z). */
export type Pedido = {
  id: string
  usuarioId: string
  estado: EstadoPedido
  metodoEnvio: MetodoEnvio
  destino: string
  items: ItemPedido[]
  subtotal: number
  descuento: number
  costoEnvio: number
  total: number
  cupon: string | null
  codigoAutorizacion: string | null
  creadoEn: string
  actualizadoEn: string
  pagadoEn: string | null
  historial?: HistorialEstado[]
}

export type PeticionEnvio = {
  metodo: MetodoEnvio
  direccion?: string
  comuna?: string
  sucursal?: string
}

/** SucursalDTO: la lista cerrada de retiro que publica ms-carrito. */
export type Sucursal = { codigo: string; nombre: string; direccion: string; etiqueta: string }

/** Cuerpo del 409 de reserva de stock, propagado por ms-carrito. */
export type ErrorStock = { error: string; faltantes?: { productoId: string; disponible: number }[] }

export type ResumenAdmin = {
  ventasPorDia: { fecha: string; total: number }[]
  masVendidos: { productoId: string; nombre: string; unidades: number }[]
  ventasPorCategoria: { categoria: string; total: number }[]
  pedidosActivos: number
  ingresosTotales: number
  unidadesVendidas: number
}

/* ---- ms-pago :8083 (§4) ---- */
export type Pasarela = 'WEBPAY' | 'SIMULADA'

export type PeticionPago = {
  clientId: string
  amount: number
  transactionId: string
  pasarela: Pasarela
  origen: 'TIENDA'
  /** sólo con SIMULADA; el número viaja a ms-pago y no se guarda en ningún lado */
  tarjeta?: { numero: string }
}

/* ms-pago responde un Map distinto según el caso:
   WEBPAY → {url, token} · SIMULADA → {estado, idOrden, ultimos4} (200/402)
   429 → {message, bloqueadoHasta, intentos} · 400/503 → {message|error|detalle} */
export type RespuestaIniciarPago = {
  url?: string
  token?: string
  estado?: string
  idOrden?: string
  ultimos4?: string
  message?: string
  error?: string
  detalle?: string
  bloqueadoHasta?: string
  intentos?: number
  minutosRestantes?: number
}

/* ---- ms-recomendaciones :8084 (§5) ---- */
export type ProductoEnriquecido = {
  rankPosition: number
  score: number
  itemId: string
  nombre: string
  categoria: string
  marca: string
  precio: number
  calificacion: number
  imagenUrl: string | null
  motivo: string
  subcategoria?: string
  stock?: number
}

/* Snapshot de GET /api/metricas: sólo se lee topProductos para "Populares". */
export type Metricas = {
  topProductos?: { productoId: string; nombre: string; categoria?: string; vistas: number }[]
  interaccionesPorMinuto?: number
  usuariosActivos?: number
}

/* ---- ms-notificaciones :8088 (§10) ---- */
export type Notificacion = {
  id: string
  usuarioId: string
  tipo: string
  titulo: string
  mensaje: string
  idPedido: string | null
  datos?: Record<string, unknown> | null
  leida: boolean
  creadaEn: string
}
