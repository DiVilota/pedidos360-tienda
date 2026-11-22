# Pedidos360 · Tienda

Frontend de la tienda de electrónica Pedidos360 (DSY1107): catálogo con filtros y
búsqueda, detalle de producto, «Para ti» con el motivo de cada recomendación,
carrito con cupones y lista de deseos, checkout con envío o retiro, pago con
Webpay o con la pasarela de prueba, «Mis pedidos» con etapas reales y mapa de la
ruta del paquete, campana de notificaciones en vivo y panel de administración
con ventas y stock reales.

Proyecto universitario — parte del sistema Pedidos360 junto a la consola de
operaciones (`frontend/`) y los microservicios de `backend/`.

React 19 + TypeScript + Vite. El diseño es el de la exportación de Claude Design
(guardada como referencia visual en `docs/prototipo/`); lo que cambió es que
**cada dato viene de un microservicio** en vez de estar escrito en la página.

## Servicios que usa

| Servicio | Puerto | Qué le pide la tienda |
|---|---|---|
| ms-productos | 8086 | catálogo (`?categoria=&q=&orden=`), categorías, detalle (con `X-Usuario-Id` publica `VER_PRODUCTO`), stock admin, reponer |
| ms-carrito | 8087 | carrito, cupones, envío, sucursales, pedidos, resumen y pedidos admin |
| ms-pago | 8083 | `POST /api/pagos/iniciar` con `origen: TIENDA` (Webpay o pasarela simulada) |
| ms-recomendaciones | 8084 | `GET /api/recomendaciones?userId=` (con `motivo`) y `GET /api/metricas` (populares) |
| ms-notificaciones | 8088 | listado y stream SSE `GET /api/notificaciones/stream?usuarioId=` |

La insignia del header resume el `/actuator/health` de los cinco cada 20 s
(«backend conectado», «backend parcial · 4/5», «modo demo · sin backend») y el
detalle por servicio está a un clic.

## Decisiones que no hay que deshacer

- **Un solo usuarioId estable.** Logueado es el email; anónimo es `anon-<uuid>`
  guardado una vez en `localStorage`. Viaja como `X-Usuario-Id` (ms-carrito y
  ms-productos), como `clientId` (ms-pago) y como `userId` (recomendaciones). El
  prototipo generaba un id por intento: el antifraude «más de 3 en 10 s» nunca
  disparaba y las recomendaciones siempre volvían vacías. Al iniciar sesión, el
  carrito anónimo se traslada a la cuenta.
- **El pedido se crea antes de pagar, pero no se da por pagado.** Orden real:
  `PUT /api/carrito/envio` → `POST /api/pedidos` (reserva stock, `PENDIENTE_PAGO`)
  → `POST /api/pagos/iniciar` con `transactionId` = id del pedido. Pasa a `PAGADO`
  recién cuando ms-carrito consume `pagos-resultado`; `/callback` consulta el
  pedido hasta verlo cambiar. Si el pago no se resuelve (429, 503, red), el
  reintento usa **el mismo pedido** (`/checkout?pedido=P-12`) para no reservar
  stock dos veces. Está probado en `src/lib/flujoPago.test.ts`.
- **Webpay en la misma pestaña, por POST.** Transbank exige `token_ws` en el cuerpo
  de un POST; se arma un `<form>` oculto (`src/lib/webpay.ts`). La vuelta llega por
  redirect de ms-pago a `FRONT_URL_TIENDA/callback`.
- **Puerto 5174 con `strictPort`.** Es un origen de `CORS_ORIGENES` en todos los
  servicios y es `FRONT_URL_TIENDA` de ms-pago. Si Vite se corriera a 5175, todo
  fallaría por CORS con los servicios sanos. En Docker la tienda va en 8091.
- **Recomendaciones que se refrescan.** Se vuelven a pedir ~0,9 s después de ver un
  producto, agregar al carrito, aplicar un cupón, guardar la entrega, volver de un
  pago o recibir una notificación (la espera cubre el viaje por Kafka).
- **Login provisorio aislado.** Las cuentas de prueba viven sólo en
  `src/lib/auth.ts`, marcado como provisorio hasta Cognito (fase 4). El resto de la
  tienda sólo consume `usuarioIdActual()` y `sesionActual()`.
- **Imágenes: placeholder deliberado.** `imagenUrl` llega en `null`; se dibuja el
  patrón de la marca con el ícono de la categoría. Si algún día llega una URL que
  falla, se vuelve al mismo placeholder.
- **Sin proxy en nginx.** El navegador llama a los servicios (o a API Gateway)
  directamente; el CORS lo declaran los servicios.

## Qué cambió respecto del prototipo

- Se quitó el «modo demo» que funcionaba sin backend (catálogo, pagos y etapas
  simulados en el navegador): mostraba datos que no existían en ningún servicio.
  Para trabajar sin backend está `npm run mock`; sin servicios, la tienda lo dice
  (insignia y avisos por sección) en vez de inventar.
- El panel «Tu perfil» ya no mide el tiempo con el cursor encima: ese «dwell»
  nunca llegaba al backend. Ahora refleja ver, agregar y comprar, con los mismos
  pesos que el motor.
- Populares sale de `GET /api/metricas` (vistas de los últimos 15 min de toda la
  tienda), no de los clics de una pestaña.

## Estructura

```
src/
  config.ts                 URL base desde window.PEDIDOS360_CONFIG (config.js)
  main.tsx · App.tsx        router (/, /producto/:id, /ingresar, /checkout,
                            /callback, /pedidos, /admin)
  lib/                      lógica sin React, con pruebas
    api.ts                  cliente HTTP único (X-Usuario-Id, timeouts, errores)
    types.ts                espejo de los DTO del backend
    auth.ts                 identidad PROVISORIA (cuentas demo)
    flujoPago.ts            orden entrega → pedido → pago
    checkout.ts             validaciones, Luhn, interpretación de la respuesta de pago
    callback.ts · webpay.ts resultado del pago y salto a Transbank
    pedidos.ts · admin.ts   etapas, agrupación, derivados del panel
    catalogo.ts · format.ts · senales.ts · deseos.ts · backoff.ts
  hooks/                    useSalud (actuator), useNotificaciones (SSE + backoff)
  state/                    TiendaProvider: sesión, carrito, catálogo, avisos
  components/               Header, paneles, tarjetas, ParaTi, ModalRuta, ui
  pages/                    Inicio, Producto, Ingresar, Checkout, Callback,
                            MisPedidos, Admin
  styles/tienda.css         hoja única con la paleta del prototipo
public/                     config.js (dev), logo, ruta-paquete.html (mapa)
mocks/servidor-mock.mjs     los cinco servicios en memoria (npm run mock)
docs/prototipo/             exportación original de Claude Design (referencia)
```

## Desarrollo

Necesita servirse por HTTP desde el puerto 5174 (no abrir el archivo: `file://`
rompe el CORS).

```bash
npm install
npm run mock      # los cinco servicios simulados en 8083/8084/8086/8087/8088
npm run dev       # http://localhost:5174
npm test          # Vitest
npm run lint      # oxlint
npm run build     # tsc + vite build → dist/
```

El mock responde los mismos DTO que el backend, guarda el estado en memoria y
reproduce las reglas que la UI tiene que mostrar: 429 al 4.º intento en 10 s con
la misma tarjeta, rechazo de la pasarela simulada con tarjetas que terminan en
`0002`, resultado del pago que llega ~1 s después (como por Kafka), logística que
avanza sola, SSE y un formulario de Webpay simulado. Variables:
`MOCK_AVANCE_MS` (cada cuánto avanza un pedido, 15000 por defecto),
`MOCK_CAIDOS=recomendaciones,pagos` (no levanta esos servicios, para ver la
insignia parcial) y `MOCK_FRONT` (adonde vuelve Webpay).

Tarjetas de la pasarela de prueba: `4051 8856 0044 6623` (aprobada) y
`4000 0000 0000 0002` (rechazada). Cupones: `BIENVENIDA10`, `ENVIOGRATIS`,
`GAMER5000` (mínimo $50.000).

## Correr con Docker

```bash
docker build -t pedidos360-tienda .
docker run --rm -p 8091:80 \
  -e API_PRODUCTOS=http://localhost:8086 \
  -e API_CARRITO=http://localhost:8087 \
  -e API_PAGOS=http://localhost:8083 \
  -e API_RECOMENDACIONES=http://localhost:8084 \
  -e API_NOTIFICACIONES=http://localhost:8088 \
  pedidos360-tienda
# abrir http://localhost:8091   ·   salud: http://localhost:8091/salud
```

La imagen compila con Node y sirve `dist/` con nginx (fallback de SPA para que
`/callback` y las demás rutas no den 404, `config.js` e `index.html` sin caché,
assets con hash inmutables). `docker-entrypoint.sh` genera `config.js` en cada
arranque, así la misma imagen sirve en local y en AWS.

| Variable | Por defecto |
|---|---|
| `API_PRODUCTOS` | `http://localhost:8086` |
| `API_CARRITO` | `http://localhost:8087` |
| `API_PAGOS` | `http://localhost:8083` |
| `API_RECOMENDACIONES` | `http://localhost:8084` |
| `API_NOTIFICACIONES` | `http://localhost:8088` |

En AWS, con API Gateway delante, apuntar las variables a la URL del stage
(p. ej. `https://abc123.execute-api.us-east-1.amazonaws.com/desarrollo`). Si la
tienda se publica en otro origen, ese origen tiene que estar en `CORS_ORIGENES`
de los servicios y en `FRONT_URL_TIENDA` de ms-pago.

## Cuentas de prueba

| Rol | Correo | Clave |
|---|---|---|
| Cliente | `ana@correo.cl` | `1234` |
| Admin | `admin@pedidos360.cl` | `admin123` |

Son de demostración y viven en el frontend: no protegen nada porque el backend no
valida identidad hasta la fase 4 (Cognito + JWT).

## Lo que se guarda en el navegador

Sólo lo que el contrato no tiene dónde guardar: la sesión demo, el id anónimo, la
lista de deseos (IDs de producto; precio y stock se leen siempre del catálogo) y
el resumen local de «Tu perfil» (espejo de los eventos que esta pestaña provocó;
las recomendaciones las calcula ms-recomendaciones). Prefijo `p360.`.

El mapa de ruta usa el servidor público de demostración de OSRM para trazar la
ruta por calles reales; si no responde, dibuja un trazado aproximado. Ese
servidor es para pruebas: en producción conviene uno propio o un proveedor con
clave.

## Pendiente

- Cognito (fase 4): reemplazar `src/lib/auth.ts` por Authorization Code + PKCE.
- Fotos de productos (hoy `imagenUrl` es `null` en el catálogo semilla).
- Lista de deseos en el servidor (no hay endpoint en el contrato).
