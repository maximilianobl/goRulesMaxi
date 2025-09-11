# Guía Completa: Testing de Ambientes BRMS

## Objetivo
Probar que diferentes ambientes ejecuten diferentes versiones del mismo documento, para validar el sistema de deployment por ambiente.

## Requisitos Previos
- BRMS corriendo en `http://localhost:5174`
- Tu archivo `Calcular Cobertura de Seguro.json`

---

## Paso 1: Crear Documento Inicial

### 1.1 Crear versión 1.0 con tu grafo original
```bash
curl -X POST http://localhost:5174/api/documents/insurance-calculator/versions \
  -H "Content-Type: application/json" \
  -d '{
    "content": {
      "contentType": "application/vnd.gorules.decision",
      "nodes": [
        {
          "id": "ip1",
          "name": "request",
          "type": "inputNode",
          "content": {"schema": ""},
          "position": {"x": 110, "y": 114}
        },
        {
          "id": "dt1",
          "name": "determineBasePackage",
          "type": "decisionTableNode",
          "content": {
            "rules": [
              {"_id": "r1-1", "i1-1": ">= 500000", "i1-2": "'\''high'\''", "o1-1": "'\''premium'\''"},
              {"_id": "r1-2", "i1-1": ">= 300000", "i1-2": "'\''high'\''", "o1-1": "'\''standard'\''"},
              {"_id": "r1-3", "i1-1": ">= 500000", "i1-2": "'\''medium'\''", "o1-1": "'\''standard'\''"},
              {"_id": "r1-4", "i1-1": ">= 300000", "i1-2": "'\''medium'\''", "o1-1": "'\''basic'\''"},
              {"_id": "r1-5", "i1-1": ">= 200000", "i1-2": "'\''low'\''", "o1-1": "'\''basic'\''"},
              {"_id": "r1-6", "i1-1": "", "i1-2": "", "o1-1": "'\''minimal'\''"}
            ],
            "inputs": [
              {"id": "i1-1", "name": "Property Value", "field": "customerData.propertyValue"},
              {"id": "i1-2", "name": "Risk Area", "field": "riskAssessment.areaRiskLevel"}
            ],
            "outputs": [
              {"id": "o1-1", "name": "Base Package", "field": "basePackage"}
            ],
            "hitPolicy": "first", "passThrough": true, "executionMode": "single"
          },
          "position": {"x": 430, "y": 114}
        }
      ],
      "edges": [
        {"id": "ed1", "type": "edge", "sourceId": "ip1", "targetId": "dt1"}
      ]
    },
    "comment": "Version 1.0 - Reglas de seguro básicas para producción"
  }'
```

### 1.2 Obtener ID de la versión creada
```bash
VERSION_1_ID=$(curl -s http://localhost:5174/api/documents/insurance-calculator/versions | jq -r '.[0].id')
echo "Version 1 ID: $VERSION_1_ID"
```

### 1.3 Publicar versión 1.0
```bash
curl -X POST http://localhost:5174/api/documents/insurance-calculator/publish \
  -H "Content-Type: application/json" \
  -d "{\"versionId\": \"$VERSION_1_ID\"}"
```

---

## Paso 2: Crear Release 1 (Para Producción)

```bash
curl -X POST http://localhost:5174/api/releases \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Stable v1.0",
    "description": "Release estable para producción con reglas básicas"
  }'
```

### 2.1 Obtener ID del Release 1
```bash
RELEASE_1_ID=$(curl -s http://localhost:5174/api/releases | jq -r '.[0].id')
echo "Release 1 ID: $RELEASE_1_ID"
```

---

## Paso 3: Crear Versión 2.0 (Modificada)

### 3.1 Crear versión con reglas diferentes
```bash
curl -X POST http://localhost:5174/api/documents/insurance-calculator/versions \
  -H "Content-Type: application/json" \
  -d '{
    "content": {
      "contentType": "application/vnd.gorules.decision",
      "nodes": [
        {
          "id": "ip1",
          "name": "request",
          "type": "inputNode",
          "content": {"schema": ""},
          "position": {"x": 110, "y": 114}
        },
        {
          "id": "dt1",
          "name": "determineBasePackage_v2",
          "type": "decisionTableNode",
          "content": {
            "rules": [
              {"_id": "r1-1", "i1-1": ">= 400000", "i1-2": "'\''high'\''", "o1-1": "'\''premium'\''"},
              {"_id": "r1-2", "i1-1": ">= 250000", "i1-2": "'\''high'\''", "o1-1": "'\''standard'\''"},
              {"_id": "r1-3", "i1-1": ">= 400000", "i1-2": "'\''medium'\''", "o1-1": "'\''standard'\''"},
              {"_id": "r1-4", "i1-1": ">= 250000", "i1-2": "'\''medium'\''", "o1-1": "'\''basic'\''"},
              {"_id": "r1-5", "i1-1": ">= 150000", "i1-2": "'\''low'\''", "o1-1": "'\''basic'\''"},
              {"_id": "r1-6", "i1-1": "", "i1-2": "", "o1-1": "'\''minimal'\''"}
            ],
            "inputs": [
              {"id": "i1-1", "name": "Property Value", "field": "customerData.propertyValue"},
              {"id": "i1-2", "name": "Risk Area", "field": "riskAssessment.areaRiskLevel"}
            ],
            "outputs": [
              {"id": "o1-1", "name": "Base Package", "field": "basePackage"}
            ],
            "hitPolicy": "first", "passThrough": true, "executionMode": "single"
          },
          "position": {"x": 430, "y": 114}
        }
      ],
      "edges": [
        {"id": "ed1", "type": "edge", "sourceId": "ip1", "targetId": "dt1"}
      ]
    },
    "comment": "Version 2.0 - Umbrales más bajos y reglas actualizadas para testing"
  }'
```

### 3.2 Obtener ID de versión 2 y publicar
```bash
VERSION_2_ID=$(curl -s http://localhost:5174/api/documents/insurance-calculator/versions | jq -r '.[0].id')
echo "Version 2 ID: $VERSION_2_ID"

curl -X POST http://localhost:5174/api/documents/insurance-calculator/publish \
  -H "Content-Type: application/json" \
  -d "{\"versionId\": \"$VERSION_2_ID\"}"
```

---

## Paso 4: Crear Release 2 (Para Development)

```bash
curl -X POST http://localhost:5174/api/releases \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Beta v2.0",
    "description": "Release de desarrollo con umbrales actualizados"
  }'
```

### 4.1 Obtener ID del Release 2
```bash
RELEASE_2_ID=$(curl -s http://localhost:5174/api/releases | jq -r '.[0].id')
echo "Release 2 ID: $RELEASE_2_ID"
```

---

## Paso 5: Obtener IDs de Ambientes

```bash
# Listar ambientes
curl -s http://localhost:5174/api/environments | jq '.[] | {id, name, key}'

# Obtener IDs específicos
DEV_ENV_ID=$(curl -s http://localhost:5174/api/environments | jq -r '.[] | select(.key=="dev") | .id')
PROD_ENV_ID=$(curl -s http://localhost:5174/api/environments | jq -r '.[] | select(.key=="prod") | .id')

echo "Development Environment ID: $DEV_ENV_ID"
echo "Production Environment ID: $PROD_ENV_ID"
```

---

## Paso 6: Deploy a Ambientes

### 6.1 Deploy Release 1 a Production
```bash
curl -X POST "http://localhost:5174/api/environments/$PROD_ENV_ID/deploy" \
  -H "Content-Type: application/json" \
  -d "{\"releaseId\": \"$RELEASE_1_ID\"}"
```

### 6.2 Deploy Release 2 a Development
```bash
curl -X POST "http://localhost:5174/api/environments/$DEV_ENV_ID/deploy" \
  -H "Content-Type: application/json" \
  -d "{\"releaseId\": \"$RELEASE_2_ID\"}"
```

---

## Paso 7: Verificar Estado de Ambientes

```bash
curl -s http://localhost:5174/api/environments | jq '.[] | {name, key, release_version, release_name}'
```

**Resultado esperado:**
- Production: Release v1 (Stable v1.0)
- Development: Release v2 (Beta v2.0)

---

## Paso 8: Probar Simulaciones

### 8.1 Payload de prueba
```bash
PAYLOAD='{
  "customerData": {
    "propertyValue": 350000,
    "propertyAge": 15,
    "propertyType": "single-family"
  },
  "riskAssessment": {
    "areaRiskLevel": "high"
  }
}'
```

### 8.2 Simular en Production (debería usar umbrales altos - v1.0)
```bash
echo "=== PRODUCTION SIMULATION ==="
curl -X POST http://localhost:5174/api/simulate/insurance-calculator?env=prod \
  -H "Content-Type: application/json" \
  -d "{\"payload\": $PAYLOAD}" | jq '{environment: "prod", basePackage: .result.basePackage, source: .source, usedVersion: .usedVersion}'
```

### 8.3 Simular en Development (debería usar umbrales bajos - v2.0)
```bash
echo "=== DEVELOPMENT SIMULATION ==="
curl -X POST http://localhost:5174/api/simulate/insurance-calculator?env=dev \
  -H "Content-Type: application/json" \
  -d "{\"payload\": $PAYLOAD}" | jq '{environment: "dev", basePackage: .result.basePackage, source: .source, usedVersion: .usedVersion}'
```

---

## Paso 9: Resultados Esperados

### Con propertyValue: 350000 y areaRiskLevel: "high"

**Production (v1.0 - umbrales altos):**
- Regla aplicada: `>= 300000` + `'high'` → `basePackage: "standard"`

**Development (v2.0 - umbrales bajos):**
- Regla aplicada: `>= 250000` + `'high'` → `basePackage: "standard"` (mismo resultado)

### Prueba con valor más bajo: 280000

```bash
PAYLOAD_LOW='{
  "customerData": {"propertyValue": 280000},
  "riskAssessment": {"areaRiskLevel": "high"}
}'

echo "=== TESTING WITH LOWER VALUE ==="
echo "Production:"
curl -X POST http://localhost:5174/api/simulate/insurance-calculator?env=prod \
  -H "Content-Type: application/json" \
  -d "{\"payload\": $PAYLOAD_LOW}" | jq '.result.basePackage'

echo "Development:"  
curl -X POST http://localhost:5174/api/simulate/insurance-calculator?env=dev \
  -H "Content-Type: application/json" \
  -d "{\"payload\": $PAYLOAD_LOW}" | jq '.result.basePackage'
```

**Resultado esperado:**
- Production: `"minimal"` (no cumple >= 300000)
- Development: `"standard"` (cumple >= 250000)

---

## Paso 10: Verificación Final

```bash
echo "=== FINAL VERIFICATION ==="
echo "Documents:"
curl -s http://localhost:5174/api/documents | jq '.[] | select(.key=="insurance-calculator") | {key, version_count, published_at}'

echo "Releases:"
curl -s http://localhost:5174/api/releases | jq '.[] | {version, name, description}'

echo "Environment Status:"
curl -s http://localhost:5174/api/environments | jq '.[] | {name, release_version, release_name}'
```

---

## Solución de Problemas

### Si obtienes el mismo resultado en ambos ambientes:
1. Verifica que los ambientes apunten a releases diferentes
2. Confirma que las versiones tienen reglas diferentes
3. Revisa los logs: `docker compose logs zen-sim`

### Si hay errores de deployment:
1. Verifica que los IDs sean correctos y diferentes
2. Confirma que los releases existen
3. Revisa que los ambientes existen

### Si la simulación falla:
1. Verifica el formato del payload
2. Confirma que el documento existe
3. Revisa que las reglas estén bien formateadas