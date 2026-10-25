# El Urbano - Fleet Tracking API

API REST para el sistema de rastreo de colectivos El Urbano. Este proyecto implementa endpoints para gestionar GPS de vehículos, asignación de líneas y control de visibilidad pública.

## 🚀 Stack Técnico

- **Runtime:** Node.js con TypeScript
- **Deployment:** Vercel serverless functions
- **Storage:** Redis (Upstash) o in-memory fallback
- **Auth:** Token compartido

## 📁 Estructura del Proyecto

```
urbano-api/
├── api/
│   └── urbano/
│       ├── ping.ts              # POST - Recibir GPS del chofer
│       ├── fleet.ts             # GET - Obtener flota
│       └── coche/
│           └── [id]/
│               ├── linea.ts     # PATCH - Asignar línea
│               └── visibilidad.ts # PATCH - Control visibilidad
├── lib/
│   ├── types.ts                 # TypeScript interfaces
│   ├── auth.ts                  # Validación de tokens
│   └── redis.ts                 # Abstracción Redis + in-memory
├── scripts/
│   └── smoke.js                 # Tests smoke
└── docs/
    └── SCOPE.md                 # Alcance del proyecto
```

## 🔧 Setup Local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Crear archivo `.env` en la raíz:

```bash
# Auth tokens (cambiar en producción)
URBANO_CHOFER_TOKEN=your-chofer-token-here
URBANO_INSPECTOR_TOKEN=your-inspector-token-here

# Redis/Upstash (opcional - usa in-memory si no se configura)
UPSTASH_REDIS_REST_URL=https://your-upstash-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
```

**Nota:** Si no configuras Redis/Upstash, el sistema usa almacenamiento en memoria (datos se pierden al reiniciar).

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

La API estará disponible en `http://localhost:3000`

### 4. Ejecutar tests

```bash
npm test
```

Esto ejecuta el script de smoke test que verifica todos los endpoints.

## 📡 API Endpoints

### POST `/api/urbano/ping`

Recibe actualizaciones de GPS desde la app del chofer.

**Payload:**
```json
{
  "cocheId": "coche-001",
  "lat": -34.6037,
  "lng": -58.3816,
  "timestamp": "2026-10-25T10:30:00Z",
  "turnoId": "turno-mañana",
  "choferToken": "your-chofer-token"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Ping saved"
}
```

### GET `/api/urbano/fleet?mode=inspector`

Obtiene toda la flota para el panel del inspector (todos los coches del turno).

**Respuesta:**
```json
{
  "coches": [
    {
      "id": "coche-001",
      "linea": "Línea A",
      "lastPing": {
        "lat": -34.6037,
        "lng": -58.3816,
        "timestamp": "2026-10-25T10:30:00Z"
      },
      "visibleEnColejuy": true,
      "chofer": "chofer-1"
    }
  ]
}
```

### GET `/api/urbano/fleet?mode=public`

Obtiene solo coches visibles públicamente (para ColeJUY).

**Respuesta:**
```json
{
  "coches": [
    {
      "id": "coche-001",
      "linea": "Línea A",
      "lastPing": {
        "lat": -34.6037,
        "lng": -58.3816,
        "timestamp": "2026-10-25T10:30:00Z"
      }
    }
  ]
}
```

### PATCH `/api/urbano/coche/:id/linea`

Asigna o reasigna un coche a una línea.

**Payload:**
```json
{
  "linea": "Línea B",
  "inspectorToken": "your-inspector-token"
}
```

### PATCH `/api/urbano/coche/:id/visibilidad`

Controla la visibilidad pública del coche.

**Payload:**
```json
{
  "visibleEnColejuy": true,
  "inspectorToken": "your-inspector-token"
}
```

## 🔐 Autenticación

El sistema usa dos tipos de tokens:

- **choferToken:** Token para autenticar pings desde la app del chofer
- **inspectorToken:** Token administrativo para operaciones del panel inspector

Los tokens se validan en cada request. Configurar en variables de entorno `URBANO_CHOFER_TOKEN` y `URBANO_INSPECTOR_TOKEN`.

## 💾 Almacenamiento Redis

### Estructura de datos

Cada coche tiene una clave en Redis:
```
urbano:coche:{cocheId}:latest
```

Hash con los siguientes campos:
- `lat`: Latitud
- `lng`: Longitud  
- `timestamp`: Timestamp ISO8601
- `linea`: Línea asignada
- `visibleEnColejuy`: Boolean (string "true"/"false")
- `disponible`: Boolean (string "true"/"false")
- `coche`: ID del coche
- `chofer`: ID del chofer

**TTL:** 24 horas

### Configuración Upstash

Para usar Redis en producción, crear cuenta en [Upstash](https://upstash.com/) y configurar las variables de entorno.

### Fallback In-Memory

Si no se configura Upstash, el sistema usa almacenamiento en memoria (Map). **Advertencia:** Los datos se pierden al reiniciar el servidor.

## 🚢 Deploy en Vercel

### 1. Instalar Vercel CLI

```bash
npm install -g vercel
```

### 2. Deploy

```bash
vercel
```

### 3. Configurar variables de entorno en Vercel

En el dashboard de Vercel, agregar las variables:
- `URBANO_CHOFER_TOKEN`
- `URBANO_INSPECTOR_TOKEN`
- `UPSTASH_REDIS_REST_URL` (opcional)
- `UPSTASH_REDIS_REST_TOKEN` (opcional)

## 📝 Notas Importantes

- **NO** incluir secrets reales en git (usar `.env` y `.env.example`)
- **NO** modificar el repositorio `FrancoDuran23/colejuy`
- Este repo es solo para el backend de El Urbano
- Los componentes de mapa se reutilizarán del proyecto ColeJUY en fases futuras

## 📚 Referencias

- [SCOPE.md](./docs/SCOPE.md) - Alcance completo del proyecto
- [EXPO_GPS.md](./docs/EXPO_GPS.md) - Documentación técnica GPS
- [RIESGOS.md](./docs/RIESGOS.md) - Análisis de riesgos

## 🧪 Testing

El smoke test (`scripts/smoke.js`) verifica:

1. ✅ POST ping con GPS válido
2. ✅ Asignación de línea a coche
3. ✅ Control de visibilidad pública
4. ✅ Obtener flota completa (modo inspector)
5. ✅ Obtener solo coches visibles (modo público)
6. ✅ Rechazo de tokens inválidos
7. ✅ Filtrado correcto según visibilidad

```bash
npm test
```

## 🤝 Contribuir

Este proyecto sigue las especificaciones definidas en `docs/SCOPE.md`. Cualquier cambio debe alinearse con el alcance documentado.
