# El Urbano - Sistema de Rastreo de Transporte Público

Sistema de rastreo en tiempo real para la flota de colectivos de El Urbano, compuesto por una aplicación móvil para choferes y un panel web para inspectores.

## Arquitectura del Proyecto

Este es un monorepo que contiene:

- **apps/driver** - Aplicación Expo/React Native para choferes (Android first)
- **apps/inspector** - Panel web Next.js para inspectores
- **packages/shared** - Tipos TypeScript compartidos
- **docs/** - Documentación técnica del proyecto

## Componentes

### 1. App del Chofer (Expo)

Aplicación móvil que permite a los choferes:

- ✅ Iniciar/finalizar turno de trabajo
- ✅ Rastreo GPS continuo en segundo plano
- ✅ Toggle de disponibilidad
- ✅ Visualización de número de coche y línea asignada
- ✅ Envío automático de coordenadas al servidor cada 15 segundos o 50 metros

**Características técnicas:**
- GPS en background con `expo-location` y `expo-task-manager`
- Notificación persistente durante el turno (Android foreground service)
- Cola offline para pings no enviados (AsyncStorage)
- Color de marca: Rojo `#e53935`

### 2. Panel del Inspector (Next.js)

Aplicación web para que los inspectores gestionen la flota:

- ✅ Lista de todos los coches con estado GPS
- ✅ Asignación/reasignación de coche → línea
- ✅ Control de visibilidad pública (checkbox `visibleEnColejuy`)
- ✅ Vista de mapa en tiempo real (componentes reutilizados de ColeJUY)
- ✅ Estadísticas de flota activa

**Mapa:**
El mapa reutiliza componentes visuales de `FrancoDuran23/colejuy`:
- `BusMap.tsx` - Sistema de renderizado con MapLibre
- `motion.ts` - Animación fluida entre lecturas GPS
- Íconos de bus direccionales (8 orientaciones)

Archivos copiados/adaptados:
```
/workspace/colejuy/src/lib/motion.ts → apps/inspector/src/lib/motion.ts
/workspace/colejuy/public/bus/*.png → apps/inspector/public/bus/
```

## Cómo Ejecutar

### Requisitos Previos

- Node.js 18+ y npm
- Para la app móvil: Expo CLI o Expo Go app en el dispositivo
- Para desarrollo Android: Android Studio con SDK configurado

### Instalación

```bash
# Instalar dependencias del monorepo
npm install

# Instalar dependencias de cada app
cd apps/driver && npm install
cd ../inspector && npm install
```

### Ejecutar la App del Chofer

```bash
# Desde la raíz del proyecto
npm run driver

# O directamente
cd apps/driver
npm start
```

**Nota:** Para probar el GPS en background, usar un dispositivo físico.

### Ejecutar el Panel Inspector

```bash
# Desde la raíz del proyecto
npm run inspector

# O directamente
cd apps/inspector
npm run dev
```

El panel estará disponible en `http://localhost:3000`

## Documentación Técnica

Ver la carpeta `docs/` para documentación detallada:

- **[SCOPE.md](./docs/SCOPE.md)** - Alcance completo del proyecto, endpoints API, arquitectura
- **[design.md](./docs/design.md)** - Diseño de UI, componentes reutilizados, paleta de colores
- **[EXPO_GPS.md](./docs/EXPO_GPS.md)** - Implementación técnica del GPS en background
- **[RIESGOS.md](./docs/RIESGOS.md)** - Análisis de riesgos y estrategias de mitigación

## Identidad Visual

**El Urbano:**
- Color principal: Rojo `#e53935`
- Íconos de bus: Adaptados de ColeJUY (marca roja)
- Mapa: Reutiliza componentes visuales de ColeJUY con tema personalizado

## Limitaciones Actuales

Esta es una implementación **scaffold usable** para desarrollo. Para producción, implementar:

1. **Backend API real** - Los endpoints están documentados pero no implementados
2. **Autenticación robusta** - Reemplazar tokens placeholder
3. **Mapa completo** - Integrar MapLibre GL en el inspector
4. **Testing** - Pruebas en dispositivos físicos con GPS real

⚠️ **NO modificar repositorio ColeJUY:** Los componentes fueron copiados, no importados directamente.

---

**Desarrollado para El Urbano - Sistema de Transporte Público**  
Brand color: #e53935 (Rojo Urbano)
