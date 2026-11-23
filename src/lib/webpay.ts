/* ---------------------------------------------------------------------------
   Salto a Webpay.

   Transbank exige que el navegador llegue a su formulario con un POST que
   lleve `token_ws` en el CUERPO; un GET con el token en la URL no lo acepta.
   Un fetch tampoco sirve: hay que NAVEGAR, así que se arma un <form> oculto.

   Misma pestaña (target _self) y no una nueva como hacía el prototipo: la
   vuelta llega por redirect de ms-pago a /callback, y con una pestaña nueva el
   cliente terminaba con dos tiendas abiertas y la original sin enterarse.
   ------------------------------------------------------------------------- */

export function armarFormularioWebpay(url: string, token: string, doc: Document = document): HTMLFormElement {
  const form = doc.createElement('form')
  form.method = 'POST'
  form.action = url
  form.target = '_self'
  form.style.display = 'none'
  const input = doc.createElement('input')
  input.type = 'hidden'
  input.name = 'token_ws'
  input.value = token
  form.appendChild(input)
  return form
}

export function irAWebpay(url: string, token: string, doc: Document = document): void {
  const form = armarFormularioWebpay(url, token, doc)
  doc.body.appendChild(form)
  form.submit()
}
