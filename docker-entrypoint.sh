#!/bin/sh
# Genera config.js en el arranque a partir de variables de entorno, para que la
# misma imagen sirva en desarrollo (puertos locales) y en AWS (API Gateway).
#
#   API_PAGOS            http://localhost:8083
#   API_RECOMENDACIONES  http://localhost:8084
#   API_ADMIN            http://localhost:8085
#   WS_URL               (vacio)

set -e

DESTINO=/usr/share/nginx/html/config.js

cat > "$DESTINO" <<EOF
/* ARCHIVO GENERADO EN EL ARRANQUE — no editar a mano, se sobrescribe.
   Generado: $(date -u '+%Y-%m-%d %H:%M:%S UTC') */
window.PEDIDOS360_CONFIG = {
  pagos:           "${API_PAGOS:-http://localhost:8083}",
  recomendaciones: "${API_RECOMENDACIONES:-http://localhost:8084}",
  admin:           "${API_ADMIN:-http://localhost:8085}",
  ws:              "${WS_URL:-}"
};
EOF

echo "[entrypoint] config.js generado:"
sed 's/^/[entrypoint]   /' "$DESTINO"

exec nginx -g 'daemon off;'
