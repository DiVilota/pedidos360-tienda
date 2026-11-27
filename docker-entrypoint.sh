#!/bin/sh
# Genera config.js en el arranque a partir de variables de entorno.
#
# Por qué así y no con las URL dentro del bundle: la misma imagen tiene que
# servir en desarrollo (puertos locales) y en AWS (rutas de API Gateway). Si
# las URL se compilaran dentro del JS habría que reconstruir la imagen para
# cada entorno y dejaría de ser el mismo artefacto verificado.
#
# Variables que acepta, con el valor por defecto de desarrollo:
#   API_PRODUCTOS        http://localhost:8086
#   API_CARRITO          http://localhost:8087
#   API_PAGOS            http://localhost:8083
#   API_RECOMENDACIONES  http://localhost:8084
#   API_NOTIFICACIONES   http://localhost:8088
#
# Identidad (Cognito User Pools), sin valor por defecto:
#   COGNITO_REGION       us-east-1
#   COGNITO_CLIENT_ID    id del app client de la tienda (sin secreto)
#   COGNITO_POOL_ID      sólo informativo, para saber contra qué pool se mira
# Sin COGNITO_CLIENT_ID la tienda arranca y el catálogo se navega igual; lo que
# no se puede es iniciar sesión, y la pantalla de ingreso lo dice. El pool del
# Learner Lab se recrea cuando caduca el lab, y por eso esto es configuración
# de arranque y no algo compilado dentro del bundle.
#
# En AWS, con API Gateway delante, todas pueden apuntar a la misma base y se
# diferencian por la ruta del recurso, por ejemplo:
#   API_PAGOS=https://abc123.execute-api.us-east-1.amazonaws.com/desarrollo

set -e

DESTINO=/usr/share/nginx/html/config.js

cat > "$DESTINO" <<EOF
/* ARCHIVO GENERADO EN EL ARRANQUE — no editar a mano, se sobrescribe.
   Generado: $(date -u '+%Y-%m-%d %H:%M:%S UTC') */
window.PEDIDOS360_CONFIG = {
  productos:       "${API_PRODUCTOS:-http://localhost:8086}",
  carrito:         "${API_CARRITO:-http://localhost:8087}",
  pagos:           "${API_PAGOS:-http://localhost:8083}",
  recomendaciones: "${API_RECOMENDACIONES:-http://localhost:8084}",
  notificaciones:  "${API_NOTIFICACIONES:-http://localhost:8088}",
  cognitoRegion:   "${COGNITO_REGION:-us-east-1}",
  cognitoClientId: "${COGNITO_CLIENT_ID:-}",
  cognitoPoolId:   "${COGNITO_POOL_ID:-}"
};
EOF

echo "[entrypoint] config.js generado:"
sed 's/^/[entrypoint]   /' "$DESTINO"

exec nginx -g 'daemon off;'
