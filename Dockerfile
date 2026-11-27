# Tienda Pedidos360 — compilación con Vite y servido estático con nginx.
#
# nginx y no "abrir el archivo": con file:// el origen es "null" y el CORS de
# los microservicios declara orígenes concretos (8091 en Docker). Además la
# vuelta de Webpay llega a /callback, una ruta de la SPA que sólo existe si
# un servidor hace el fallback a index.html.

# ---------- etapa 1: compilación ----------
FROM node:22-alpine AS build

WORKDIR /app

# Manifiestos primero: la capa de dependencias se reutiliza mientras no
# cambien, así tocar código no reinstala node_modules.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---------- etapa 2: servido ----------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Sólo el resultado de la compilación: ni node_modules ni el código fuente
# llegan a la imagen final.
COPY --from=build /app/dist /usr/share/nginx/html

# El entrypoint genera config.js con las URL del entorno antes de arrancar
# nginx y sobrescribe el config.js de desarrollo que viene en dist/.
COPY docker-entrypoint.sh /docker-entrypoint-pedidos360.sh
RUN chmod +x /docker-entrypoint-pedidos360.sh

# 443 sólo responde si se monta un certificado en /etc/nginx/ssl (ver entrypoint).
EXPOSE 80 443

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/salud || exit 1

ENTRYPOINT ["/docker-entrypoint-pedidos360.sh"]
