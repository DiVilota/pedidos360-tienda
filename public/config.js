/* Valores de desarrollo (los mismos puertos que el mock y que docker compose).
   En Docker este archivo se sobrescribe en el arranque: ver docker-entrypoint.sh.

   cognitoClientId vacío = en desarrollo no se puede iniciar sesión, y la
   pantalla de ingreso lo dice en vez de fallar con un error de red. Para probar
   el login real contra el user pool del lab, pega acá el id del app client (no
   es un secreto: un cliente SPA se crea sin secret justamente por eso). */
window.PEDIDOS360_CONFIG = {
  productos:       "http://localhost:8086",
  carrito:         "http://localhost:8087",
  pagos:           "http://localhost:8083",
  recomendaciones: "http://localhost:8084",
  notificaciones:  "http://localhost:8088",
  cognitoRegion:   "us-east-1",
  cognitoClientId: "",
  cognitoPoolId:   ""
};
