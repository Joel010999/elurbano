import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, Switch, Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_TASK_NAME = 'urbano-background-location';
const TURNO_CONTEXT_KEY = 'urbano:turno_context';
const PING_QUEUE_KEY = 'urbano:ping_queue';

// Definir la tarea de background GPS
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
        accuracy: location.coords.accuracy || 0,
      });
    }
  }
});

interface PingData {
  lat: number;
  lng: number;
  timestamp: string;
  accuracy: number;
}

interface TurnoContext {
  cocheId: string;
  turnoId: string;
  choferToken: string;
  linea: string;
}

async function enviarPingAlServidor(gpsData: PingData) {
  try {
    const contextStr = await AsyncStorage.getItem(TURNO_CONTEXT_KEY);

    if (!contextStr) {
      console.error('No hay turno activo');
      return;
    }

    const contexto: TurnoContext = JSON.parse(contextStr);

    // EXPO_PUBLIC_URBANO_API_BASE = tunnel o host local (sin slash final)
    const API_BASE = (process.env.EXPO_PUBLIC_URBANO_API_BASE || '').replace(/\/$/, '');
    if (!API_BASE) {
      console.error('Falta EXPO_PUBLIC_URBANO_API_BASE');
      throw new Error('API base no configurada');
    }
    const API_URL = `${API_BASE}/api/urbano/ping`;

    const response = await fetch(API_URL, {
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
        choferToken: contexto.choferToken,
        linea: contexto.linea,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    console.log('Ping enviado exitosamente');

  } catch (error) {
    console.error('Error enviando ping:', error);
    // Guardar en cola local para retry
    await encolarPingFallido(gpsData);
  }
}

async function encolarPingFallido(ping: PingData) {
  try {
    const queueStr = await AsyncStorage.getItem(PING_QUEUE_KEY);
    const queue = queueStr ? JSON.parse(queueStr) : [];
    queue.push({ ...ping, queuedAt: Date.now() });

    // Limitar a últimos 100 pings
    const limited = queue.slice(-100);

    await AsyncStorage.setItem(PING_QUEUE_KEY, JSON.stringify(limited));
  } catch (error) {
    console.error('Error encolando ping:', error);
  }
}

export default function App() {
  const [turnoActivo, setTurnoActivo] = useState(false);
  const [disponible, setDisponible] = useState(true);
  const [cocheNumero, setCocheNumero] = useState('101');
  const [linea, setLinea] = useState('A');
  const [ultimoPing, setUltimoPing] = useState<string | null>(null);
  const [gpsActivo, setGpsActivo] = useState(false);

  useEffect(() => {
    // Cargar estado del turno al iniciar
    cargarEstadoTurno();
  }, []);

  async function cargarEstadoTurno() {
    const contextStr = await AsyncStorage.getItem(TURNO_CONTEXT_KEY);
    if (contextStr) {
      const context: TurnoContext = JSON.parse(contextStr);
      setTurnoActivo(true);
      setCocheNumero(context.cocheId);
      setLinea(context.linea);
      setGpsActivo(true);
    }
  }

  async function iniciarTurno() {
    try {
      // Solicitar permisos
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

      if (foregroundStatus !== 'granted') {
        Alert.alert('Permiso Denegado', 'Se necesita acceso a la ubicación para iniciar el turno');
        return;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

      if (backgroundStatus !== 'granted') {
        Alert.alert(
          'Permiso Limitado',
          'El rastreo solo funcionará mientras la app esté abierta. Para rastreo continuo, otorga permiso "Siempre".'
        );
      }

      // Verificar si ya está corriendo
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);

      if (isTaskRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      // Guardar contexto del turno
      const turnoContext: TurnoContext = {
        cocheId: cocheNumero,
        turnoId: `turno_${Date.now()}`,
        choferToken: 'demo_token_123', // TODO: Obtener token real
        linea: linea,
      };

      await AsyncStorage.setItem(TURNO_CONTEXT_KEY, JSON.stringify(turnoContext));

      // Iniciar tracking en background
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15000, // 15 segundos
        distanceInterval: 50, // 50 metros
        foregroundService: {
          notificationTitle: 'El Urbano - Turno Activo',
          notificationBody: `Rastreando recorrido - Coche ${cocheNumero}`,
          notificationColor: '#e53935',
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      });

      setTurnoActivo(true);
      setGpsActivo(true);
      Alert.alert('Turno Iniciado', 'El rastreo GPS está activo');

    } catch (error) {
      console.error('Error iniciando turno:', error);
      Alert.alert('Error', 'No se pudo iniciar el turno');
    }
  }

  async function finalizarTurno() {
    try {
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);

      if (isTaskRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      await AsyncStorage.removeItem(TURNO_CONTEXT_KEY);

      setTurnoActivo(false);
      setGpsActivo(false);
      Alert.alert('Turno Finalizado', 'El rastreo GPS se ha detenido');

    } catch (error) {
      console.error('Error finalizando turno:', error);
      Alert.alert('Error', 'No se pudo finalizar el turno');
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.title}>El Urbano - Chofer</Text>
        <Text style={styles.subtitle}>Sistema de Rastreo</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Número de Coche</Text>
        <Text style={styles.value}>{cocheNumero}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Línea Asignada</Text>
        <Text style={styles.value}>{linea}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Disponible</Text>
          <Switch
            value={disponible}
            onValueChange={setDisponible}
            trackColor={{ false: '#ccc', true: '#e53935' }}
            thumbColor={disponible ? '#fff' : '#f4f3f4'}
            disabled={!turnoActivo}
          />
        </View>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Estado del GPS</Text>
        <Text style={gpsActivo ? styles.statusActive : styles.statusInactive}>
          {gpsActivo ? '📍 GPS Activo' : '🚫 GPS Inactivo'}
        </Text>
        {ultimoPing && (
          <Text style={styles.statusDetail}>Último ping: {ultimoPing}</Text>
        )}
      </View>

      <View style={styles.actions}>
        {!turnoActivo ? (
          <Button
            title="INICIAR TURNO"
            onPress={iniciarTurno}
            color="#e53935"
          />
        ) : (
          <Button
            title="FINALIZAR TURNO"
            onPress={finalizarTurno}
            color="#666"
          />
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Durante el turno, el GPS envía tu ubicación cada 15 segundos o 50 metros
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e53935',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  value: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  statusActive: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  statusInactive: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#999',
  },
  statusDetail: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  actions: {
    marginBottom: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
