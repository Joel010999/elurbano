# El Urbano - Diseño de UI

## Identidad Visual

**Color de marca:** `#e53935` (rojo)  
**Paleta:** Se mantiene el rojo como color primario. NO usar amarillo de ColeJUY en el chrome.

## Arquitectura

El Urbano reutiliza componentes visuales del mapa de colectivos de **FrancoDuran23/colejuy**. El mapa del inspector NO se inventa desde cero.

## Componentes a Reusar de ColeJUY

### 1. Componente Principal del Mapa
**Path:** `src/components/BusMap.tsx`  
**Qué reusar:**
- Sistema de renderizado de buses en movimiento con MapLibre
- Animación de buses (interpolación entre lecturas GPS)
- Íconos de bus direccionales (8 orientaciones: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
- Flecha direccional SDF (chevron que rota con el bearing)
- Sistema de markers personalizados
- Gestión de capas (route, stops, buses)
- Tema claro/oscuro (función `charcoal` para modo oscuro)

### 2. Biblioteca de Movimiento
**Paths:**
- `src/lib/motion.ts` - lógica de extrapolación de movimiento de buses
- `src/lib/route.ts` - manejo de rutas y direcciones

**Qué reusar:**
- `createMotion`, `pushFix`, `stepMotion` - animación fluida entre lecturas GPS
- `heldWithoutSignal` - manejo de buses sin señal reciente
- Lógica de bearing y speed para animación realista

### 3. Íconos de Bus
**Path:** `public/bus/`  
**Archivos a copiar:**
- `bus-0.png` hasta `bus-315.png` (8 direcciones)
- `bus-seen.png` (bus sin señal, gris)

**Adaptación:** Cambiar el color amarillo de los íconos a rojo `#e53935`.

### 4. Estilos del Mapa
**Path:** `src/app/globals.css` (sección de mapa)  
**Buscar:** clases `.map`, `.mk`, `.mk-letter`, `.mk-label`, `.mk-dot`, `.route-legend`

## Pantallas de El Urbano

### A. Pantalla del Chofer
**Función:** Gestión del turno del chofer

**Elementos:**
1. **Header con datos del chofer**
   - Nombre del chofer
   - Número de coche asignado
   - Línea asignada

2. **Estado del turno**
   - Toggle: Disponible / No disponible
   - Botón: Iniciar turno / Finalizar turno

3. **GPS en tiempo real**
   - Indicador de señal GPS activa
   - Coordenadas actuales (lat/lng)
   - Timestamp de última actualización

4. **Información del coche**
   - Patente
   - Estado mecánico (opcional)

**Color principal:** Rojo `#e53935` para botones activos y estados disponibles

---

### B. Pantalla del Inspector
**Función:** Monitoreo y asignación de coches

#### B.1. Lista de Coches
**Elementos:**
- Card por cada coche mostrando:
  - Número de coche
  - Chofer asignado
  - Línea actual (editable)
  - Estado: Disponible / En ruta / Fuera de servicio
  - Última actualización GPS (hace X minutos)

**Acciones:**
- Tap en card → ver detalle del coche
- Botón "Asignar línea" → dropdown con líneas disponibles
- Toggle "ColeJUY" → activar/desactivar integración ColeJUY para ese coche

#### B.2. Mapa en Tiempo Real (REUSADO de ColeJUY)
**Componente base:** `BusMap.tsx` de colejuy

**Adaptaciones necesarias:**
1. **Color de líneas:** Cambiar de amarillo a rojo `#e53935`
2. **Íconos de bus:** Versión roja de los PNG direccionales
3. **Datos a mostrar:**
   - Todos los coches con GPS activo
   - Label: número de coche + línea
   - Color según estado:
     - Rojo `#e53935`: disponible/en ruta
     - Gris `#9e9e9e`: fuera de servicio
     - Amarillo tenue: sin señal reciente (>2 min)

4. **Interacción:**
   - Click en bus → abrir detalle del coche
   - Zoom automático para encuadrar todos los coches activos

**Props a pasar al BusMap adaptado:**
```typescript
{
  theme: "light" | "dark",
  buses: MapBus[], // coches con GPS
  paths: [], // no mostrar rutas fijas
  color: "#e53935",
  stops: [], // no mostrar paradas
  onBus: (cocheId) => abrirDetalleCoche(cocheId)
}
```

#### B.3. Controles del Inspector
- Filtro por línea
- Filtro por estado (todos / disponibles / en ruta / sin servicio)
- Toggle vista: Lista / Mapa

## Stack Técnico Sugerido

- **Mapa:** MapLibre GL (igual que colejuy)
- **Framework:** Next.js + React + TypeScript (igual que colejuy)
- **Estilos:** Tailwind CSS + CSS modules para el mapa
- **GPS:** API nativa del navegador + WebSocket para updates en tiempo real

## Archivos a Copiar/Adaptar

```
colejuy → urbano

src/components/BusMap.tsx → src/components/UrbanoMap.tsx
src/lib/motion.ts → src/lib/motion.ts (sin cambios)
src/lib/route.ts → src/lib/route.ts (adaptar para líneas de El Urbano)
public/bus/*.png → public/bus/*.png (recolorear a rojo)
```

## Notas de Implementación

1. **NO inventar el mapa:** Partir de `BusMap.tsx` existente
2. **Recolorear íconos:** Usar script para cambiar amarillo → rojo en los PNG
3. **Simplificar:** El Urbano no necesita paradas ni rutas dibujadas (solo posición de coches)
4. **Optimizar:** El inspector puede tener 50+ coches en pantalla → probar performance del mapa

## Próximos Pasos (NO implementar todavía)

- [ ] Clonar componentes de colejuy
- [ ] Adaptar colores a rojo `#e53935`
- [ ] Crear pantallas chofer e inspector
- [ ] Integrar GPS real-time
- [ ] Testing de performance con muchos coches
