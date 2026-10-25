# El Urbano - Alcance del Proyecto

## Descripción General

El Urbano es un sistema de rastreo de transporte público que permite a la empresa monitorear y gestionar su flota de colectivos en tiempo real. El proyecto reutiliza componentes visuales y arquitectura del sistema ColeJUY existente, adaptándolos para la marca y necesidades específicas de El Urbano.

## Componentes del Sistema

### 1. Aplicación del Chofer (Expo/React Native)

**Funcionalidad principal:**
- Gestión de turnos de trabajo
- Rastreo GPS en segundo plano (background tracking)
- Asignación de coche y línea
- Estado de disponibilidad

**Características técnicas:**
- Plataforma: Expo/React Native
- GPS en background para continuar rastreando cuando la app está minimizada
- Envío periódico de coordenadas al servidor
- Interfaz simple para operación durante la conducción

### 2. Panel del Inspector

**Funcionalidad principal:**
- Vista de lista de todos los COCHES de la flota
- Asignación y reasignación de coche → línea
- Control de visibilidad pública (checkbox `visibleEnColejuy`)
- Mapa en tiempo real de todos los vehículos del turno activo

**Características técnicas:**
- Reutiliza componentes visuales y de mapa de `FrancoDuran23/colejuy` (tracking components)
- NO se desarrolla un mapa nuevo; se importan/adaptan los existentes
- Visualiza TODOS los GPS del turno, independiente de la visibilidad pública
- Interfaz administrativa para gestión operativa

### 3. Vista Pública ColeJUY

**Funcionalidad principal:**
- Muestra únicamente coches con `visibleEnColejuy = true`
- Permite al público ver ubicación de colectivos disponibles
- Interfaz de solo lectura

**Características técnicas:**
- Filtrado en API: solo retorna coches visibles públicamente
- Reutiliza componentes de mapa de ColeJUY
- Marca visual El Urbano: color rojo principal (#e53935)

## Arquitectura API

### Endpoints

#### `POST /api/urbano/ping`
**Propósito:** Recibir actualizaciones de GPS desde la app del chofer

**Payload:**
```json
{
  "cocheId": "string",
  "lat": number,
  "lng": number,
  "timestamp": "ISO8601",
  "turnoId": "string",
  "choferToken": "string"
}
```

#### `GET /api/urbano/fleet?mode=inspector`
**Propósito:** Obtener toda la flota para el panel del inspector

**Respuesta:**
```json
{
  "coches": [
    {
      "id": "string",
      "linea": "string",
      "lastPing": { "lat": number, "lng": number, "timestamp": "ISO8601" },
      "visibleEnColejuy": boolean,
      "chofer": "string"
    }
  ]
}
```

#### `GET /api/urbano/fleet?mode=public`
**Propósito:** Obtener solo coches visibles para vista pública

**Respuesta:**
```json
{
  "coches": [
    {
      "id": "string",
      "linea": "string",
      "lastPing": { "lat": number, "lng": number, "timestamp": "ISO8601" }
    }
  ]
}
```

#### `PATCH /api/urbano/coche/:id/linea`
**Propósito:** Asignar o reasignar un coche a una línea

**Payload:**
```json
{
  "linea": "string",
  "inspectorToken": "string"
}
```

#### `PATCH /api/urbano/coche/:id/visibilidad`
**Propósito:** Controlar visibilidad pública del coche

**Payload:**
```json
{
  "visibleEnColejuy": boolean,
  "inspectorToken": "string"
}
```

## Almacenamiento de Datos

### Redis
- **Clave por coche:** `urbano:coche:{cocheId}:latest`
- **Estructura:** Hash con `lat`, `lng`, `timestamp`, `linea`, `visibleEnColejuy`, `chofer`
- **TTL:** Configurable (ej: 24 horas)
- **Propósito:** Acceso rápido a última ubicación conocida sin consultar DB

### Base de Datos (Persistencia)
- Histórico de pings para análisis
- Configuración de coches, líneas, choferes
- Gestión de turnos

## Autenticación

**Modelo de token compartido:**
- `choferToken`: Token asignado a cada chofer para autenticar pings
- `inspectorToken`: Token administrativo para operaciones del panel inspector
- Tokens validados en cada request
- NO se implementan flujos OAuth complejos en esta fase

## Identidad de Marca

**El Urbano:**
- Color principal: Rojo `#e53935`
- Logo y elementos visuales propios de la empresa
- Reutilización de componentes de mapa de ColeJUY con tema personalizado

## Integración con ColeJUY

### Componentes a Reutilizar de `FrancoDuran23/colejuy`
- Componentes visuales de mapa (React)
- Lógica de tracking y actualización en tiempo real
- Arquitectura de WebSocket/polling para actualizaciones live
- Utilidades de geolocalización

### NO se Desarrolla
- Mapa desde cero
- Sistema de tracking nuevo
- Componentes visuales ya existentes en ColeJUY

**Importante:** Este repositorio (`colejuy-urbano`) contiene el código de El Urbano. Solo se CITAN paths del repo `colejuy` para referencia; NO se modifica ese repositorio.

## Fases de Implementación

### Fase 1: Documentación y Arquitectura ✓
- Definición de alcance (este documento)
- Documentación técnica de GPS en Expo
- Análisis de riesgos

### Fase 2: Backend API
- Implementación de endpoints
- Configuración de Redis
- Autenticación con tokens

### Fase 3: App del Chofer (Expo)
- GPS en background
- Envío de pings
- UI de turno y estado

### Fase 4: Panel Inspector
- Lista de coches
- Asignación de líneas
- Control de visibilidad
- Integración de mapa (reutilizar ColeJUY)

### Fase 5: Vista Pública
- Mapa público filtrado
- Branding El Urbano
- Integración con ColeJUY

## Exclusiones Explícitas

**NO incluido en este proyecto:**
- Despliegue a producción (esta fase)
- Gestión de secrets en este repositorio (se documentan variables necesarias)
- Modificaciones al repositorio `FrancoDuran23/colejuy`
- Sistema de pagos o facturación
- App para pasajeros (solo vista web pública)
- Funcionalidades de chat o notificaciones push (fase futura)

## Referencias

- Repo de componentes reutilizables: `FrancoDuran23/colejuy`
- Documentación técnica GPS: [./EXPO_GPS.md](./EXPO_GPS.md)
- Análisis de riesgos: [./RIESGOS.md](./RIESGOS.md)
