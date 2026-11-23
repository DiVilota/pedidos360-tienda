# Bitácora de trabajo — Pedidos360 · Tienda

Un documento por tarea, para que quien siga no tenga que reconstruir el *por qué*
leyendo diffs.

La numeración es **compartida** con los otros dos repositorios del sistema:
`cloud-ev3-kafka` (backend) y `cloud-ev3-front` (consola). Un número existe en
un solo repo, y las dos mitades de una tarea (un endpoint y la pantalla que lo
usa) se citan entre sí.

## En este repositorio (`pedidos360-tienda`, rama `react`)

| # | Tarea | Documento | Commit |
|---|---|---|---|
| 16 | La tienda pasa de prototipo de Claude Design a React + TS sobre los microservicios reales | [16-tienda-react-integrada.md](16-tienda-react-integrada.md) | `472fc23` |

## La mitad backend (`cloud-ev3-kafka`, `docs/trabajo/`)

Los documentos 09 a 17 del backend cubren los servicios que esta tienda
consume. Los que el 16 cita directamente:

| # | Tema |
|---|---|
| 10 | ms-pago: origen `TIENDA` y vuelta a `FRONT_URL_TIENDA/callback` |
| 11 | ms-recomendaciones: recomendaciones con `motivo` |
| 13 | ms-productos: catálogo, categorías, detalle que publica `VER_PRODUCTO`, stock admin |
| 14 | ms-carrito: carrito, cupones, envío, pedidos y resumen admin |
| 15 | ms-notificaciones: listado y stream SSE |
| 17 | CORS de Actuator (sin él la insignia de salud dice «modo demo») |

El índice completo, con los números de la consola (01, 03, 04, 06, 08), está
en `docs/trabajo/README.md` del backend.
