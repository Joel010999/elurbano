#!/usr/bin/env node

/**
 * Smoke test for El Urbano API
 * Tests all endpoints with sample data
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CHOFER_TOKEN = process.env.URBANO_CHOFER_TOKEN || 'chofer-token-example';
const INSPECTOR_TOKEN = process.env.URBANO_INSPECTOR_TOKEN || 'inspector-token-example';
const VEEDOR_TOKEN = process.env.URBANO_VEEDOR_TOKEN || 'veedor-token-example';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function test(name, fn) {
  try {
    await fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    return true;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.error(`  ${error.message}`);
    return false;
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  return { status: response.status, data };
}

async function statusOf(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function runTests() {
  console.log(`\n${YELLOW}Running El Urbano API Smoke Tests${RESET}\n`);
  console.log(`Base URL: ${BASE_URL}\n`);

  const results = [];

  // Test 1: POST /api/urbano/ping
  results.push(await test('POST /api/urbano/ping - save GPS location', async () => {
    const { data } = await request('/api/urbano/ping', {
      method: 'POST',
      body: JSON.stringify({
        cocheId: 'coche-001',
        lat: -34.6037,
        lng: -58.3816,
        timestamp: new Date().toISOString(),
        turnoId: 'turno-mañana',
        choferToken: CHOFER_TOKEN,
      }),
    });

    if (!data.success) throw new Error('Ping failed');
  }));

  // Test 2: POST another ping with different coche
  results.push(await test('POST /api/urbano/ping - save second coche', async () => {
    const { data } = await request('/api/urbano/ping', {
      method: 'POST',
      body: JSON.stringify({
        cocheId: 'coche-002',
        lat: -34.6137,
        lng: -58.3916,
        timestamp: new Date().toISOString(),
        turnoId: 'turno-mañana',
        choferToken: CHOFER_TOKEN,
      }),
    });

    if (!data.success) throw new Error('Ping failed');
  }));

  // Test 3: PATCH /api/urbano/coche/:id/linea
  results.push(await test('PATCH /api/urbano/coche/coche-001/linea - assign line', async () => {
    const { data } = await request('/api/urbano/coche/coche-001/linea', {
      method: 'PATCH',
      body: JSON.stringify({
        linea: '1',
        inspectorToken: INSPECTOR_TOKEN,
      }),
    });

    if (!data.success) throw new Error('Failed to assign line');
  }));

  // Test 4: PATCH /api/urbano/coche/:id/visibilidad - set visible
  results.push(await test('PATCH /api/urbano/coche/coche-001/visibilidad - set visible', async () => {
    const { data } = await request('/api/urbano/coche/coche-001/visibilidad', {
      method: 'PATCH',
      body: JSON.stringify({
        visibleEnColejuy: true,
        inspectorToken: INSPECTOR_TOKEN,
      }),
    });

    if (!data.success) throw new Error('Failed to set visibility');
  }));

  // Test 5: PATCH second coche visibility - set NOT visible
  results.push(await test('PATCH /api/urbano/coche/coche-002/visibilidad - set not visible', async () => {
    const { data } = await request('/api/urbano/coche/coche-002/visibilidad', {
      method: 'PATCH',
      body: JSON.stringify({
        visibleEnColejuy: false,
        inspectorToken: INSPECTOR_TOKEN,
      }),
    });

    if (!data.success) throw new Error('Failed to set visibility');
  }));

  // Test 6: GET /api/urbano/fleet?mode=inspector
  results.push(await test('GET /api/urbano/fleet?mode=inspector - get all coches', async () => {
    const { data } = await request('/api/urbano/fleet?mode=inspector', {
      headers: { Authorization: `Bearer ${INSPECTOR_TOKEN}` },
    });

    if (!data.coches || !Array.isArray(data.coches)) {
      throw new Error('Invalid response format');
    }

    if (data.coches.length < 2) {
      throw new Error(`Expected at least 2 coches, got ${data.coches.length}`);
    }

    const coche001 = data.coches.find(c => c.id === 'coche-001');
    if (!coche001) throw new Error('coche-001 not found');
    if (coche001.linea !== '1') throw new Error(`Linea not updated: ${coche001.linea}`);
    if (coche001.visibleEnColejuy !== true) throw new Error('Visibility not updated');
  }));

  // Test 7: GET /api/urbano/fleet?mode=public
  results.push(await test('GET /api/urbano/fleet?mode=public - get only visible coches', async () => {
    const { data } = await request('/api/urbano/fleet?mode=public');

    if (!data.coches || !Array.isArray(data.coches)) {
      throw new Error('Invalid response format');
    }

    // Should only have 1 visible coche (coche-001)
    if (data.coches.length !== 1) {
      throw new Error(`Expected 1 visible coche, got ${data.coches.length}`);
    }

    if (data.coches[0].id !== 'coche-001') {
      throw new Error('Wrong coche returned for public view');
    }

    // Public view should not expose sensitive data
    if (data.coches[0].chofer !== undefined) {
      throw new Error('Chofer data should not be in public view');
    }
  }));

  // Test 8: Invalid auth
  results.push(await test('POST /api/urbano/ping - reject invalid token', async () => {
    try {
      await request('/api/urbano/ping', {
        method: 'POST',
        body: JSON.stringify({
          cocheId: 'coche-003',
          lat: -34.6037,
          lng: -58.3816,
          timestamp: new Date().toISOString(),
          turnoId: 'turno-tarde',
          choferToken: 'invalid-token',
        }),
      });
      throw new Error('Should have rejected invalid token');
    } catch (error) {
      if (!error.message.includes('401')) {
        throw new Error('Expected 401 unauthorized');
      }
    }
  }));

  results.push(await test('GET /api/urbano/lineas - catálogo municipal', async () => {
    const { data } = await request('/api/urbano/lineas');
    if (!Array.isArray(data.lineas) || !data.lineas.some((l) => l.id === 'muni-l001')) {
      throw new Error('Catálogo municipal ausente');
    }
  }));

  results.push(await test('GET fleet inspector sin token - 401', async () => {
    const { status } = await statusOf('/api/urbano/fleet?mode=inspector');
    if (status !== 401) throw new Error(`Expected 401, got ${status}`);
  }));

  results.push(await test('GET fleet inspector como veedor - 200', async () => {
    const { data } = await request('/api/urbano/fleet?mode=inspector', {
      headers: { Authorization: `Bearer ${VEEDOR_TOKEN}` },
    });
    if (!Array.isArray(data.coches)) throw new Error('Sin flota');
  }));

  results.push(await test('PATCH linea como veedor - solo lectura', async () => {
    const { status, data } = await statusOf('/api/urbano/coche/coche-001/linea', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${VEEDOR_TOKEN}` },
      body: JSON.stringify({ linea: '7' }),
    });
    if (status !== 403) throw new Error(`Expected 403, got ${status} ${JSON.stringify(data)}`);
  }));

  results.push(await test('PATCH visibilidad como veedor - solo lectura', async () => {
    const { status } = await statusOf('/api/urbano/coche/coche-001/visibilidad', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${VEEDOR_TOKEN}` },
      body: JSON.stringify({ visibleEnColejuy: false }),
    });
    if (status !== 403) throw new Error(`Expected 403, got ${status}`);
  }));

  results.push(await test('PATCH linea fuera de catálogo - 400', async () => {
    const { status } = await statusOf('/api/urbano/coche/coche-001/linea', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${INSPECTOR_TOKEN}` },
      body: JSON.stringify({ linea: 'Línea A' }),
    });
    if (status !== 400) throw new Error(`Expected 400, got ${status}`);
  }));

  results.push(await test('ABM usuarios - veedor no entra', async () => {
    const { status } = await statusOf('/api/urbano/usuarios', {
      headers: { Authorization: `Bearer ${VEEDOR_TOKEN}` },
    });
    if (status !== 403) throw new Error(`Expected 403, got ${status}`);
  }));

  const smokeId = `smoke-${Date.now().toString(36)}`;
  let creadoId = '';
  results.push(await test('ABM usuarios - inspector crea chofer', async () => {
    const { status, data } = await statusOf('/api/urbano/usuarios', {
      method: 'POST',
      headers: { Authorization: `Bearer ${INSPECTOR_TOKEN}` },
      body: JSON.stringify({ identificador: smokeId, rol: 'chofer', token: `${smokeId}-token` }),
    });
    if (status !== 201) throw new Error(`Expected 201, got ${status} ${JSON.stringify(data)}`);
    creadoId = data.usuario && data.usuario.id;
    if (!creadoId) throw new Error('Sin id');
  }));

  results.push(await test('POST ping con chofer creado en ABM', async () => {
    const { data } = await request('/api/urbano/ping', {
      method: 'POST',
      headers: { Authorization: `Bearer ${smokeId}-token` },
      body: JSON.stringify({
        cocheId: 'coche-smoke',
        lat: -24.1858,
        lng: -65.2995,
        timestamp: new Date().toISOString(),
        turnoId: 'turno-smoke',
        actualizarLinea: true,
        linea: '14',
      }),
    });
    if (!data.success) throw new Error('Ping del chofer nuevo falló');
  }));

  results.push(await test('ABM usuarios - editar y baja', async () => {
    const edit = await statusOf(`/api/urbano/usuarios/${creadoId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${INSPECTOR_TOKEN}` },
      body: JSON.stringify({ identificador: `${smokeId}-edit` }),
    });
    if (edit.status !== 200) throw new Error(`PATCH ${edit.status}`);
    const del = await statusOf(`/api/urbano/usuarios/${creadoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${INSPECTOR_TOKEN}` },
    });
    if (del.status !== 200) throw new Error(`DELETE ${del.status}`);
  }));

  results.push(await test('POST ping del chofer dado de baja - 401', async () => {
    const { status } = await statusOf('/api/urbano/ping', {
      method: 'POST',
      headers: { Authorization: `Bearer ${smokeId}-token` },
      body: JSON.stringify({
        cocheId: 'coche-smoke',
        lat: -24.18,
        lng: -65.29,
        timestamp: new Date().toISOString(),
        turnoId: 'turno-smoke',
      }),
    });
    if (status !== 401) throw new Error(`Expected 401, got ${status}`);
  }));

  results.push(await test('GET sesion veedor', async () => {
    const { data } = await request('/api/urbano/sesion', {
      headers: { Authorization: `Bearer ${VEEDOR_TOKEN}` },
    });
    if (data.rol !== 'veedor') throw new Error(`Rol ${data.rol}`);
  }));

  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\n${YELLOW}Results:${RESET} ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log(`${GREEN}All tests passed!${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${RED}Some tests failed${RESET}\n`);
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error(`${RED}Fatal error:${RESET}`, error);
  process.exit(1);
});
