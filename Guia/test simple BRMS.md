# Guía Completa: Testing de Ambientes BRMS

## Paso 1: Crear Documento Inicial

### 1.1 Crear versión 1.0 con tu grafo original
```bash
---- POST http://localhost:5174/api/documents/insurance-calculator/versions 
"Version 1.0 - Reglas de seguro básicas para producción"
```

### 1.2 Publicar versión 1.0
```bash
---- POST http://localhost:5174/api/documents/insurance-calculator/publish 
```

---

## Paso 2: Crear Release 1 (Para Producción)

```bash
---- POST http://localhost:5174/api/releases 
"name": "Stable v1.0",
"description": "Release estable para producción con reglas básicas"
```

## Paso 3: Crear Versión 2.0 (Modificada) con reglas diferentes
```bash
---- POST http://localhost:5174/api/documents/insurance-calculator/versions
 "Version 2.0 - Umbrales más bajos y reglas actualizadas para testing"
```

### 3.1 Publicar versión 2.0
```bash
---- POST http://localhost:5174/api/documents/insurance-calculator/publish 
```


## Paso 4: Crear Release 2 (Para Development)

```bash
---- POST http://localhost:5174/api/releases 
"name": "Beta v2.0",
"description": "Release de desarrollo con umbrales actualizados"
```


## Paso 5: Deploy a Ambientes

### 5.1 Deploy Release 1 a Production
```bash
---- POST "http://localhost:5174/api/environments/$PROD_ENV_ID/deploy" \
"releaseId": "$RELEASE_1_ID"
```

### 5.2 Deploy Release 2 a Development
```bash
--- POST "http://localhost:5174/api/environments/$DEV_ENV_ID/deploy" \
"releaseId": "$RELEASE_1_ID"
```

---
## Paso 8: Probar Simulaciones


### 8.2 Simular en Production (debería usar umbrales altos - v1.0)
```bash
---- POST http://localhost:5174/api/simulate/insurance-calculator?env=prod \

```

### 8.3 Simular en Development (debería usar umbrales bajos - v2.0)
```bash
---- POST http://localhost:5174/api/simulate/insurance-calculator?env=dev \

```

