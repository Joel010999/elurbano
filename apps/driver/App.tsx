import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import catalogoLocal from './data/muni-lines.json';

const TURNO_CONTEXT_KEY = 'urbano:turno_context';
const PREFS_KEY = 'urbano:prefs';
const PING_QUEUE_KEY = 'urbano:ping_queue';
const API_BASE = (process.env.EXPO_PUBLIC_URBANO_API_BASE || 'https://colejuy-urbano.vercel.app').replace(/\/$/, '');
const TOKEN_INICIAL = process.env.EXPO_PUBLIC_URBANO_CHOFER_TOKEN || 'chofer-token-example';
const GPS_MS = 5000;

type MuniLine = { id: string; number: string; name: string };

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
  lineaId: string;
  disponible: boolean;
}

const CATALOGO_INICIAL = catalogoLocal as MuniLine[];

async function encolarPingFallido(ping: PingData) {
  try {
    const queueStr = await AsyncStorage.getItem(PING_QUEUE_KEY);
    const queue = queueStr ? JSON.parse(queueStr) : [];
    queue.push({ ...ping, queuedAt: Date.now() });
    await AsyncStorage.setItem(PING_QUEUE_KEY, JSON.stringify(queue.slice(-100)));
  } catch (error) {
    console.error('Error encolando ping:', error);
  }
}

export default function App() {
  const [lineas, setLineas] = useState<MuniLine[]>(CATALOGO_INICIAL);
  const [turnoActivo, setTurnoActivo] = useState(false);
  const [disponible, setDisponible] = useState(true);
  const [cocheNumero, setCocheNumero] = useState('101');
  const [lineaId, setLineaId] = useState(CATALOGO_INICIAL[0]?.id ?? '');
  const [token, setToken] = useState(TOKEN_INICIAL);
  const [ultimoPing, setUltimoPing] = useState<string | null>(null);
  const [gpsActivo, setGpsActivo] = useState(false);
  const [elegirLinea, setElegirLinea] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef(0);
  const ctxRef = useRef<TurnoContext | null>(null);

  const linea = lineas.find((l) => l.id === lineaId) ?? lineas.find((l) => l.number === lineaId) ?? lineas[0];

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/urbano/lineas`);
        const data = await response.json();
        if (Array.isArray(data.lineas) && data.lineas.length > 0) setLineas(data.lineas);
      } catch {
        // Queda el catálogo municipal empaquetado.
      }
      const prefsStr = await AsyncStorage.getItem(PREFS_KEY);
      const contextStr = await AsyncStorage.getItem(TURNO_CONTEXT_KEY);
      if (prefsStr && !contextStr) {
        const prefs = JSON.parse(prefsStr) as Partial<TurnoContext> & { token?: string };
        if (prefs.cocheId) setCocheNumero(prefs.cocheId);
        if (prefs.lineaId) setLineaId(prefs.lineaId);
        if (prefs.token) setToken(prefs.token);
        if (typeof prefs.disponible === 'boolean') setDisponible(prefs.disponible);
      }
      if (contextStr) {
        const context = JSON.parse(contextStr) as TurnoContext;
        ctxRef.current = context;
        setTurnoActivo(true);
        setCocheNumero(context.cocheId);
        setLineaId(context.lineaId || context.linea);
        setToken(context.choferToken);
        setDisponible(context.disponible !== false);
        await arrancarGps(false);
      }
    })();
    return () => {
      pararReloj();
    };
    // El turno se retoma una sola vez al abrir la app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pararReloj() {
    watchRef.current?.remove();
    watchRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function guardarPrefs(parcial: Partial<{ cocheId: string; lineaId: string; token: string; disponible: boolean }>) {
    const prev = await AsyncStorage.getItem(PREFS_KEY);
    const base = prev ? JSON.parse(prev) : {};
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...base, ...parcial }));
  }

  async function enviar(loc: Location.LocationObject, actualizarLinea: boolean) {
    const ahora = Date.now();
    if (!actualizarLinea && ahora - lastSentRef.current < GPS_MS - 500) return;
    lastSentRef.current = ahora;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const gps: PingData = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      timestamp: new Date(loc.timestamp).toISOString(),
      accuracy: loc.coords.accuracy || 0,
    };
    try {
      const response = await fetch(`${API_BASE}/api/urbano/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.choferToken}`,
        },
        body: JSON.stringify({
          cocheId: ctx.cocheId,
          turnoId: ctx.turnoId,
          lat: gps.lat,
          lng: gps.lng,
          timestamp: gps.timestamp,
          accuracy: gps.accuracy,
          disponible: ctx.disponible,
          ...(actualizarLinea ? { linea: ctx.linea, actualizarLinea: true } : {}),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
      }
      setUltimoPing(new Date().toLocaleTimeString('es-AR'));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo enviar el GPS';
      setError(message);
      await encolarPingFallido(gps);
    }
  }

  async function arrancarGps(actualizarLinea: boolean) {
    pararReloj();
    const primer = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await enviar(primer, actualizarLinea);
    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: GPS_MS,
        distanceInterval: 0,
      },
      (loc) => {
        void enviar(loc, false);
      },
    );
    timerRef.current = setInterval(() => {
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((loc) => enviar(loc, false))
        .catch((err) => console.error(err));
    }, GPS_MS);
    setGpsActivo(true);
  }

  async function iniciarTurno() {
    const cocheId = cocheNumero.trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(cocheId)) {
      Alert.alert('Coche', 'Usá letras, números o guiones.');
      return;
    }
    if (!linea) {
      Alert.alert('Línea', 'Elegí una línea del catálogo.');
      return;
    }
    if (token.trim().length < 8) {
      Alert.alert('Token', 'El token de chofer es muy corto.');
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso', 'Hace falta la ubicación con la app abierta.');
        return;
      }
      const ctx: TurnoContext = {
        cocheId,
        turnoId: `turno_${Date.now()}`,
        choferToken: token.trim(),
        linea: linea.number,
        lineaId: linea.id,
        disponible,
      };
      ctxRef.current = ctx;
      await AsyncStorage.setItem(TURNO_CONTEXT_KEY, JSON.stringify(ctx));
      await guardarPrefs({ cocheId, lineaId: linea.id, token: token.trim(), disponible });
      await arrancarGps(true);
      setTurnoActivo(true);
      setError(null);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'No se pudo iniciar el turno');
    }
  }

  async function finalizarTurno() {
    pararReloj();
    ctxRef.current = null;
    await AsyncStorage.removeItem(TURNO_CONTEXT_KEY);
    setTurnoActivo(false);
    setGpsActivo(false);
  }

  async function cambiarDisponible(valor: boolean) {
    setDisponible(valor);
    if (ctxRef.current) {
      ctxRef.current = { ...ctxRef.current, disponible: valor };
      await AsyncStorage.setItem(TURNO_CONTEXT_KEY, JSON.stringify(ctxRef.current));
    } else {
      await guardarPrefs({ disponible: valor });
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>El Urbano</Text>
        <Text style={styles.subtitle}>Chofer</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Coche</Text>
        <TextInput
          value={cocheNumero}
          onChangeText={(v) => {
            setCocheNumero(v);
            if (!turnoActivo) void guardarPrefs({ cocheId: v.trim() });
          }}
          editable={!turnoActivo}
          keyboardType="default"
          style={[styles.input, turnoActivo && styles.inputOff]}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Línea</Text>
        <Pressable
          disabled={turnoActivo}
          onPress={() => setElegirLinea(true)}
          style={[styles.input, styles.lineaBtn, turnoActivo && styles.inputOff]}
        >
          <Text style={styles.lineaTxt}>
            {linea ? `${linea.number} · ${linea.name}` : 'Elegir línea'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Token</Text>
        <TextInput
          value={token}
          onChangeText={(v) => {
            setToken(v);
            if (!turnoActivo) void guardarPrefs({ token: v.trim() });
          }}
          editable={!turnoActivo}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, styles.token, turnoActivo && styles.inputOff]}
        />
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Disponible</Text>
          <Switch
            value={disponible}
            onValueChange={(v) => void cambiarDisponible(v)}
            trackColor={{ false: '#ccc', true: '#e53935' }}
            thumbColor={disponible ? '#fff' : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles.statusCard}>
        <Text style={gpsActivo ? styles.statusActive : styles.statusInactive}>
          {gpsActivo ? 'GPS en primer plano' : 'GPS inactivo'}
        </Text>
        {ultimoPing && <Text style={styles.statusDetail}>Último ping: {ultimoPing}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Pressable
        onPress={turnoActivo ? () => void finalizarTurno() : () => void iniciarTurno()}
        style={[styles.accion, turnoActivo ? styles.accionOff : styles.accionOn]}
      >
        <Text style={styles.accionTxt}>{turnoActivo ? 'Finalizar turno' : 'Iniciar turno'}</Text>
      </Pressable>

      <Text style={styles.footerText}>
        El GPS sale cada 5 segundos mientras la app está abierta. En Expo Go no uses el rastreo de fondo.
      </Text>

      <Modal visible={elegirLinea} animationType="slide" onRequestClose={() => setElegirLinea(false)}>
        <View style={styles.modal}>
          <Text style={styles.title}>Línea del turno</Text>
          <FlatList
            data={lineas}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const on = item.id === linea?.id;
              return (
                <Pressable
                  onPress={() => {
                    setLineaId(item.id);
                    void guardarPrefs({ lineaId: item.id });
                    setElegirLinea(false);
                  }}
                  style={[styles.lineaItem, on && styles.lineaItemOn]}
                >
                  <Text style={[styles.lineaItemTxt, on && styles.lineaItemTxtOn]}>
                    {item.number} · {item.name}
                  </Text>
                </Pressable>
              );
            }}
          />
          <Pressable onPress={() => setElegirLinea(false)} style={styles.accionOff}>
            <Text style={styles.accionTxt}>Cerrar</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 60,
    borderTopWidth: 8,
    borderTopColor: '#e53935',
  },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#e53935' },
  subtitle: { fontSize: 16, color: '#666', marginTop: 4 },
  card: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0d0d0',
  },
  label: { fontSize: 14, color: '#666', marginBottom: 6 },
  input: {
    fontSize: 20,
    fontWeight: '600',
    color: '#222',
    borderWidth: 1,
    borderColor: '#e53935',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputOff: { backgroundColor: '#fafafa', color: '#666' },
  token: { fontSize: 14, fontWeight: '500' },
  lineaBtn: { justifyContent: 'center' },
  lineaTxt: { fontSize: 16, fontWeight: '600', color: '#222' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusCard: { backgroundColor: 'white', padding: 16, borderRadius: 10, marginBottom: 16, alignItems: 'center' },
  statusActive: { fontSize: 18, fontWeight: 'bold', color: '#2e7d32' },
  statusInactive: { fontSize: 18, fontWeight: 'bold', color: '#999' },
  statusDetail: { fontSize: 12, color: '#666', marginTop: 6 },
  error: { color: '#e53935', marginTop: 8, textAlign: 'center' },
  accion: { borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  accionOn: { backgroundColor: '#e53935' },
  accionOff: { backgroundColor: '#555', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  accionTxt: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  footerText: { fontSize: 12, color: '#777', textAlign: 'center', marginTop: 16 },
  modal: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 56, borderTopWidth: 8, borderTopColor: '#e53935' },
  lineaItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  lineaItemOn: { backgroundColor: '#e53935' },
  lineaItemTxt: { fontSize: 16, color: '#222' },
  lineaItemTxtOn: { color: '#fff', fontWeight: '700' },
});
