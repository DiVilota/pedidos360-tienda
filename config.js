/* Valores de desarrollo. En Docker este archivo se sobrescribe en el arranque
   (ver docker-entrypoint.sh). */
window.PEDIDOS360_CONFIG = {
  pagos:           "http://localhost:8083",
  recomendaciones: "http://localhost:8084",
  admin:           "http://localhost:8085",
  ws:              ""
};
