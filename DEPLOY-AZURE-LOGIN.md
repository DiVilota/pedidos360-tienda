# Desplegar botón Azure Login en EC2 + habilitar HTTPS

> **Estado al 27-11 (léelo antes de seguir esta guía).** Esta guía es la bitácora de la sesión que
> agregó el botón de Microsoft y quedó **cumplida**. Dos cosas cambiaron después:
> - La rama vigente es **`p4-cognito`** (ahí se fusionó `react` en `cf53fac`), no `react`. No
>   hagas `git pull origin react` en la EC2: volverías a la tienda sin Cognito.
> - Redirect URIs en Azure: `http://localhost:5173` y la **URL de la etapa del API Gateway**
>   (`https://vih5lem02j.execute-api.us-east-1.amazonaws.com/desarrollo/`, ver script `20` del
>   backend; login con cuenta Duoc verificado por ahí). Para entrar por `https://18.211.30.140:8443`
>   esa URI también tiene que estar registrada: compruébalo en el portal.

## Contexto

El botón "Iniciar sesión con Microsoft" (Azure Entra ID) ya está en el código del repo `DiVilota/pedidos360-tienda` branch `react` (commit `e2c9ec7`), pero la tienda en la EC2 (`18.211.30.140:8091`) sigue con el código viejo. Hay que desplegar y habilitar HTTPS para que el login funcione.

## Azure App Registration (ya creada)

| Dato | Valor |
|---|---|
| App | Pedidos360 |
| Client ID | `aa1acc08-c8f7-47ed-bf62-dda7db86750d` |
| Tenant ID | `d4b6dc23-c077-4371-8909-a5508bbbf0f4` |
| Directorio | DabraCorp (Duoc UC) · cuenta `di.villota@duocuc.cl` |
| Redirect URI registrada | `http://localhost:5173` (SPA) |

## Tarea 1 — Desplegar el código en la EC2

La EC2 está corriendo (`i-0f5f47b9ffdefa327`, IP fija `18.211.30.140`). Acceso solo por SSM (no SSH).

```bash
# 1. Pull del repo de la tienda en la EC2
CMD=$(aws ssm send-command --region us-east-1 \
  --instance-ids i-0f5f47b9ffdefa327 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cd /opt/pedidos360/pedidos360-tienda && git pull origin react"]' \
  --timeout-seconds 120 \
  --query 'Command.CommandId' --output text)
sleep 10
aws ssm get-command-invocation --region us-east-1 \
  --command-id $CMD --instance-id i-0f5f47b9ffdefa327 \
  --query '[Status, StandardOutputContent]' --output text

# 2. Rebuild y recrear el contenedor de la tienda
CMD=$(aws ssm send-command --region us-east-1 \
  --instance-ids i-0f5f47b9ffdefa327 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cd /opt/pedidos360/cloud-ev3-kafka && docker compose build tienda && docker compose up -d --no-deps --force-recreate tienda"]' \
  --timeout-seconds 300 \
  --query 'Command.CommandId' --output text)
# Esperar ~2-3 min (npm install + vite build)
sleep 180
aws ssm get-command-invocation --region us-east-1 \
  --command-id $CMD --instance-id i-0f5f47b9ffdefa327 \
  --query '[Status, StandardOutputContent]' --output text
```

**Verificación:** abrir `http://18.211.30.140:8091/ingresar` → debe aparecer el botón "Iniciar sesión con Microsoft".

## Tarea 2 — Habilitar HTTPS en la EC2

Azure Entra ID exige HTTPS en redirect URIs de producción (solo `http://localhost` está exento). Sin HTTPS, el popup de Microsoft rechaza la redirección.

### Opción: certificado autofirmado con nginx (~20 min)

```bash
# Generar certificado autofirmado para la IP
CMD=$(aws ssm send-command --region us-east-1 \
  --instance-ids i-0f5f47b9ffdefa327 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=[
    "mkdir -p /opt/pedidos360/ssl",
    "openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /opt/pedidos360/ssl/tienda.key -out /opt/pedidos360/ssl/tienda.crt -subj \"/CN=18.211.30.140\" -addext \"subjectAltName=IP:18.211.30.140\"",
    "ls -la /opt/pedidos360/ssl/"
  ]' \
  --timeout-seconds 60 \
  --query 'Command.CommandId' --output text)
sleep 10
aws ssm get-command-invocation --region us-east-1 \
  --command-id $CMD --instance-id i-0f5f47b9ffdefa327 \
  --query '[Status, StandardOutputContent]' --output text
```

Luego hay que:
1. Montar el certificado en el contenedor de la tienda (volumen en docker-compose.yml)
2. Configurar nginx dentro del contenedor para servir HTTPS en el puerto 443 (mapeado a 8443 en el host)
3. Abrir el puerto 8443 en el security group (`sg-09f9c2ed55290156a`)
4. Agregar `https://18.211.30.140:8443` como redirect URI SPA en Azure Portal → Autenticación

### Cambios en docker-compose.yml (servicio tienda)

```yaml
tienda:
  build: { context: "${TIENDA_DIR:-../pedidos360-tienda}" }
  container_name: tienda
  ports:
    - "8091:80"
    - "8443:443"    # HTTPS para Azure login
  volumes:
    - /opt/pedidos360/ssl:/etc/nginx/ssl:ro
  environment:
    # ... (las API_* existentes)
```

### Cambio en nginx.conf de la tienda (agregar bloque server para 443)

```nginx
server {
    listen 443 ssl;
    ssl_certificate     /etc/nginx/ssl/tienda.crt;
    ssl_certificate_key /etc/nginx/ssl/tienda.key;

    # Misma config que el server :80 existente
    root /usr/share/nginx/html;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /salud { return 200 'ok'; add_header Content-Type text/plain; }
}
```

### Security group

```bash
aws ec2 authorize-security-group-ingress --region us-east-1 \
  --group-id sg-09f9c2ed55290156a \
  --protocol tcp --port 8443 --cidr 0.0.0.0/0
```

### Redirect URI en Azure Portal

1. portal.azure.com → Registros de aplicaciones → Pedidos360 → Autenticación
2. En "Aplicación de página única" → Agregar URI → `https://18.211.30.140:8443`
3. Guardar

**Verificación:** abrir `https://18.211.30.140:8443/ingresar` en el navegador (aceptar el aviso de certificado autofirmado), hacer clic en "Iniciar sesión con Microsoft" → debe abrir el popup de login de Microsoft.

## Archivos modificados (ya en el repo)

| Archivo | Qué tiene |
|---|---|
| `src/lib/msalConfig.ts` | Config de MSAL: Client ID, Tenant ID, `msalReady` con `handleRedirectPromise` |
| `src/lib/auth.ts` | `iniciarSesionAzure()`, `restaurarSesionAzure()`, logout con limpieza MSAL |
| `src/pages/Ingresar.tsx` | Botón "Iniciar sesión con Microsoft" con logo SVG + separador |
| `src/state/contexto.ts` | Tipo `ingresarConAzure` en `Tienda` |
| `src/state/TiendaProvider.tsx` | Implementación de `ingresarConAzure` con traslado de carrito anónimo |
| `package.json` | Dependencias `@azure/msal-browser` y `@azure/msal-react` |

## Notas

- El `config.js` local (`public/config.js`) quedó apuntando a las IPs de AWS — **no hacer commit**, en Docker se regenera por `docker-entrypoint.sh`.
- El navegador mostrará un aviso de "conexión no segura" por el certificado autofirmado. Hay que aceptarlo manualmente. Es normal para una demo con IP sin dominio.
- Las cuentas demo (ana@correo.cl, admin@pedidos360.cl) siguen funcionando en paralelo con el login de Azure.
