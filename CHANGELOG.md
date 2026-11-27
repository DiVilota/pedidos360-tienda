# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[versionado semántico](https://semver.org/lang/es/). La versión mayor sigue a la evaluación
del ramo: **3.x = Evaluación 3**, igual que el backend.

| pedidos360-tienda | cloud-ev3-kafka (backend) | Estado |
|---|---|---|
| `v3.0.0-rc.1` | `v3.0.0-rc.1` | probada contra el sistema real en Docker (doc 17 del backend) |

## [Sin publicar]

### Añadido

- La tienda también se sirve por la **URL de invocación de la etapa del API Gateway**
  (`https://<api>.execute-api.<region>.amazonaws.com/desarrollo/`, script `20` del backend). Vive
  bajo `/desarrollo/` y no en la raíz, así que `index.html` calcula la base antes de cargar nada
  y escribe `<base href>`; Vite compila con `base: './'`, React Router usa esa base como
  `basename` y las rutas absolutas del código (imágenes, mapa de ruta, vuelta de Microsoft) pasan
  por `conBase()` (`src/lib/base.ts`). En nginx (`:8091`, `:8443`) la base es `/` y nada cambia:
  es la misma imagen.

- Inicio de sesión con **Microsoft Azure Entra ID** (MSAL.js, popup) junto al de Cognito, en
  la pestaña «Ya tengo cuenta». App registrada como SPA en el directorio de Duoc UC
  (`src/lib/msalConfig.ts`); al entrar se traslada el carrito anónimo igual que con Cognito.

  Límite conocido: la sesión de Azure no trae ID token del user pool y el authorizer del API
  Gateway sólo acepta esos, así que con Microsoft se navega, se arma el carrito y se reciben
  recomendaciones, pero pago, pedidos y notificaciones piden una cuenta de Cognito. Federar
  Entra ID como proveedor del user pool es la forma de cerrarlo.
- HTTPS opcional en el contenedor: si se monta un certificado en `/etc/nginx/ssl`
  (`tienda.crt` + `tienda.key`), el entrypoint agrega un server en 443 copiado del de 80. Azure
  exige redirect URIs HTTPS fuera de localhost y MSAL necesita un contexto seguro; en AWS se
  publica como `https://<IP>:8443` con un certificado autofirmado.
- Imágenes de catálogo: un SVG ilustrativo por producto en `public/img/<id>.svg`, con la
  silueta del tipo de producto y el color de acento de su categoría. Reemplazan al placeholder
  de inicial en las tarjetas; `ImagenProducto` no cambió, porque ya mostraba la foto cuando
  `imagenUrl` venía con valor.

  Dos decisiones que conviene no deshacer sin querer:

  - `imagenUrl` llega desde ms-productos como ruta **relativa** (`/img/<id>.svg`). El navegador
    la resuelve contra el origen de la tienda, así que no depende de la IP pública de la EC2,
    que cambia en cada arranque.
  - El lienzo es de 800×600 (4/3, igual que `.ph`) con el dibujo contenido en el cuadrado
    central x∈[100,700]. Así el `object-fit: cover` de `.ph--mini`, que recorta a 1/1, tampoco
    corta el dibujo. Un SVG cuadrado se ve recortado en las tarjetas.

### Corregido

- La tienda en `http://IP:8091` quedaba **en blanco**: en MSAL v5 el constructor de
  `PublicClientApplication` ya exige `crypto.subtle`, que en HTTP no existe, y al crearse al
  importar el módulo lanzaba `crypto_nonexistent` antes de que React montara. Ahora la instancia
  se crea al usarla (`msal()`) y el error sale sólo al pulsar «Ingresar con Microsoft».

## [3.0.0-rc.1] — 2026-11-22

### Cambiado

- La tienda deja de ser la exportación de Claude Design (un `index.html` de 94 KB que cargaba
  React y Babel desde unpkg) y pasa a React 19 + TypeScript + Vite, con el mismo diseño. El
  prototipo queda en `docs/prototipo/` como referencia visual.
- Catálogo, carrito, cupones, envío, pedidos, recomendaciones y notificaciones vienen de los
  microservicios (ms-productos, ms-carrito, ms-pago, ms-recomendaciones, ms-notificaciones).
- Panel de administración con datos reales de `GET /api/admin/resumen` y
  `GET /api/productos/admin/stock`, en vez de cifras inventadas.

### Corregido (los 7 defectos de integración del prototipo, doc 16)

- El pedido, el stock y el evento de compra se registraban al **crear** la transacción de
  Webpay, antes de pagar. Ahora el pedido nace en `PENDIENTE_PAGO` y pasa a `PAGADO` sólo
  cuando llega el resultado por `pagos-resultado`.
- Webpay volvía a la consola y abría otra pestaña: ahora vuelve a `/callback` de la tienda, en
  la misma pestaña.
- `clientId` distinto en cada intento: el antifraude nunca se activaba. Identificador estable
  por usuario.
- Mismos IDs que el backend con productos distintos: se mostraban recomendaciones con nombre y
  precio equivocados.
- "Para ti" pedido una sola vez con un id nuevo (siempre vacío): ahora se refresca tras cada
  interacción y muestra el motivo.
- Categorías fuera del vocabulario del backend y sin eventos de vista.
- `docker run -p 8080` chocaba con Kafka UI: la tienda se publica en 8091 (5174 en desarrollo).

### Agregado

- Servidor mock (`npm run mock`) con los contratos reales, 57 pruebas con Vitest, oxlint.
- Insignia de salud real ("backend conectado" / "modo demo") sobre `/actuator/health`.
- Campana de notificaciones por SSE, pantalla de detalle de producto con productos parecidos,
  pasarela de prueba con tarjeta además de Webpay.
- `docs/trabajo/16-tienda-react-integrada.md` y este CHANGELOG.

## [1.0.0] — 2026-11-19

Prototipo de interfaz exportado de Claude Design: catálogo, carrito, checkout, mis pedidos con
mapa de ruta y panel admin, en modo demo.
