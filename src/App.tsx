import { Route, Routes } from 'react-router-dom'
import { Layout, RequiereSesion } from './components/Layout'
import { Admin } from './pages/Admin'
import { Callback } from './pages/Callback'
import { Checkout } from './pages/Checkout'
import { Inicio } from './pages/Inicio'
import { Ingresar, NoEncontrada } from './pages/Ingresar'
import { MisPedidos } from './pages/MisPedidos'
import { Producto } from './pages/Producto'

/* Rutas de la tienda. /callback es fija: es adonde ms-pago redirige tras el
   commit de Webpay (FRONT_URL_TIENDA + "/callback", origen TIENDA), así que
   cambiarla rompe la vuelta del pago sin que nada falle al compilar. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="producto/:id" element={<Producto />} />
        <Route path="ingresar" element={<Ingresar />} />
        <Route
          path="checkout"
          element={
            <RequiereSesion>
              <Checkout />
            </RequiereSesion>
          }
        />
        <Route path="callback" element={<Callback />} />
        <Route
          path="pedidos"
          element={
            <RequiereSesion rol="cliente">
              <MisPedidos />
            </RequiereSesion>
          }
        />
        <Route
          path="admin"
          element={
            <RequiereSesion rol="admin">
              <Admin />
            </RequiereSesion>
          }
        />
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  )
}
