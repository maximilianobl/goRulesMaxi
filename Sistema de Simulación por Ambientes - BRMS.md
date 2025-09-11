# Sistema de Simulación por Ambientes - BRMS

## ¿Cómo funciona el sistema de ambientes?

### 1. **Flujo Normal de Deployment**
```
Desarrollo → Crear Versión → Publicar → Crear Release → Deploy a Ambiente
```

### 2. **Estado Actual del Sistema**
- **Development (dev)**: Podría tener Release v1
- **Production (prod)**: Podría tener Release v1 (mismo) o estar vacío

### 3. **¿Por qué ejecuta el mismo documento?**

**Es CORRECTO** que ejecute el mismo documento si:

1. **No has deployado diferentes releases a diferentes ambientes**
2. **Los ambientes apuntan al mismo release**
3. **Solo tienes una versión del documento**

## Cómo probar el sistema correctamente:

### Paso 1: Crear múltiples versiones
```bash
# Crear versión 1
curl -X POST http://localhost:5174/api/documents/test-graph/versions \
  -H "Content-Type: application/json" \
  -d '{
    "content": {"nodes": [...], "version": "1.0"},
    "comment": "Primera versión - Reglas básicas"
  }'

# Crear versión 2 (diferente)
curl -X POST http://localhost:5174/api/documents/test-graph/versions \
  -H "Content-Type: application/json" \
  -d '{
    "content": {"nodes": [...], "version": "2.0"},
    "comment": "Segunda versión - Reglas avanzadas"
  }'
```

### Paso 2: Crear releases diferentes
```bash
# Release 1 (con versión publicada 1)
curl -X POST http://localhost:5174/api/releases \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Stable Release",
    "description": "Release estable para producción"
  }'

# Publicar versión 2 del documento
# Crear Release 2 (con versión publicada 2)
curl -X POST http://localhost:5174/api/releases \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Beta Release", 
    "description": "Release con nuevas features"
  }'
```

### Paso 3: Deploy a ambientes diferentes
```bash
# Deploy Release 1 a Production
curl -X POST http://localhost:5174/api/environments/{prod-env-id}/deploy \
  -H "Content-Type: application/json" \
  -d '{"releaseId": "release-1-id"}'

# Deploy Release 2 a Development  
curl -X POST http://localhost:5174/api/environments/{dev-env-id}/deploy \
  -H "Content-Type: application/json" \
  -d '{"releaseId": "release-2-id"}'
```

### Paso 4: Ahora sí verás diferencias
```bash
# Simulación en Development (versión 2)
curl -X POST http://localhost:5174/api/simulate/test-graph?env=dev \
  -H "Content-Type: application/json" \
  -d '{"payload": {"test": true}}'

# Simulación en Production (versión 1)  
curl -X POST http://localhost:5174/api/simulate/test-graph?env=prod \
  -H "Content-Type: application/json" \
  -d '{"payload": {"test": true}}'
```

## Casos de uso reales:

### Caso 1: Testing de nuevas reglas
- **dev**: Versión 2.1 (reglas experimentales)
- **staging**: Versión 2.0 (reglas validadas)
- **prod**: Versión 1.9 (reglas estables)

### Caso 2: Rollback de emergencia
- **prod**: Rollback a versión anterior si hay problemas
- **dev**: Continúa con versión nueva para debug

### Caso 3: A/B Testing
- **prod-a**: Versión A (50% del tráfico)
- **prod-b**: Versión B (50% del tráfico)

## Verificar estado actual:

```sql
-- Ver qué release tiene cada ambiente
SELECT 
  e.name as environment,
  e.key,
  r.version as release_version,
  r.name as release_name
FROM environment e
LEFT JOIN "release" r ON e.release_id = r.id
WHERE e.project_id = '00000000-0000-0000-0000-000000000001';
```

## Resultado esperado:
Si todos los ambientes apuntan al mismo release → **Mismo documento**
Si apuntan a releases diferentes → **Documentos diferentes**