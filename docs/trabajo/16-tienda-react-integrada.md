# 16 · La tienda pasa de prototipo de Claude Design a React + TS sobre los microservicios reales

Commit `472fc23` (rama `react`).
La mitad backend está en los documentos 13 (ms-productos), 14 (ms-carrito),
10 (ms-pago, origen `TIENDA` y `FRONT_URL_TIENDA`), 11 (ms-recomendaciones con
`motivo`) y 15 (ms-notificaciones) del repositorio `cloud-ev3-kafka`; el 17 de
ese repo corrige el CORS de Actuator del que depende la insignia de salud.

## Problema

La tienda era una exportación de Claude Design: un `index.html` de 94 KB más un
`support.js` de 69 KB con runtime propio que cargaba React 18 y Babel standalone
desde unpkg y compilaba en el navegador. Se conserva tal cual en
`docs/prototipo/` como especificación visual.

El diseño estaba bien; la integración no. El prototipo se hizo **sin ver el
backend** y por eso fallaba en silencio: con el backend caído entraba a un
«modo demo» con datos propios, y con el backend arriba mostraba datos que
parecían plausibles aunque fueran de otro producto. Nada tiraba un error.

Los siete defectos se encontraron leyendo cada `fetch` del prototipo y su
contraparte en el controlador del backend (checklist «Auditing a UI built
without the backend» del skill `frontend-rewrite`):

1. El pedido, el descuento de stock y el evento `purchase` se registraban al
   **crear** la transacción Webpay (`this.complete(items, total)` justo antes de
   abrir el formulario), aunque el cliente después anulara.
2. ms-pago redirigía tras el commit a `FRONT_URL` (`:8090`, la consola); la
   tienda no tenía `/callback`. Además abría Webpay con `target = '_blank'`.
3. `clientId = this.sid + '_' + Date.now()`: un id distinto por intento, así que
   la regla antifraude «más de 3 en 10 s» de ms-pago nunca podía dispararse.
4. Mismos IDs que el backend (`item_101`…) pero otros productos: el catálogo
   local tenía audífonos donde ms-recomendaciones tiene un Galaxy S24, y las
   recomendaciones se pintaban con nombre y precio del catálogo local.
5. `GET /api/recomendaciones?userId=` se pedía una sola vez al montar y con un
   id recién inventado, así que siempre volvía vacío; «Para ti» se calculaba en
   el navegador con puntajes `scores` sembrados.
6. `POST /api/interacciones` enviaba `category`/`productType` fuera del
   vocabulario del backend (`item.cat.toLowerCase()`, la marca como tipo) y la
   acción `view` nunca se enviaba.
7. El README decía `docker run -p 8080:80`: 8080 es Kafka UI en el compose, y
   8080 no está en `CORS_ORIGENES`.

Además, el panel admin dibujaba ventas con constantes `SEED`/`DAILY`, y
`config.js` declaraba `admin` y `ws`, que la tienda leía y no usaba.

## Qué se hizo

Port a Vite + React 19 + TypeScript con la misma estructura que la consola
(documento 01): `config.js` generado al arrancar, un cliente HTTP único, una
pantalla por archivo, lógica sin React en `src/lib/` con pruebas al lado.

```
Checkout ──PUT /api/carrito/envio──▶ ms-carrito   (total con envío calculado ahí)
         ──POST /api/pedidos───────▶ ms-carrito   (reserva stock, PENDIENTE_PAGO)
         ──POST /api/pagos/iniciar─▶ ms-pago      (origen TIENDA, transactionId = id del pedido,
                                                   clientId = usuarioId estable)
         ── <form POST token_ws, _self> ─▶ Webpay ─▶ ms-pago /commit
                                                   ─▶ FRONT_URL_TIENDA/callback?estado=…&orden=…
/callback ──GET /api/pedidos/{orden} ×8 cada 1,5 s──▶ ms-carrito (PAGADO / PAGO_RECHAZADO,
                                                   decidido al consumir pagos-resultado)
```

### Defecto → solución

| # | Defecto del prototipo | Cómo quedó resuelto | Dónde |
|---|---|---|---|
| 1 | Pedido, stock y `purchase` al crear la transacción | El pedido se crea en ms-carrito (`PENDIENTE_PAGO`) y pasa a `PAGADO` sólo cuando ms-carrito consume `pagos-resultado`; ahí mismo publica un `COMPRA` por ítem. La tienda no registra compras | `src/lib/flujoPago.ts` (`ejecutarPago`), `src/pages/Callback.tsx`; backend `ServicioPedidos.marcarPagado` |
| 2 | Volvía a la consola, sin `/callback`, Webpay en otra pestaña | `origen: 'TIENDA'` en la petición → ms-pago redirige a `FRONT_URL_TIENDA/callback`; ruta `/callback` fija; `<form>` POST con `target = '_self'` | `src/lib/checkout.ts` (`peticionPago`), `src/App.tsx`, `src/lib/webpay.ts`, `src/lib/callback.ts` |
| 3 | `clientId` distinto por intento | `usuarioIdActual()`: email si hay sesión, `anon-<uuid>` persistente si no. Es el mismo valor en `X-Usuario-Id`, `clientId` y `userId` | `src/lib/auth.ts`, `src/lib/checkout.ts` |
| 4 | Mismos IDs, otros productos | No hay catálogo local: todo sale de `GET /api/productos`; la tarjeta de recomendación usa `rec.nombre`/`rec.precio` del `ProductoEnriquecido` | `src/state/TiendaProvider.tsx` (`recargarCatalogo`), `src/components/TarjetaProducto.tsx` (`TarjetaRecomendacion`) |
| 5 | Recomendaciones una vez, con id nuevo, «Para ti» local | Se piden con el id estable y se vuelven a pedir cada vez que sube `recTick` (900 ms después de ver, agregar, cupón, entrega, pago o notificación); se muestra el `motivo` del motor | `src/components/ParaTi.tsx`, `src/state/TiendaProvider.tsx` (`ESPERA_RECALCULO_MS`) |
| 6 | Vocabulario inventado, sin `view` | La tienda ya no publica interacciones: abrir el detalle con `X-Usuario-Id` hace que ms-productos publique `VER_PRODUCTO`; ms-carrito publica `AGREGAR_CARRITO` y `COMPRA` con la categoría del catálogo | `src/lib/api.ts` (`productos.detalle`), `src/pages/Producto.tsx` |
| 7 | Puerto 8080 | 8091 en Docker (en `CORS_ORIGENES` y `FRONT_URL_TIENDA`), 5174 en desarrollo con `strictPort` | `README.md`, `vite.config.ts`, `Dockerfile`; compose del backend (`tienda: 8091:80`) |

Panel admin: `src/pages/Admin.tsx` lee `GET /api/admin/resumen`,
`GET /api/admin/pedidos` (ms-carrito) y `GET /api/productos/admin/stock`;
`src/lib/admin.ts` sólo calcula proporciones sobre esos datos. `src/config.ts`
y `docker-entrypoint.sh` declaran sólo las cinco URL que se usan
(`API_PRODUCTOS`, `API_CARRITO`, `API_PAGOS`, `API_RECOMENDACIONES`,
`API_NOTIFICACIONES`); `admin` y `ws` desaparecieron.

## Decisiones y su porqué

| Decisión | Por qué |
|---|---|
| Portar a React + TS en vez de parchear el HTML exportado | los siete defectos se corregían igual en cualquier stack; lo que obligaba a cambiar era el runtime de unpkg + Babel en el navegador, un archivo generado que una reexportación pisaría, y la ausencia de pruebas para el orden del pago |
| El prototipo queda en `docs/prototipo/`, sin borrar | es la especificación visual que se reproduce; la paleta y las pantallas son las mismas |
| Pedido **antes** del pago, pero nunca «pagado» desde la tienda | ms-pago necesita un `transactionId` que ms-carrito reconozca al consumir `pagos-resultado`; el estado lo decide quien recibe el resultado, no quien lanza el cobro |
| Reintento con el mismo pedido (`/checkout?pedido=P-12`) | crear el pedido reserva stock; un 429, 503 o fallo de red después de crearlo dejaría una segunda reserva si se volviera a crear |
| `/callback` sondea el pedido y lo muestra aparte del resultado de la URL | la URL dice lo que informó la pasarela; el pedido cambia de estado asíncronamente vía Kafka, y pueden no coincidir por unos segundos |
| `usuarioId` en `src/lib/auth.ts` y en ningún otro lado | el login es provisorio hasta Cognito (fase 4, §12 del contrato); al reemplazar ese archivo el resto sólo consume `usuarioIdActual()` y `sesionActual()` |
| Al iniciar sesión el carrito anónimo se traslada a la cuenta | ms-carrito indexa por `X-Usuario-Id`; sin traslado, lo agregado antes del login desaparece |
| Sin «modo demo»; `npm run mock` para trabajar sin backend | el modo demo mostraba productos, pagos y etapas que no existían en ningún servicio; ahora la insignia y cada sección dicen qué servicio falta |
| Se quitó el «dwell» (tiempo con el cursor encima) del perfil | no existe ese evento en el backend; «Tu perfil» refleja ver/carrito/compra con los pesos del motor (1/3/5) |
| Ref `yaVisto` en `Producto.tsx` | StrictMode monta dos veces en desarrollo y cada `GET` del detalle publica un `VER_PRODUCTO` |
| Sin `proxy_pass` en nginx | observación del docente en la EV2; el CORS lo declaran los servicios |

## Verificación

| Qué | Resultado |
|---|---|
| `npm test` (22-nov, en este informe) | `Test Files 11 passed (11)` · `Tests 57 passed (57)` |
| `npm run build` | `tsc -b && vite build` limpio: 57 módulos, `index-*.js` 358,00 kB (gzip 109,72 kB), `index-*.css` 27,75 kB |
| `npm run lint` (oxlint) | 0 errores, 12 warnings, todas `react(set-state-in-effect)`: `useSalud.ts:37`, `useNotificaciones.ts:50`, `TiendaProvider.tsx:73/88/102/188`, `Producto.tsx:33`, `MisPedidos.tsx:139/161`, `Admin.tsx:57`, `Inicio.tsx:142`, `Checkout.tsx:148` |
| `src/lib/flujoPago.test.ts` | orden entrega → pedido → pago con `fetch` falso; 409 no llama a ms-pago; reintento con pedido pendiente no crea otro; sin red en ms-pago devuelve el pedido |
| `src/lib/webpay.test.ts`, `auth.test.ts` | POST con `token_ws` en el cuerpo y `_self`; el id anónimo se crea una vez y sobrevive a la recarga |
| Sistema real en Docker, tienda servida por nginx en `:8091` (22-nov) | insignia «backend conectado» (después del CORS de Actuator, doc 17 del backend) · login con el botón de cuenta de prueba · `/producto/item_113` con «También te puede interesar» y motivos · agregar al carrito y la campana recibe la notificación · checkout con `GAMER5000`, −$5.000 calculado por ms-carrito · Webpay de integración real en la misma pestaña · anulación → `/callback?estado=ANULADO&orden=P-8` con «Pago anulado» y el pedido en «Pago rechazado» · `/pedidos` con el historial · `/admin` con ingresos 14 días, más vendidos y rotación desde los endpoints reales |
| Capturas | `pedidos360/_capturas/docker-tienda-{inicio,detalle,checkout,pago,callback-anulado,mis-pedidos,admin}.png` |

### No verificado

- **Pago Webpay AUTORIZADO** de punta a punta: sólo se recorrió la anulación.
  El camino `PAGADO` (y el `COMPRA` que dispara) está probado en el backend, no
  observado desde la tienda.
- **Login con Cognito**: no está implementado. Las cuentas demo viven en
  `src/lib/auth.ts` y no protegen nada; el backend no valida identidad.
- **La tienda en AWS** (API Gateway delante, otro origen): no se desplegó.
- La suite no se rompió a propósito para ver cuántas pruebas se ponen rojas.

## Pendiente

- **Los KPI del panel admin no cuadran.** En `/admin`, «Ingresos 14 días»
  mostró $1.889.937 y «Ventas por categoría» suma $2.099.930. Las dos cifras
  salen de `ServicioResumenAdmin.calcular` (ms-carrito): `ingresosTotales` suma
  `pedido.getTotal()` (lo pagado, con descuento y envío) y `ventasPorCategoria`
  suma `precioUnitario × cantidad` (precio de lista). Además ninguna de las dos
  ni `masVendidos` se filtra a 14 días (sólo `ventasPorDia` tiene ventana), así
  que la etiqueta «Ingresos {DIAS_VENTANA} días» de `src/pages/Admin.tsx` y la
  cobertura de `rotacion()` en `src/lib/admin.ts`, que divide por 14, son
  inexactas en cuanto haya pedidos más antiguos. Se corrige en el backend
  (ventana y misma base para ambas cifras) o se cambian las etiquetas.
- Las 12 warnings de lint (`set-state-in-effect`): son reinicios de estado al
  cambiar de ruta o de usuario; conviene revisar cada una antes de silenciarlas.
- Cognito (fase 4): reemplazar `src/lib/auth.ts` por Authorization Code + PKCE.
- Fotos de producto (`imagenUrl` llega `null`) y lista de deseos en el servidor
  (no hay endpoint).

## Trampas para quien siga

- No muevas la tienda de 5174 (dev) ni de 8091 (Docker): ambos están en
  `CORS_ORIGENES` de los cinco servicios y 8091 es `FRONT_URL_TIENDA` de ms-pago.
  Un puerto distinto falla por CORS con los servicios sanos.
- No renombres `/callback`: ms-pago redirige ahí y nada falla al compilar.
- La insignia de salud depende de que `/actuator/health` responda CORS; eso lo
  arregló el backend (doc 17). Si vuelve a decir «modo demo» con todo arriba,
  mira primero la consola del navegador.
- En el compose del backend, `TIENDA_DIR` vale por defecto
  `../pedidos360-tienda`; con este repo clonado como `tienda/` hay que poner
  `TIENDA_DIR=../tienda` en el `.env`.
- Un 402 (rechazo simulado) y un 429 (antifraude) de ms-pago **no** son
  excepciones en `api.ts`: se devuelven como dato y la pantalla los presenta.
- Después de un evento, ms-recomendaciones tarda en recalcular (viaje por
  Kafka): por eso la espera de 900 ms antes de volver a pedir. Pedir antes
  devuelve la lista vieja y parece un bug.
