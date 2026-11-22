/* Íconos de línea propios (sin librería): son pocos y así no se agrega una
   dependencia de 200 KB para ocho dibujos. Todos heredan currentColor. */

type P = { className?: string }

const base = {
  viewBox: '0 0 48 48',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/* Un ícono por slug del catálogo semilla (§7.1). Un slug desconocido cae a la
   caja genérica, que también se lee como "producto" y no como error. */
export function IconoCategoria({ slug, className }: P & { slug: string }) {
  switch (slug) {
    case 'celulares':
      return (
        <svg {...base} className={className}>
          <rect x="14" y="5" width="20" height="38" rx="4" />
          <path d="M21 10h6M22 37h4" />
        </svg>
      )
    case 'laptops':
      return (
        <svg {...base} className={className}>
          <rect x="9" y="10" width="30" height="20" rx="2" />
          <path d="M4 37h40l-3-7H7z" />
        </svg>
      )
    case 'audio':
      return (
        <svg {...base} className={className}>
          <path d="M8 30v-6a16 16 0 0 1 32 0v6" />
          <rect x="6" y="28" width="9" height="13" rx="3" />
          <rect x="33" y="28" width="9" height="13" rx="3" />
        </svg>
      )
    case 'gaming':
      return (
        <svg {...base} className={className}>
          <path d="M15 15h18a9 9 0 0 1 9 9l1 9a5 5 0 0 1-9 3l-3-4H17l-3 4a5 5 0 0 1-9-3l1-9a9 9 0 0 1 9-9z" />
          <path d="M15 21v6M12 24h6" />
          <circle cx="31" cy="22" r="1.4" fill="currentColor" />
          <circle cx="35" cy="26" r="1.4" fill="currentColor" />
        </svg>
      )
    case 'tv-video':
      return (
        <svg {...base} className={className}>
          <rect x="5" y="9" width="38" height="25" rx="2" />
          <path d="M17 41h14M24 34v7" />
        </svg>
      )
    case 'smart-home':
      return (
        <svg {...base} className={className}>
          <path d="M7 22 24 8l17 14" />
          <path d="M11 19v21h26V19" />
          <path d="M19 31a7 7 0 0 1 10 0M21.5 34.5a3 3 0 0 1 5 0" />
        </svg>
      )
    case 'accesorios':
      return (
        <svg {...base} className={className}>
          <path d="M18 6v9M30 6v9" />
          <path d="M13 15h22v8a11 11 0 0 1-22 0z" />
          <path d="M24 34v8" />
        </svg>
      )
    case 'camaras':
      return (
        <svg {...base} className={className}>
          <path d="M6 15h9l3-5h12l3 5h9v24H6z" />
          <circle cx="24" cy="26" r="7.5" />
        </svg>
      )
    default:
      return (
        <svg {...base} className={className}>
          <path d="M6 15 24 6l18 9v19l-18 9-18-9z" />
          <path d="M6 15l18 9 18-9M24 24v19" />
        </svg>
      )
  }
}

export function Logo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      <rect x="0.5" y="0.5" width="35" height="35" rx="8" fill="#0b1220" stroke="#263349" />
      <path d="M18 7.5a10.5 10.5 0 1 1-9.1 5.25" fill="none" stroke="#38bdf8" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="8.9" cy="12.75" r="2.4" fill="#38bdf8" />
      <rect x="14" y="14" width="8" height="8" rx="1.6" fill="#e8eef8" />
      <path d="M14 17h8" stroke="#0b1220" strokeWidth="1.2" />
    </svg>
  )
}

export function Avatar({ tam = 38 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 40 40" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="20" cy="15" r="7" fill="#7dd3fc" />
      <path d="M6.5 36c1.6-7.6 7-11.5 13.5-11.5S31.9 28.4 33.5 36" fill="#38bdf8" />
      <circle cx="17.6" cy="13" r="2.2" fill="#e0f2fe" opacity=".7" />
    </svg>
  )
}

export function IconoCampana() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}
