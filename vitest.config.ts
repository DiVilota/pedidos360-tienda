import { defineConfig } from 'vitest/config'

/* jsdom y no node: hay pruebas que leen localStorage (identidad anónima) y que
   arman el formulario que se envía a Webpay, y ambas cosas necesitan un DOM. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    restoreMocks: true,
  },
})
