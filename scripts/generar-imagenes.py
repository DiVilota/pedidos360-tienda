#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera las ilustraciones del catalogo: public/img/<id>.svg

POR QUE GENERADAS Y NO FOTOS
- No hay derechos sobre fotos de producto reales (iPhone, PS5, Bravia), y
  enlazar a imagenes ajenas deja la tienda dependiendo de un dominio externo:
  en la sala, sin internet o con el hotlink roto, el catalogo se cae a
  placeholders en plena defensa.
- Un SVG pesa ~1 KB, escala sin pixelarse y usa la paleta de la tienda, asi que
  el catalogo se ve coherente y no "con fotos pegadas".

POR QUE UN SCRIPT Y NO 20 ARCHIVOS A MANO
Las primeras ilustraciones existian SOLO en la instancia, sin commitear, y
estaban en la paleta morada del prototipo, no en la azul de la tienda. Un
generador las deja reproducibles y hace que cambiar la paleta sea una linea.

El dibujo lo elige la SUBCATEGORIA (el backend ya la publica), con excepciones
por id donde la subcategoria agrupa cosas distintas: unos audifonos de vincha y
unos in-ear son "audifonos", y una PS5 y una Switch son "consolas".

Uso:  python scripts/generar-imagenes.py [--salida public/img]
"""
from __future__ import annotations
import argparse, json, os, urllib.request
import xml.etree.ElementTree as ET

# Paleta de src/styles/tienda.css — si cambia alla, cambia aca.
FONDO_A, FONDO_B = "#0d1627", "#131f36"
LINEA = "#2b3a54"
ACENTO = "#38bdf8"
ACENTO_2 = "#7dd3fc"
METAL = "#8aa0c0"
METAL_OSCURO = "#3d4f6d"
PANTALLA = "#0a1322"

API_PRODUCTOS = os.environ.get("API_PRODUCTOS", "http://localhost:8086")


# --------------------------------------------------------------- dibujos
# Cada funcion devuelve el contenido SVG centrado en un lienzo de 800x600.
# Nada de texto: el nombre del producto ya va al lado de la imagen.

def celular(barra=True):
    return f"""
  <rect x="330" y="140" width="140" height="300" rx="26" fill="{PANTALLA}" stroke="{METAL}" stroke-width="3"/>
  <rect x="340" y="152" width="120" height="276" rx="18" fill="url(#pantalla)"/>
  {'<rect x="378" y="160" width="44" height="9" rx="4.5" fill="' + METAL_OSCURO + '"/>' if barra else ''}
  <circle cx="400" cy="300" r="34" fill="none" stroke="{ACENTO}" stroke-width="2" opacity=".55"/>
  <circle cx="400" cy="300" r="58" fill="none" stroke="{ACENTO}" stroke-width="1.5" opacity=".25"/>
  <rect x="352" y="396" width="96" height="6" rx="3" fill="{METAL_OSCURO}"/>"""


def laptop():
    return f"""
  <path d="M265 165h270a12 12 0 0 1 12 12v185H253V177a12 12 0 0 1 12-12z" fill="{PANTALLA}" stroke="{METAL}" stroke-width="3"/>
  <rect x="268" y="180" width="264" height="166" rx="6" fill="url(#pantalla)"/>
  <path d="M215 362h370l34 52H181z" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <rect x="352" y="378" width="96" height="8" rx="4" fill="{PANTALLA}" opacity=".8"/>
  <path d="M292 206h120M292 232h180M292 258h150" stroke="{ACENTO}" stroke-width="3" stroke-linecap="round" opacity=".5"/>"""


def audifonos_vincha():
    return f"""
  <path d="M258 322v-34a142 142 0 0 1 284 0v34" fill="none" stroke="{METAL}" stroke-width="18" stroke-linecap="round"/>
  <rect x="226" y="300" width="74" height="122" rx="34" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <rect x="500" y="300" width="74" height="122" rx="34" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <ellipse cx="263" cy="361" rx="20" ry="36" fill="{PANTALLA}"/>
  <ellipse cx="537" cy="361" rx="20" ry="36" fill="{PANTALLA}"/>
  <path d="M600 300a46 46 0 0 1 0 122" fill="none" stroke="{ACENTO}" stroke-width="3" opacity=".6"/>
  <path d="M628 282a74 74 0 0 1 0 158" fill="none" stroke="{ACENTO}" stroke-width="2.5" opacity=".3"/>"""


def audifonos_inear():
    return f"""
  <path d="M300 210c34 0 56 26 56 62 0 46-26 58-26 96 0 26-18 44-42 44s-42-20-42-46c0-44 22-50 22-94 0-38 22-62 32-62z" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <circle cx="306" cy="268" r="17" fill="{PANTALLA}"/>
  <path d="M500 210c-34 0-56 26-56 62 0 46 26 58 26 96 0 26 18 44 42 44s42-20 42-46c0-44-22-50-22-94 0-38-22-62-32-62z" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <circle cx="494" cy="268" r="17" fill="{PANTALLA}"/>
  <rect x="344" y="356" width="112" height="76" rx="22" fill="{PANTALLA}" stroke="{METAL}" stroke-width="3"/>
  <circle cx="400" cy="394" r="9" fill="{ACENTO}" opacity=".8"/>"""


def parlante():
    return f"""
  <rect x="268" y="196" width="264" height="208" rx="104" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <circle cx="340" cy="300" r="54" fill="{PANTALLA}" stroke="{METAL}" stroke-width="2"/>
  <circle cx="340" cy="300" r="22" fill="{METAL_OSCURO}"/>
  <circle cx="460" cy="300" r="54" fill="{PANTALLA}" stroke="{METAL}" stroke-width="2"/>
  <circle cx="460" cy="300" r="22" fill="{METAL_OSCURO}"/>
  <rect x="384" y="420" width="32" height="10" rx="5" fill="{METAL}" opacity=".5"/>
  <path d="M568 232a92 92 0 0 1 0 136M598 206a132 132 0 0 1 0 188" fill="none" stroke="{ACENTO}" stroke-width="3" stroke-linecap="round" opacity=".45"/>"""


def consola_torre():
    return f"""
  <path d="M322 136h40c14 0 22 10 20 24l-18 290c-2 14-12 24-26 24h-16c-14 0-24-10-24-24V160c0-14 10-24 24-24z" fill="{METAL}" opacity=".9"/>
  <path d="M438 136h40c14 0 24 10 24 24v290c0 14-10 24-24 24h-16c-14 0-24-10-26-24l-18-290c-2-14 6-24 20-24z" fill="{METAL}" opacity=".9"/>
  <rect x="368" y="136" width="64" height="338" rx="10" fill="{PANTALLA}" stroke="{METAL_OSCURO}" stroke-width="2"/>
  <rect x="392" y="188" width="16" height="78" rx="8" fill="{ACENTO}" opacity=".75"/>
  <rect x="284" y="466" width="232" height="14" rx="7" fill="{METAL_OSCURO}"/>"""


def consola_hibrida():
    return f"""
  <rect x="300" y="196" width="200" height="208" rx="14" fill="{PANTALLA}" stroke="{METAL}" stroke-width="3"/>
  <rect x="312" y="208" width="176" height="184" rx="8" fill="url(#pantalla)"/>
  <rect x="236" y="190" width="62" height="220" rx="28" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <rect x="502" y="190" width="62" height="220" rx="28" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <circle cx="267" cy="246" r="13" fill="{ACENTO}" opacity=".8"/>
  <circle cx="533" cy="246" r="13" fill="{ACENTO_2}" opacity=".8"/>
  <path d="M252 322h30M267 307v30" stroke="{METAL}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="533" cy="330" r="12" fill="none" stroke="{METAL}" stroke-width="3"/>"""


def control():
    return f"""
  <path d="M300 236h200c48 0 86 40 92 96l12 68c6 40-32 62-58 36l-50-50H304l-50 50c-26 26-64 4-58-36l12-68c6-56 44-96 92-96z" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <circle cx="330" cy="310" r="24" fill="{PANTALLA}" stroke="{METAL}" stroke-width="2"/>
  <circle cx="470" cy="310" r="24" fill="{PANTALLA}" stroke="{METAL}" stroke-width="2"/>
  <path d="M352 362h26M365 349v26" stroke="{METAL}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="437" cy="356" r="9" fill="{ACENTO}" opacity=".85"/>
  <circle cx="462" cy="376" r="9" fill="{ACENTO_2}" opacity=".6"/>
  <rect x="384" y="268" width="32" height="8" rx="4" fill="{ACENTO}" opacity=".7"/>"""


def televisor():
    return f"""
  <rect x="180" y="150" width="440" height="252" rx="12" fill="{PANTALLA}" stroke="{METAL}" stroke-width="3"/>
  <rect x="192" y="162" width="416" height="228" rx="6" fill="url(#pantalla)"/>
  <path d="M192 300l88-58 74 48 70-78 106 88v90H192z" fill="{ACENTO}" opacity=".22"/>
  <circle cx="300" cy="212" r="22" fill="{ACENTO}" opacity=".3"/>
  <rect x="368" y="402" width="64" height="44" fill="{METAL_OSCURO}"/>
  <rect x="300" y="444" width="200" height="14" rx="7" fill="{METAL}" opacity=".7"/>"""


def stick_streaming():
    return f"""
  <rect x="300" y="250" width="210" height="100" rx="26" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <circle cx="352" cy="300" r="22" fill="{ACENTO}" opacity=".6"/>
  <rect x="510" y="282" width="52" height="36" rx="6" fill="{METAL}"/>
  <rect x="238" y="266" width="62" height="68" rx="14" fill="{PANTALLA}" stroke="{METAL}" stroke-width="3"/>
  <path d="M206 300h-34M196 262l-28-18M196 338l-28 18" stroke="{ACENTO}" stroke-width="3" stroke-linecap="round" opacity=".5"/>"""


def asistente():
    return f"""
  <ellipse cx="400" cy="398" rx="130" ry="30" fill="{METAL_OSCURO}" opacity=".5"/>
  <circle cx="400" cy="300" r="130" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <path d="M270 300a130 130 0 0 0 260 0" fill="{PANTALLA}" opacity=".45"/>
  <ellipse cx="400" cy="300" rx="130" ry="26" fill="none" stroke="{ACENTO}" stroke-width="4" opacity=".75"/>
  <circle cx="400" cy="250" r="54" fill="none" stroke="{ACENTO_2}" stroke-width="2" opacity=".3"/>
  <circle cx="356" cy="262" r="7" fill="{ACENTO}" opacity=".7"/>
  <circle cx="444" cy="262" r="7" fill="{ACENTO}" opacity=".7"/>"""


def ampolleta():
    return f"""
  <path d="M400 150c62 0 112 48 112 108 0 44-26 66-38 94-8 18-10 30-10 42H336c0-12-2-24-10-42-12-28-38-50-38-94 0-60 50-108 112-108z" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <path d="M400 186c-42 0-76 32-76 72 0 30 16 46 26 64h100c10-18 26-34 26-64 0-40-34-72-76-72z" fill="{ACENTO}" opacity=".3"/>
  <path d="M344 400h112M348 424h104M356 448h88" stroke="{METAL}" stroke-width="10" stroke-linecap="round"/>
  <path d="M400 90v34M300 128l22 26M500 128l-22 26M232 228h32M536 228h32" stroke="{ACENTO}" stroke-width="4" stroke-linecap="round" opacity=".55"/>"""


def cargador():
    return f"""
  <rect x="268" y="196" width="200" height="200" rx="34" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <rect x="316" y="152" width="22" height="48" rx="6" fill="{METAL}"/>
  <rect x="398" y="152" width="22" height="48" rx="6" fill="{METAL}"/>
  <rect x="336" y="352" width="64" height="20" rx="10" fill="{PANTALLA}" stroke="{METAL}" stroke-width="2"/>
  <path d="M468 296h58a34 34 0 0 1 34 34v76" fill="none" stroke="{ACENTO}" stroke-width="10" stroke-linecap="round" opacity=".6"/>
  <path d="M352 236l-22 44h30l-14 40 48-56h-30l16-28z" fill="{ACENTO}" opacity=".85"/>"""


def funda():
    return f"""
  <rect x="316" y="130" width="168" height="330" rx="34" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <rect x="336" y="150" width="128" height="290" rx="24" fill="{PANTALLA}" opacity=".6"/>
  <rect x="348" y="166" width="92" height="92" rx="20" fill="{PANTALLA}" stroke="{METAL}" stroke-width="2"/>
  <circle cx="376" cy="194" r="15" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="2"/>
  <circle cx="412" cy="230" r="15" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="2"/>
  <circle cx="400" cy="340" r="46" fill="none" stroke="{ACENTO}" stroke-width="4" opacity=".55"/>
  <circle cx="400" cy="340" r="24" fill="none" stroke="{ACENTO}" stroke-width="3" opacity=".35"/>"""


def camara_mirrorless():
    return f"""
  <rect x="216" y="230" width="368" height="190" rx="22" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <rect x="310" y="196" width="104" height="40" rx="10" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <circle cx="400" cy="326" r="86" fill="{PANTALLA}" stroke="{METAL}" stroke-width="4"/>
  <circle cx="400" cy="326" r="58" fill="none" stroke="{METAL}" stroke-width="3"/>
  <circle cx="400" cy="326" r="30" fill="{ACENTO}" opacity=".35"/>
  <circle cx="378" cy="306" r="11" fill="{ACENTO_2}" opacity=".7"/>
  <rect x="246" y="258" width="44" height="14" rx="7" fill="{PANTALLA}"/>
  <circle cx="540" cy="266" r="11" fill="{ACENTO}" opacity=".8"/>"""


def camara_accion():
    return f"""
  <rect x="268" y="206" width="264" height="206" rx="30" fill="{METAL_OSCURO}" stroke="{METAL}" stroke-width="3"/>
  <circle cx="366" cy="300" r="66" fill="{PANTALLA}" stroke="{METAL}" stroke-width="4"/>
  <circle cx="366" cy="300" r="40" fill="none" stroke="{METAL}" stroke-width="3"/>
  <circle cx="366" cy="300" r="20" fill="{ACENTO}" opacity=".4"/>
  <circle cx="352" cy="286" r="8" fill="{ACENTO_2}" opacity=".8"/>
  <rect x="452" y="248" width="58" height="42" rx="8" fill="{PANTALLA}" stroke="{METAL}" stroke-width="2"/>
  <rect x="452" y="318" width="58" height="12" rx="6" fill="{ACENTO}" opacity=".6"/>
  <rect x="452" y="344" width="40" height="12" rx="6" fill="{METAL}" opacity=".5"/>
  <path d="M300 412v26h40M500 412v26h-40" fill="none" stroke="{METAL}" stroke-width="6" stroke-linecap="round"/>"""


DIBUJOS = {
    "gama-alta": lambda: celular(True),
    "gama-media": lambda: celular(False),
    "ultraliviana": laptop,
    "uso-diario": laptop,
    "audifonos": audifonos_vincha,
    "parlantes": parlante,
    "consolas": consola_torre,
    "controles": control,
    "televisores": televisor,
    "streaming": stick_streaming,
    "asistentes": asistente,
    "iluminacion": ampolleta,
    "carga": cargador,
    "fundas": funda,
    "mirrorless": camara_mirrorless,
    "accion": camara_accion,
}

# La subcategoria agrupa cosas que se dibujan distinto.
POR_ID = {
    "item_108": audifonos_inear,     # AirPods Pro 2: in-ear con estuche
    "item_111": consola_hibrida,     # Switch OLED: no es una torre
}


def escapar(texto: str) -> str:
    """Escape XML para los atributos (nombres con & o comillas)."""
    return (texto.replace("&", "&amp;").replace("<", "&lt;")
                 .replace(">", "&gt;").replace('"', "&quot;"))


def svg(producto) -> str:
    sub = (producto.get("subcategoria") or "").strip()
    dibujo = POR_ID.get(producto["id"]) or DIBUJOS.get(sub)
    if dibujo is None:
        raise SystemExit("sin dibujo para subcategoria %r (%s). Agregalo en DIBUJOS." % (sub, producto["id"]))
    # Escapar SIEMPRE: hay nombres con comilla (Bravia 55" 4K) y con ampersand
    # (Hue White & Color). Sin esto el atributo se corta y el SVG queda mal
    # formado; el navegador no avisa, solo dibuja el icono de imagen rota.
    etiqueta = escapar("%s — ilustración del producto" % producto["nombre"])
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="{etiqueta}">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{FONDO_A}"/><stop offset="1" stop-color="{FONDO_B}"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="42%" r="58%">
      <stop offset="0" stop-color="{ACENTO}" stop-opacity=".16"/>
      <stop offset="1" stop-color="{ACENTO}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="pantalla" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#16243d"/><stop offset="1" stop-color="#0c1526"/>
    </linearGradient>
    <pattern id="malla" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0v40" fill="none" stroke="{LINEA}" stroke-width="1" opacity=".5"/>
    </pattern>
  </defs>
  <rect width="800" height="600" fill="url(#fondo)"/>
  <rect width="800" height="600" fill="url(#malla)"/>
  <rect width="800" height="600" fill="url(#halo)"/>
  <g>{svg_dibujo(dibujo)}
  </g>
</svg>
"""


def svg_dibujo(dibujo) -> str:
    return dibujo().rstrip()


def catalogo():
    """Lee el catalogo del servicio; si no responde, usa la copia de respaldo."""
    try:
        with urllib.request.urlopen(API_PRODUCTOS + "/api/productos", timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        respaldo = os.path.join(os.path.dirname(__file__), "catalogo-respaldo.json")
        if os.path.exists(respaldo):
            print("  (%s no responde: uso %s)" % (API_PRODUCTOS, os.path.basename(respaldo)))
            return json.load(open(respaldo, encoding="utf-8"))
        raise SystemExit("no pude leer el catalogo de %s (%s) y no hay respaldo" % (API_PRODUCTOS, e))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", default=os.path.join(os.path.dirname(__file__), "..", "public", "img"))
    args = ap.parse_args()
    salida = os.path.abspath(args.salida)
    os.makedirs(salida, exist_ok=True)

    productos = catalogo()
    # Respaldo del catalogo, para poder regenerar sin el backend arriba.
    with open(os.path.join(os.path.dirname(__file__), "catalogo-respaldo.json"), "w", encoding="utf-8") as f:
        json.dump([{k: p.get(k) for k in ("id", "nombre", "categoria", "subcategoria")} for p in productos],
                  f, ensure_ascii=False, indent=1)

    for p in sorted(productos, key=lambda x: x["id"]):
        destino = os.path.join(salida, "%s.svg" % p["id"])
        contenido = svg(p)
        # Un SVG mal formado no da error: el navegador dibuja el icono de imagen
        # rota y uno culpa a la URL o al nginx. Se valida antes de escribirlo.
        try:
            ET.fromstring(contenido)
        except ET.ParseError as e:
            raise SystemExit("SVG mal formado para %s (%s): %s" % (p["id"], p["nombre"], e))
        with open(destino, "w", encoding="utf-8") as f:
            f.write(contenido)
        print("  %-9s %-26s %s" % (p["id"], p["nombre"][:26], p.get("subcategoria")))
    print("\n%d ilustraciones en %s" % (len(productos), salida))


if __name__ == "__main__":
    main()
