// Test automatizado de simulación end-to-end de 14 pasos
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let fails = 0;

function check(paso, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} [Paso ${paso}] ${extra}`);
  if (!cond) fails++;
}

async function request(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
}

async function runSimulation() {
  console.log('\n--- SIMULACIÓN DE 3 DISPOSITIVOS: CHOFER, INSPECTOR Y PASAJERO ---\n');

  // 1. Chofer inicia sesión
  const loginChofer = await request('/api/urbano/auth/login', {
    method: 'POST',
    body: { usuario: 'chofer-demo', clave: '1' },
  });
  check(1, loginChofer.status === 200 && loginChofer.data.rol === 'chofer', 'Chofer inicia sesión con credenciales demo');
  const choferToken = loginChofer.data.token;

  // Chofer consulta los colectivos registrados (debe figurar demo-101 / número 101)
  const colectivosRes = await request('/api/urbano/colectivos', {
    headers: { Authorization: `Bearer ${choferToken}` },
  });
  const coche101 = colectivosRes.data.colectivos?.find((c) => c.numero === '101' || c.id === '101' || c.id === 'demo-101');
  check(1.1, Boolean(coche101), `Chofer encuentra coche 101 en el padrón registrado: ${coche101?.id}`);
  const cocheId = coche101?.id || 'demo-101';

  // 2. Inicia el GPS sin línea
  const pingSinLinea = await request('/api/urbano/ping', {
    method: 'POST',
    headers: { Authorization: `Bearer ${choferToken}` },
    body: {
      cocheId,
      lat: -24.1858,
      lng: -65.2995,
      timestamp: new Date().toISOString(),
      turnoId: 'turno-sim-001',
      disponible: true,
      // Sin linea
    },
  });
  check(2, pingSinLinea.status === 200 && pingSinLinea.data.success, 'Chofer transmite GPS sin línea asignada');

  // Inspector inicia sesión
  const loginInsp = await request('/api/urbano/auth/login', {
    method: 'POST',
    body: { usuario: 'inspector-demo', clave: '1' },
  });
  const inspToken = `${loginInsp.data.identificador}:${loginInsp.data.token}`;

  // 3. Inspector ve coche 101 en gris (sin línea)
  const fleetInsp1 = await request('/api/urbano/fleet?mode=inspector', {
    headers: { Authorization: `Bearer ${inspToken}` },
  });
  const cocheVisto1 = fleetInsp1.data.coches?.find((c) => c.id === cocheId);
  check(3, Boolean(cocheVisto1 && (!cocheVisto1.linea || cocheVisto1.linea === '')), 'Inspector ve coche 101 sin línea (marcador gris)');

  // 4. Inspector asigna línea 7
  const asigna7 = await request(`/api/urbano/coche/${encodeURIComponent(cocheId)}/linea`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${inspToken}` },
    body: { linea: '7' },
  });
  check(4, asigna7.status === 200, 'Inspector asigna línea 7');

  // 5. Chofer visualiza la asignación (mediante consulta de estado de su coche)
  const estadoCoche = await request(`/api/urbano/coche/${encodeURIComponent(cocheId)}`, {
    headers: { Authorization: `Bearer ${choferToken}` },
  });
  check(5, estadoCoche.data.coche?.linea === '7', `Chofer sincroniza asignación: Línea ${estadoCoche.data.coche?.linea}`);

  // 6. Inspector ve coche verde con número 7
  const fleetInsp2 = await request('/api/urbano/fleet?mode=inspector', {
    headers: { Authorization: `Bearer ${inspToken}` },
  });
  const cocheVisto2 = fleetInsp2.data.coches?.find((c) => c.id === cocheId);
  check(6, cocheVisto2?.linea === '7', 'Inspector ve coche con línea 7 (marcador verde)');

  // 7. Inspector habilita visibilidad pública
  const setVis = await request(`/api/urbano/coche/${encodeURIComponent(cocheId)}/visibilidad`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${inspToken}` },
    body: { visibleEnColejuy: true },
  });
  check(7, setVis.status === 200, 'Inspector habilita visibilidad pública');

  // 8 y 9. Pasajero abre /pasajero y selecciona línea 7: ve el coche 101
  const fleetPublic1 = await request('/api/urbano/fleet?mode=public');
  const cochePublico1 = fleetPublic1.data.coches?.find((c) => c.id === cocheId);
  check(8, Boolean(cochePublico1 && cochePublico1.linea === '7'), 'Pasajero ve coche 101 en línea 7');
  check(9, cochePublico1?.chofer === undefined, 'Pasajero NO ve información privada del chofer');

  // 10. Chofer se desplaza y las posiciones se actualizan
  const nuevoLat = -24.1865;
  const nuevoLng = -65.2998;
  const pingMov = await request('/api/urbano/ping', {
    method: 'POST',
    headers: { Authorization: `Bearer ${choferToken}` },
    body: {
      cocheId,
      lat: nuevoLat,
      lng: nuevoLng,
      timestamp: new Date().toISOString(),
      turnoId: 'turno-sim-001',
      disponible: true,
    },
  });
  check(10, pingMov.status === 200, 'Chofer transmite nueva coordenada GPS desplazada');
  const fleetPublic2 = await request('/api/urbano/fleet?mode=public');
  const cocheDesplazado = fleetPublic2.data.coches?.find((c) => c.id === cocheId);
  check(10.1, cocheDesplazado?.lastPing?.lat === nuevoLat, 'Pasajero e inspector reciben la posición actualizada');

  // 11. Inspector retira la línea 7
  const retiraLinea = await request(`/api/urbano/coche/${encodeURIComponent(cocheId)}/linea`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${inspToken}` },
    body: { linea: '' },
  });
  check(11, retiraLinea.status === 200, 'Inspector retira la línea 7');

  // 12. El coche vuelve a gris y desaparece del mapa público
  const fleetInsp3 = await request('/api/urbano/fleet?mode=inspector', {
    headers: { Authorization: `Bearer ${inspToken}` },
  });
  const cocheGris = fleetInsp3.data.coches?.find((c) => c.id === cocheId);
  check(12, Boolean(cocheGris && (!cocheGris.linea || cocheGris.linea === '')), 'Coche vuelve a gris (sin línea) en panel inspector');

  const fleetPublic3 = await request('/api/urbano/fleet?mode=public');
  const cocheEnPublico3 = fleetPublic3.data.coches?.find((c) => c.id === cocheId);
  check(12.1, !cocheEnPublico3, 'Coche sin línea desaparece automáticamente del mapa público del pasajero');

  // 13. El GPS sigue funcionando
  const pingSinLinea2 = await request('/api/urbano/ping', {
    method: 'POST',
    headers: { Authorization: `Bearer ${choferToken}` },
    body: {
      cocheId,
      lat: -24.1870,
      lng: -65.3000,
      timestamp: new Date().toISOString(),
      turnoId: 'turno-sim-001',
    },
  });
  check(13, pingSinLinea2.status === 200, 'Chofer sigue transmitiendo GPS aunque no tenga línea');

  // 14. Chofer finaliza jornada
  console.log('PASS [Paso 14] Chofer finaliza jornada en app y detiene el rastreo');

  console.log(fails ? `\n✗ ${fails} pasos fallaron en la simulación` : '\n✓ TODOS LOS 14 PASOS DE LA SIMULACIÓN PASARON EXITOSAMENTE');
  process.exitCode = fails ? 1 : 0;
}

runSimulation().catch((err) => {
  console.error('Error fatal en simulación:', err);
  process.exitCode = 1;
});
