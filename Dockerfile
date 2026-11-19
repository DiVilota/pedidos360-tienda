# Tienda Pedidos360 — imagen de servido estatico.
# Se sirve por HTTP (no file://) para que el CORS vea un origen real.

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html ruta-paquete.html support.js logo-pedidos360.svg /usr/share/nginx/html/

COPY docker-entrypoint.sh /docker-entrypoint-pedidos360.sh
RUN chmod +x /docker-entrypoint-pedidos360.sh

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/salud || exit 1

ENTRYPOINT ["/docker-entrypoint-pedidos360.sh"]
