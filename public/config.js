/* Valores de desarrollo (los mismos puertos que el mock y que docker compose).
   En Docker este archivo se sobrescribe en el arranque: ver docker-entrypoint.sh. */
window.PEDIDOS360_CONFIG = {
  productos:       "http://localhost:8086",
  carrito:         "http://localhost:8087",
  pagos:           "http://localhost:8083",
  recomendaciones: "http://localhost:8084",
  notificaciones:  "http://localhost:8088"
};
