# desde la carpeta brms-sim
docker compose --profile full up -d
# editor -> http://localhost:3000
# zen-sim -> http://localhost:5174/api/health

##Si solo querés la UI: docker compose --profile editor up -d.


https://www.npmjs.com/package/@gorules/zen-engine






Usos típicos

1) Guardar el grafo actual en el API (para usarlo sin mandarlo en cada request):

curl -X POST http://localhost:5174/api/graph \
  -H "Content-Type: application/json" \
  --data "$(jq --null-input --compact-output --argfile graph data_graph/graph.json '{"graph":$graph}')"


2) Simular pasando grafo + payload en una sola llamada:

curl -X POST http://localhost:5174/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"graph": (pegá aquí tu JSON del editor), "payload": {"input":42}}'


3) Simular usando el grafo persistido:

curl -X POST http://localhost:5174/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"payload":{"input":42}}'


El resultado viene como:

{ "ok": true, "result": { /* salida de tus reglas */ } }




------------------------------------------------------------
docker compose build --no-cache zen-sim
docker compose up -d zen-sim

docker compose stop zen-sim
docker compose rm -f zen-sim
docker compose build --no-cache zen-sim
docker compose --profile full up -d zen-sim
