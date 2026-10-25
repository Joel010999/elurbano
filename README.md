# El Urbano (`colejuy-urbano`)

Chofer GPS (Expo) + panel inspector + API de flota. Brand rojo `#e53935`. El mapa del inspector **reusa** visuales de ColeJUY (`BusMap`, íconos, motion) — no inventar otro mapa.

Repo aparte de `FrancoDuran23/colejuy`. Sin merge a colejuy.

## Estructura

```
api/urbano/          # ping, fleet, assign línea, visibilidad
lib/                 # auth + redis (Upstash o in-memory)
apps/driver/         # Expo chofer (GPS fondo, coche, línea, disponible)
apps/inspector/      # lista coches + assign + visibleEnColejuy + mapa
packages/shared/     # tipos compartidos
docs/                # SCOPE, design, EXPO_GPS, RIESGOS
```

## API (local)

```bash
cp .env.example .env   # tokens de demo; sin secrets reales en git
npm install
npm run dev:api        # vercel dev → http://localhost:3000
npm run test:api       # smoke
```

Endpoints: `POST /api/urbano/ping`, `GET /api/urbano/fleet?mode=inspector|public`, `PATCH /api/urbano/coche/:id/linea`, `PATCH /api/urbano/coche/:id/visibilidad`.

## Apps

```bash
npm run driver       # Expo
npm run inspector    # Next.js inspector
```

Ver `docs/SCOPE.md` y `docs/design.md`.
