import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* El puerto 5174 es parte del contrato, no una preferencia:
   - es uno de los orígenes que TODOS los microservicios autorizan por CORS
     (CORS_ORIGENES = 5173, 5174, 8090, 8091);
   - es FRONT_URL_TIENDA, adonde ms-pago redirige tras el commit de Webpay
     cuando el pago se inició con origen=TIENDA.
   strictPort evita que Vite se corra en silencio a 5175 si el puerto está
   ocupado: ahí todo fallaría por CORS con los servicios "sanos". */
export default defineConfig({
  /* base relativa: los assets se resuelven contra el <base href> que pone
     index.html, así la misma build sirve en la raíz de nginx y bajo la etapa
     del API Gateway (/desarrollo/). Ver src/lib/base.ts. */
  base: './',
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
})
