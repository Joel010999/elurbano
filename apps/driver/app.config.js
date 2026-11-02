const appJson = require('./app.json');

// Permitir que el owner y el projectId de EAS se definan por variables de entorno
// para que cualquier desarrollador (Franco o colaboradores) pueda compilar con su propia cuenta Expo EAS.
const owner = process.env.EXPO_OWNER || process.env.EAS_OWNER || appJson.expo.owner || undefined;
const easProjectId = process.env.EAS_PROJECT_ID || process.env.EXPO_PUBLIC_EAS_PROJECT_ID || appJson.expo.extra?.eas?.projectId || undefined;

const extra = {
  ...(appJson.expo.extra || {}),
  apiUrl: process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_URBANO_API_BASE || 'https://colejuy-urbano.vercel.app',
  googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
};

if (easProjectId) {
  extra.eas = { projectId: easProjectId };
}

const config = {
  ...appJson.expo,
  plugins: [...(appJson.expo.plugins || []), 'expo-web-browser'],
  extra,
};

if (owner) {
  config.owner = owner;
}

module.exports = config;
