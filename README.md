# El Urbano (`colejuy-urbano`)

Chofer GPS (Expo) + panel inspector + API de flota. Rojo `#e53935`. El mapa reusa `BusMap` y OpenFreeMap. Repo aparte de `FrancoDuran23/colejuy`. No mergear a colejuy.

## Probar ya

1. Inspector y veedor en local: `npm run dev:api` y, en otra terminal, `npm run inspector` → http://localhost:3001/inspector/ (**Inspector demo** / **Veedor demo**).
2. En el proyecto Vercel `colejuy-urbano`, al desplegar esta rama queda **https://colejuy-urbano.vercel.app/inspector/** (mismo host que la API). El build es `npm run build:web`.
3. Chofer: `cd apps/driver && npx expo start`. Entrá con Google o con `chofer-demo` / `1`, elegí colectivo y línea, y el GPS sale en primer plano cada 5 s (`watchPositionAsync`).
4. Panel: `inspector-token-example` y `veedor-token-example`. Chofer demo: usuario `chofer-demo`, clave `1` (salvo que `URBANO_CHOFER_TOKEN` la reemplace).
5. El veedor solo mira. No asigna línea, no cambia visibilidad y no abre Usuarios. Esos PATCH/POST responden `403 Solo lectura`.

## Probar los tres roles

Tokens de demo (no son secrets de producción):

| Rol | Token | Qué puede |
| --- | --- | --- |
| Chofer | usuario `chofer-demo`, clave `1` | Elegir colectivo y línea, mandar GPS |
| Inspector | `inspector-token-example` | Ver flota, asignar línea, visibilidad, ABM |
| Veedor | `veedor-token-example` | Solo ver la flota |

### Inspector y veedor

En producción, después del deploy de este proyecto Vercel:

**https://colejuy-urbano.vercel.app/inspector/**

El mismo host sirve la API (`/api/urbano/*`) y el panel (`/inspector/`). El panel llama a `NEXT_PUBLIC_URBANO_API_BASE=https://colejuy-urbano.vercel.app`. En la pantalla de entrada: **Inspector demo** o **Veedor demo**.

Local, contra la API de esta máquina:

```bash
cp .env.example .env
npm install
npm run dev:api          # http://localhost:3000
# en otra terminal, el panel apunta a esa API
cd apps/inspector && echo 'NEXT_PUBLIC_URBANO_API_BASE=http://localhost:3000' > .env.local
cd ../.. && npm run inspector
# http://localhost:3001/inspector/
```

El veedor ve coches y el mapa. No asigna línea, no toca visibilidad y no ve Usuarios. Esos POST/PATCH responden `403 Solo lectura`.

La pestaña **Usuarios** (inspector) da de alta chofer, inspector o veedor con identificador y token.

### Chofer (Expo Go)

```bash
cd apps/driver
cp ../../.env.example .env
npx expo start
```

La app entra con Google (`EXPO_PUBLIC_GOOGLE_CLIENT_ID`, el mismo que `GOOGLE_CLIENT_ID`) o con usuario y clave. Demo: `chofer-demo` / `1`. Después se elige un colectivo de `GET /api/urbano/colectivos` y una línea del catálogo municipal. El GPS es en primer plano, cada ~5 s, con `watchPositionAsync`, y el ping manda ese `cocheId` y la línea. Dejá la app abierta. El GPS de fondo cierra Expo Go.

Si no hay `.env`, la app apunta a `https://colejuy-urbano.vercel.app`. `EXPO_PUBLIC_API_URL` la cambia.

## API

```bash
npm run dev:api
npm run test:api
```

`POST /api/urbano/ping` (chofer), `GET /api/urbano/fleet?mode=inspector|public` (inspector y veedor el modo inspector; público sin token), `GET /api/urbano/lineas`, `GET /api/urbano/sesion`, `PATCH /api/urbano/coche/:id/linea`, `PATCH /api/urbano/coche/:id/visibilidad`, `GET|POST /api/urbano/usuarios`, `PATCH|DELETE /api/urbano/usuarios/:id`.

Sin Upstash, flota y usuarios viven en memoria del proceso. Con `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` persisten. Las tres cuentas demo se vuelven a sembrar si faltan.

## Deploy (mismo proyecto Vercel)

`vercel.json` ya deja el build en `npm run build:web` y la salida en `public/`. No hace falta un segundo proyecto: al desplegar este repo en **colejuy-urbano** quedan la API y el panel.

```bash
npm run build:web
# panel estático en public/inspector
```

La raíz redirige a `/inspector/`.
