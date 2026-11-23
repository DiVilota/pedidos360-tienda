import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTienda } from '../state/contexto'
import { Header } from './Header'
import { CarritoDrawer, DeseosDrawer, Toast } from './Paneles'

export function Layout() {
  const { pathname, hash } = useLocation()

  /* Navegación SPA: al cambiar de ruta se vuelve arriba, salvo que el enlace
     apunte a una sección (/#productos), que se desplaza hasta ella. */
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' })
        return
      }
    }
    window.scrollTo({ top: 0 })
  }, [pathname, hash])

  return (
    <>
      <a href="#contenido" className="sr-only">
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido">
        <Outlet />
      </main>
      <CarritoDrawer />
      <DeseosDrawer />
      <Toast />
    </>
  )
}

/* Rutas que requieren sesión: se redirige al login conservando adónde iba. */
export function RequiereSesion({ rol, children }: { rol?: 'cliente' | 'admin'; children: React.ReactNode }) {
  const { sesion } = useTienda()
  const { pathname, search } = useLocation()
  if (!sesion) return <Navigate to={`/ingresar?volver=${encodeURIComponent(pathname + search)}`} replace />
  if (rol && sesion.rol !== rol) return <Navigate to="/" replace />
  return <>{children}</>
}
