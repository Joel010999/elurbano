import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import catalogoLocal from './data/muni-lines.json';
import {
  ApiError,
  API_BASE,
  type Colectivo,
  type MuniLine,
  type Sesion,
  listarColectivos,
  listarLineas,
  loginClave,
  loginGoogle,
  mensajeError,
} from './src/api';
import { LoginScreen } from './src/LoginScreen';
import { NumeroCoche } from './src/NumeroCoche';
import { BRAND, INK } from './src/theme';

const SESION_KEY = 'urbano:sesion';
const TURNO_CONTEXT_KEY = 'urbano:turno_context';
const PREFS_KEY = 'urbano:prefs';
const PING_QUEUE_KEY = 'urbano:ping_queue';
const GPS_MS = 5000;
const COCHE_ID = /^[A-Za-z0-9_-]{1,32}$/;

interface PingData {
  lat: number;
  lng: number;
  timestamp: string;
  accuracy: number;
}

interface TurnoContext {
  cocheId: string;
  numero: string;
  patente: string;
  turnoId: string;
  choferToken: string;
  linea: string;
  lineaId: string;
  disponible: boolean;
}

interface Prefs {
  cocheId?: string;
  lineaId?: string;
  disponible?: boolean;
}

const CATALOGO_INICIAL = catalogoLocal as MuniLine[];

function aSesionGuardada(raw: string | null): Sesion | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Sesion>;
    if (!data || data.rol !== 'chofer' || typeof data.token !== 'string' || !data.token.trim()) return null;
    return {
      token: data.token.trim(),
      id: typeof data.id === 'string' ? data.id : '',
      identificador: typeof data.identificador === 'string' ? data.identificador : 'chofer',
      rol: 'chofer',
    };
  } catch {
    return null;
  }
}

function aTurno(raw: string | null): TurnoContext | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<TurnoContext>;
    if (!data || typeof data.cocheId !== 'string' || !data.cocheId) return null;
    if (typeof data.choferToken !== 'string' || !data.choferToken) return null;
    return {
      cocheId: data.cocheId,
      numero: typeof data.numero === 'string' && data.numero ? data.numero : data.cocheId,
      patente: typeof data.patente === 'string' ? data.patente : '',
      turnoId: typeof data.turnoId === 'string' && data.turnoId ? data.turnoId : `turno_${Date.now()}`,
      choferToken: data.choferToken,
      linea: typeof data.linea === 'string' ? data.linea : '',
      lineaId: typeof data.lineaId === 'string' && data.lineaId ? data.lineaId : (data.linea || ''),
      disponible: data.disponible !== false,
    };
  } catch {
    return null;
  }
}

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
  const [listo, setListo] = useState(false);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [lineas, setLineas] = useState<MuniLine[]>(CATALOGO_INICIAL);
  const [colectivos, setColectivos] = useState<Colectivo[]>([]);
  const [cargandoCoches, setCargandoCoches] = useState(false);
  const [recargaCoches, setRecargaCoches] = useState(0);
  const [cocheId, setCocheId] = useState('');
  const [numero, setNumero] = useState('');
  const [patente, setPatente] = useState('');
  const [lineaId, setLineaId] = useState(CATALOGO_INICIAL[0]?.id ?? '');
  const [turnoActivo, setTurnoActivo] = useState(false);
  const [disponible, setDisponible] = useState(true);
  const [ultimoPing, setUltimoPing] = useState<string | null>(null);
  const [gpsActivo, setGpsActivo] = useState(false);
  const [elegirLinea, setElegirLinea] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef(0);
  const ctxRef = useRef<TurnoContext | null>(null);
  const gpsGen = useRef(0);
  const sesionRef = useRef<Sesion | null>(null);
  const iniciandoRef = useRef(false);
  sesionRef.current = sesion;

  const linea = lineas.find((l) => l.id === lineaId) ?? lineas.find((l) => l.number === lineaId) ?? lineas[0];
  const colectivo = colectivos.find((c) => c.id === cocheId) ?? null;
  const numeroVisible = colectivo?.numero || numero;
  const patenteVisible = colectivo?.patente || patente;

  useEffect(() => {
    let vivo = true;
    void (async () => {
      let retomar = false;
      try {
        const remotas = await listarLineas();
        if (vivo && remotas) setLineas(remotas);
      } catch {
        // Queda el catálogo municipal empaquetado.
      }
      try {
        const [sesionStr, contextStr, prefsStr] = await Promise.all([
          AsyncStorage.getItem(SESION_KEY),
          AsyncStorage.getItem(TURNO_CONTEXT_KEY),
          AsyncStorage.getItem(PREFS_KEY),
        ]);
        if (!vivo) return;
        const guardada = aSesionGuardada(sesionStr);
        const turno = aTurno(contextStr);
        const prefs = prefsStr ? (JSON.parse(prefsStr) as Prefs) : null;
        const activa = guardada ?? (turno
          ? { token: turno.choferToken, id: '', identificador: 'chofer', rol: 'chofer' as const }
          : null);
        if (activa) setSesion(activa);
        if (typeof prefs?.disponible === 'boolean') setDisponible(prefs.disponible);
        if (prefs?.lineaId) setLineaId(prefs.lineaId);
        if (prefs?.cocheId) setCocheId(prefs.cocheId);
        if (turno) {
          ctxRef.current = { ...turno, choferToken: activa?.token || turno.choferToken };
          setTurnoActivo(true);
          setCocheId(turno.cocheId);
          setNumero(turno.numero);
          setPatente(turno.patente);
          setLineaId(turno.lineaId || turno.linea);
          setDisponible(turno.disponible);
          retomar = true;
        }
      } catch (err) {
        if (vivo) setError(mensajeError(err, 'No se pudo retomar el turno'));
      } finally {
        if (vivo) setListo(true);
      }
      if (!vivo || !retomar) return;
      try {
        await arrancarGps(false);
      } catch (err) {
        if (!vivo) return;
        setGpsActivo(false);
        setError(mensajeError(err, 'No se pudo retomar el GPS'));
      }
    })();
    return () => {
      vivo = false;
      pararReloj();
    };
    // El turno se retoma una sola vez al abrir la app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sesion || turnoActivo) return;
    let vivo = true;
    setCargandoCoches(true);
    void listarColectivos(sesion.token)
      .then((lista) => {
        if (!vivo) return;
        setColectivos(lista);
        setCocheId((actual) => {
          if (actual && lista.some((c) => c.id === actual)) return actual;
          return lista.length === 1 ? lista[0].id : '';
        });
        setError(null);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        if (err instanceof ApiError && err.status === 401) {
          void salir();
          setLoginError('La sesión venció. Entrá de nuevo.');
          return;
        }
        setError(mensajeError(err, 'No se pudieron cargar los colectivos'));
      })
      .finally(() => {
        if (vivo) setCargandoCoches(false);
      });
    return () => {
      vivo = false;
    };
  }, [sesion, turnoActivo, recargaCoches]);

  function pararReloj() {
    gpsGen.current += 1;
    watchRef.current?.remove();
    watchRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function guardarPrefs(parcial: Prefs) {
    const prev = await AsyncStorage.getItem(PREFS_KEY);
    const base = prev ? JSON.parse(prev) : {};
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ ...base, ...parcial }));
  }

  async function guardarSesion(valor: Sesion) {
    await AsyncStorage.setItem(SESION_KEY, JSON.stringify(valor));
    setSesion(valor);
    setLoginError(null);
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
      setError(mensajeError(err, 'No se pudo enviar el GPS'));
      await encolarPingFallido(gps);
    }
  }

  async function arrancarGps(actualizarLinea: boolean) {
    pararReloj();
    const token = gpsGen.current;
    const primer = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (gpsGen.current !== token) return;
    await enviar(primer, actualizarLinea);
    if (gpsGen.current !== token) return;
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: GPS_MS,
        distanceInterval: 0,
      },
      (loc) => {
        void enviar(loc, false);
      },
    );
    if (gpsGen.current !== token) {
      sub.remove();
      return;
    }
    watchRef.current = sub;
    timerRef.current = setInterval(() => {
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((loc) => enviar(loc, false))
        .catch((err) => console.error(err));
    }, GPS_MS);
    setGpsActivo(true);
  }

  async function entrar(tarea: () => Promise<Sesion>) {
    setOcupado(true);
    setLoginError(null);
    try {
      await guardarSesion(await tarea());
    } catch (err) {
      setLoginError(mensajeError(err, 'No se pudo entrar'));
    } finally {
      setOcupado(false);
    }
  }

  async function iniciarTurno() {
    if (iniciandoRef.current) return;
    const elegido = colectivos.find((c) => c.id === cocheId);
    if (!elegido) {
      Alert.alert('Coche', 'Elegí un colectivo de la lista.');
      return;
    }
    if (!COCHE_ID.test(elegido.id)) {
      Alert.alert('Coche', 'El id de este colectivo no entra en el ping (máximo 32).');
      return;
    }
    if (!linea) {
      Alert.alert('Línea', 'Elegí una línea del catálogo.');
      return;
    }
    const token = sesionRef.current?.token;
    if (!token) {
      setLoginError('Entrá de nuevo para iniciar el turno.');
      setSesion(null);
      return;
    }
    iniciandoRef.current = true;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso', 'Hace falta la ubicación con la app abierta.');
        return;
      }
      const ctx: TurnoContext = {
        cocheId: elegido.id,
        numero: elegido.numero,
        patente: elegido.patente,
        turnoId: `turno_${Date.now()}`,
        choferToken: token,
        linea: linea.number,
        lineaId: linea.id,
        disponible,
      };
      ctxRef.current = ctx;
      await arrancarGps(true);
      await AsyncStorage.setItem(TURNO_CONTEXT_KEY, JSON.stringify(ctx));
      await guardarPrefs({ cocheId: elegido.id, lineaId: linea.id, disponible });
      setNumero(elegido.numero);
      setPatente(elegido.patente);
      setTurnoActivo(true);
      setGpsActivo(true);
      setError(null);
    } catch (err) {
      console.error(err);
      pararReloj();
      ctxRef.current = null;
      await AsyncStorage.removeItem(TURNO_CONTEXT_KEY);
      setGpsActivo(false);
      Alert.alert('Error', 'No se pudo iniciar el turno');
    } finally {
      iniciandoRef.current = false;
    }
  }

  async function finalizarTurno() {
    pararReloj();
    ctxRef.current = null;
    await AsyncStorage.removeItem(TURNO_CONTEXT_KEY);
    setTurnoActivo(false);
    setGpsActivo(false);
    setUltimoPing(null);
    setError(null);
  }

  async function salir() {
    await finalizarTurno();
    await AsyncStorage.removeItem(SESION_KEY);
    setSesion(null);
    setColectivos([]);
    setError(null);
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

  function elegirColectivo(item: Colectivo) {
    setCocheId(item.id);
    setNumero(item.numero);
    setPatente(item.patente);
    void guardarPrefs({ cocheId: item.id });
  }

  if (!listo) {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <View style={styles.bootLetrero}>
          <Text style={styles.bootLetreroTxt}>EL URBANO</Text>
        </View>
        <Text style={styles.bootFirma}>Chofer</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerTxt}>
          <Text style={styles.title}>El Urbano</Text>
          <Text style={styles.subtitle}>
            {sesion ? `Chofer · ${sesion.identificador}` : 'Chofer'}
          </Text>
        </View>
        {sesion ? (
          <Pressable onPress={() => void salir()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.salir}>Salir</Text>
          </Pressable>
        ) : null}
      </View>

      {!sesion ? (
        <LoginScreen
          ocupado={ocupado}
          error={loginError}
          onClave={(usuario, clave) => void entrar(() => loginClave(usuario, clave))}
          onGoogle={(idToken) => entrar(() => loginGoogle(idToken))}
        />
      ) : turnoActivo ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <NumeroCoche numero={numeroVisible} patente={patenteVisible} />
          <View style={styles.card}>
            <Text style={styles.label}>Línea</Text>
            <Text style={styles.valor}>{linea ? `${linea.number} · ${linea.name}` : 'Sin línea'}</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Disponible</Text>
              <Switch
                value={disponible}
                onValueChange={(v) => void cambiarDisponible(v)}
                trackColor={{ false: '#ccc', true: BRAND }}
                thumbColor={disponible ? '#fff' : '#f4f3f4'}
              />
            </View>
          </View>
          <View style={styles.statusCard}>
            <Text style={gpsActivo ? styles.statusActive : styles.statusInactive}>
              {gpsActivo ? 'GPS en primer plano' : 'GPS inactivo'}
            </Text>
            {ultimoPing ? <Text style={styles.statusDetail}>Último ping: {ultimoPing}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
          <Pressable onPress={() => void finalizarTurno()} style={styles.accionOff} accessibilityRole="button">
            <Text style={styles.accionTxt}>Finalizar turno</Text>
          </Pressable>
          <Text style={styles.footerText}>
            El GPS sale cada 5 segundos mientras la app está abierta. En Expo Go no uses el rastreo de fondo.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <NumeroCoche numero={numeroVisible} patente={patenteVisible} />
          <Text style={styles.bloque}>Colectivo</Text>
          {cargandoCoches ? <ActivityIndicator color={BRAND} style={styles.carga} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!cargandoCoches && colectivos.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.vacio}>{error ? 'No se pudo leer la flota.' : 'No hay colectivos activos.'}</Text>
              <Pressable onPress={() => setRecargaCoches((n) => n + 1)} style={styles.reintentar} accessibilityRole="button">
                <Text style={styles.reintentarTxt}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            colectivos.map((item) => {
              const on = item.id === cocheId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => elegirColectivo(item)}
                  style={[styles.coche, on && styles.cocheOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <NumeroCoche numero={item.numero} compacto />
                  <View style={styles.cocheTxt}>
                    <Text style={styles.cocheNum}>Coche {item.numero}</Text>
                    <Text style={styles.cochePatente}>{item.patente || 'Sin patente'}</Text>
                  </View>
                </Pressable>
              );
            })
          )}

          <Text style={styles.bloque}>Línea</Text>
          <Pressable onPress={() => setElegirLinea(true)} style={styles.lineaBtn} accessibilityRole="button">
            <Text style={styles.lineaTxt}>{linea ? `${linea.number} · ${linea.name}` : 'Elegir línea'}</Text>
          </Pressable>

          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Disponible</Text>
              <Switch
                value={disponible}
                onValueChange={(v) => void cambiarDisponible(v)}
                trackColor={{ false: '#ccc', true: BRAND }}
                thumbColor={disponible ? '#fff' : '#f4f3f4'}
              />
            </View>
          </View>

          <Pressable onPress={() => void iniciarTurno()} style={styles.accionOn} accessibilityRole="button">
            <Text style={styles.accionTxt}>Iniciar turno</Text>
          </Pressable>
        </ScrollView>
      )}

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
                  accessibilityRole="button"
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
  boot: {
    flex: 1,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  bootLetrero: {
    alignSelf: 'stretch',
    backgroundColor: '#f7f4f2',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: INK,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bootLetreroTxt: { color: '#c62828', fontWeight: '900', fontSize: 28, letterSpacing: 2 },
  bootFirma: { color: '#fff', fontStyle: 'italic', fontWeight: '700', fontSize: 26, marginTop: 16 },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 60,
    borderTopWidth: 8,
    borderTopColor: BRAND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTxt: { flex: 1 },
  title: { fontSize: 28, fontWeight: 'bold', color: BRAND },
  subtitle: { fontSize: 16, color: '#666', marginTop: 2 },
  salir: { color: BRAND, fontWeight: '700', fontSize: 16 },
  scroll: { paddingBottom: 28 },
  bloque: { fontSize: 14, color: '#666', marginTop: 16, marginBottom: 8 },
  card: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#f0d0d0',
  },
  label: { fontSize: 14, color: '#666' },
  valor: { fontSize: 16, fontWeight: '600', color: INK, marginTop: 4 },
  carga: { marginVertical: 12 },
  vacio: { color: '#666', fontSize: 15 },
  reintentar: { marginTop: 12, alignSelf: 'flex-start' },
  reintentarTxt: { color: BRAND, fontWeight: '700' },
  coche: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0d0d0',
    padding: 10,
    marginBottom: 8,
  },
  cocheOn: { borderColor: BRAND, borderWidth: 2, backgroundColor: '#fff5f5' },
  cocheTxt: { flex: 1 },
  cocheNum: { fontSize: 18, fontWeight: '800', color: INK },
  cochePatente: { fontSize: 13, color: '#666', marginTop: 2, letterSpacing: 0.4 },
  lineaBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  lineaTxt: { fontSize: 16, fontWeight: '600', color: INK },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 10,
    marginTop: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  statusActive: { fontSize: 18, fontWeight: 'bold', color: '#2e7d32' },
  statusInactive: { fontSize: 18, fontWeight: 'bold', color: '#999' },
  statusDetail: { fontSize: 12, color: '#666', marginTop: 6 },
  error: { color: BRAND, marginTop: 8, textAlign: 'center' },
  accionOn: { backgroundColor: BRAND, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  accionOff: { backgroundColor: '#555', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  accionTxt: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  footerText: { fontSize: 12, color: '#777', textAlign: 'center', marginTop: 16 },
  modal: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 56, borderTopWidth: 8, borderTopColor: BRAND },
  lineaItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  lineaItemOn: { backgroundColor: BRAND },
  lineaItemTxt: { fontSize: 16, color: INK },
  lineaItemTxtOn: { color: '#fff', fontWeight: '700' },
});
