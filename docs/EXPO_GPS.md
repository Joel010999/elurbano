# GPS del chofer

**Expo Go:** el rastreo en segundo plano (`expo-task-manager` / `startLocationUpdatesAsync`) cierra la app. El turno usa `watchPositionAsync` en primer plano, cada ~5 segundos, con la app abierta. El resto de esta nota describe el esquema de background para un build nativo futuro; no lo actives en Expo Go.

# GPS en segundo plano (referencia, no usar en Expo Go)

## Descripción General

Este documento detalla la implementación de rastreo GPS en segundo plano para la aplicación del chofer de El Urbano, construida con Expo/React Native.

## Requisitos de Background Location

### Permisos Necesarios

**iOS:**
```xml
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
<key>NSLocationWhenInUseUsageDescription</key>
<string>El Urbano necesita tu ubicación para rastrear el recorrido del colectivo</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>El Urbano necesita tu ubicación incluso en segundo plano para el seguimiento continuo del servicio</string>
```

**Android:**
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

## Implementación con Expo Location

### Dependencias

```json
{
  "expo-location": "~17.0.0",
  "expo-task-manager": "~12.0.0"
}
```

### Configuración en app.json

```json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "El Urbano necesita tu ubicación para rastrear el recorrido del colectivo.",
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true
        }
      ]
    ]
  }
}
```

## Implementación de Código

### 1. Definición de Task de Background

```typescript
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const LOCATION_TASK_NAME = 'urbano-background-location';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Error en background location task:', error);
    return;
  }
  
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];
    
    if (location) {
      await enviarPingAlServidor({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        timestamp: new Date(location.timestamp).toISOString(),
        accuracy: location.coords.accuracy,
      });
    }
  }
});
```

### 2. Inicio de Tracking al Comenzar Turno

```typescript
async function iniciarRastreoGPS(cocheId: string, turnoId: string, choferToken: string) {
  // 1. Solicitar permisos
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  
  if (foregroundStatus !== 'granted') {
    throw new Error('Permiso de ubicación denegado');
  }
  
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  
  if (backgroundStatus !== 'granted') {
    console.warn('Permiso de ubicación en segundo plano no otorgado');
    // Continuar con tracking solo en foreground
  }
  
  // 2. Verificar si ya está corriendo
  const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  
  if (isTaskRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  
  // 3. Iniciar tracking en background
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000, // 15 segundos
    distanceInterval: 50, // 50 metros
    foregroundService: {
      notificationTitle: 'El Urbano - Turno Activo',
      notificationBody: `Rastreando recorrido - Coche ${cocheId}`,
      notificationColor: '#e53935',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true, // iOS
  });
  
  // Guardar contexto en AsyncStorage para la task
  await guardarContextoTurno({ cocheId, turnoId, choferToken });
}
```

### 3. Envío de Pings al Servidor

```typescript
async function enviarPingAlServidor(gpsData: {
  lat: number;
  lng: number;
  timestamp: string;
  accuracy?: number | null;
}) {
  try {
    // Obtener contexto guardado
    const contexto = await obtenerContextoTurno();
    
    if (!contexto) {
      console.error('No hay turno activo');
      return;
    }
    
    const response = await fetch('https://api.elurbano.com/api/urbano/ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${contexto.choferToken}`,
      },
      body: JSON.stringify({
        cocheId: contexto.cocheId,
        turnoId: contexto.turnoId,
        lat: gpsData.lat,
        lng: gpsData.lng,
        timestamp: gpsData.timestamp,
        accuracy: gpsData.accuracy,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    // Guardar última sincronización exitosa
    await guardarUltimoEnvio(gpsData.timestamp);
    
  } catch (error) {
    console.error('Error enviando ping:', error);
    // Guardar en cola local para retry
    await encolarPingFallido(gpsData);
  }
}
```

### 4. Detener Tracking al Finalizar Turno

```typescript
async function detenerRastreoGPS() {
  const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  
  if (isTaskRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  
  // Limpiar contexto
  await limpiarContextoTurno();
  
  // Intentar enviar pings pendientes antes de cerrar
  await procesarColaDePings();
}
```

## Gestión de Conectividad

### Cola de Pings Offline

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const PING_QUEUE_KEY = 'urbano:ping_queue';

async function encolarPingFallido(ping: PingData) {
  try {
    const queue = await obtenerColaPings();
    queue.push({ ...ping, queuedAt: Date.now() });
    
    // Limitar a últimos 100 pings
    const limited = queue.slice(-100);
    
    await AsyncStorage.setItem(PING_QUEUE_KEY, JSON.stringify(limited));
  } catch (error) {
    console.error('Error encolando ping:', error);
  }
}

async function procesarColaDePings() {
  try {
    const queue = await obtenerColaPings();
    
    if (queue.length === 0) return;
    
    // Enviar en batch
    const response = await fetch('https://api.elurbano.com/api/urbano/ping/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${contexto.choferToken}`,
      },
      body: JSON.stringify({ pings: queue }),
    });
    
    if (response.ok) {
      // Limpiar cola exitosa
      await AsyncStorage.removeItem(PING_QUEUE_KEY);
    }
    
  } catch (error) {
    console.error('Error procesando cola:', error);
  }
}
```

## Optimización de Batería

### Estrategias de Ahorro

1. **Accuracy adaptativa:**
```typescript
// En ciudad: mayor precisión pero menos frecuencia
accuracy: Location.Accuracy.Balanced,
timeInterval: 15000,

// En autopista: menor precisión pero más frecuencia (velocidad alta)
accuracy: Location.Accuracy.Low,
timeInterval: 10000,
```

2. **Detección de movimiento:**
```typescript
// Pausar tracking si el coche está detenido por >5 minutos
pausesUpdatesAutomatically: true, // iOS
// Android: implementar lógica manual con isMoving flag
```

3. **Foreground Service (Android):**
- Requerido para Android 8+
- Muestra notificación persistente
- Evita que el SO mate el proceso

## Monitoreo y Debug

### Logs de Desarrollo

```typescript
if (__DEV__) {
  // Log cada update de location
  console.log('[GPS]', {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy,
    speed: location.coords.speed,
  });
}
```

### Indicadores en UI

```typescript
// Mostrar estado de GPS en la app
<StatusBar>
  {gpsActivo && <Text>📍 GPS Activo</Text>}
  {ultimoEnvio && <Text>Último ping: {formatTime(ultimoEnvio)}</Text>}
  {pingsEnCola > 0 && <Text>⚠️ {pingsEnCola} pings pendientes</Text>}
</StatusBar>
```

## Consideraciones de Producción

### 1. Gestión de Energía
- Advertir al chofer que mantenga el dispositivo cargado
- Sugerir configuración de "No optimizar batería" para la app

### 2. Fallback sin Background Permission
- Si el usuario niega permiso de background, tracking solo en foreground
- Solicitar mantener app abierta durante turno

### 3. Límites de Rate
- API debe validar que no se envíen más de 4 pings/minuto
- Implementar throttling en cliente

### 4. Precisión de GPS
- Filtrar coordenadas con accuracy > 100 metros
- Ignorar pings con coordenadas (0, 0)

### 5. Testing
```typescript
// Simular ubicaciones para testing
if (__DEV__) {
  await Location.setMockLocationAsync({
    coords: {
      latitude: -34.6037,
      longitude: -58.3816,
      altitude: 25,
      accuracy: 10,
      heading: 90,
      speed: 8.33, // 30 km/h
    },
    timestamp: Date.now(),
  });
}
```

## Troubleshooting Común

### iOS
- **"Location updates paused"**: Verificar `pausesUpdatesAutomatically: false`
- **Tracking se detiene**: Asegurar que `showsBackgroundLocationIndicator: true`

### Android
- **Foreground service killed**: Implementar notificación persistente correctamente
- **Doze mode**: Agregar app a whitelist de optimización de batería

## Referencias

- [Expo Location Docs](https://docs.expo.dev/versions/latest/sdk/location/)
- [Expo TaskManager Docs](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [Android Background Location Limits](https://developer.android.com/about/versions/oreo/background-location-limits)
- [iOS Background Execution](https://developer.apple.com/documentation/corelocation/getting_the_user_s_location/handling_location_events_in_the_background)
