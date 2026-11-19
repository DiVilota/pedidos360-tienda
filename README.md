# Pedidos360 · Tienda

Frontend de la tienda de electrónica Pedidos360: catálogo con filtros y búsqueda,
recomendaciones «Para ti», carrito y lista de deseos, checkout con envío o retiro,
pago con Webpay, cuenta de cliente con seguimiento de pedidos y mapa de ruta del
paquete, y panel de administración (stock, rotación, más vendidos).

Proyecto universitario — parte del sistema Pedidos360 junto a `cloud-ev3-front`
(consola de operaciones) y los microservicios de pagos, recomendaciones y admin.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La tienda completa (una sola página). |
| `support.js` | Runtime de la página. Carga React desde unpkg al abrir. |
| `ruta-paquete.html` | Mapa de la ruta del paquete (Leaflet + OpenStreetMap). Se abre en un modal desde «Mis pedidos». |
| `config.js` | URL de los servicios para desarrollo. En Docker se regenera en el arranque. |
| `logo-pedidos360.svg` | Símbolo de la marca; también es el favicon. |
| `Dockerfile`, `nginx.conf`, `docker-entrypoint.sh` | Imagen nginx de servido estático. |

## Correr en local

Necesita servirse por HTTP (no abrir con doble clic: `file://` rompe el CORS).

```bash
python3 -m http.server 5173
# abrir http://localhost:5173
```

## Correr con Docker

```bash
docker build -t pedidos360-tienda .
docker run --rm -p 8080:80 \
  -e API_PAGOS=http://localhost:8083 \
  -e API_RECOMENDACIONES=http://localhost:8084 \
  pedidos360-tienda
# abrir http://localhost:8080   ·   salud: http://localhost:8080/salud
```

| Variable | Por defecto |
|---|---|
| `API_PAGOS` | `http://localhost:8083` |
| `API_RECOMENDACIONES` | `http://localhost:8084` |
| `API_ADMIN` | `http://localhost:8085` |
| `WS_URL` | vacío |

En AWS, con API Gateway delante, apuntar las variables a la URL del stage
(p. ej. `https://abc123.execute-api.us-east-1.amazonaws.com/desarrollo`).

## Cuentas de prueba

| Rol | Correo | Clave |
|---|---|---|
| Cliente | `ana@correo.cl` | `1234` |
| Admin | `admin@pedidos360.cl` | `admin123` |

## Modo demo

Si los servicios no responden, la tienda funciona sola: el pago se simula, los
pedidos y la lista de deseos se guardan en `localStorage` (prefijo `p360.`) y
el estado de envío avanza cada 12 s. La insignia del header indica
«modo demo» o «backend conectado».

El mapa de ruta usa el servidor público de demostración de OSRM para trazar la
ruta por calles reales; si no responde, dibuja un trazado aproximado. Ese servidor
es para pruebas — en producción conviene uno propio o un proveedor con clave.

## Pendiente

- Base de datos (Neon / Supabase) para productos, usuarios y pedidos.
- Webpay real (Transbank) en el servicio de pagos.
- Afinidad de «Para ti» desde eventos de Kafka con historial real.
- Fotos de productos (hoy son placeholders).
- Autenticación real (hoy las cuentas están en el frontend).
