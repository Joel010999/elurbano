const appJson = require('./app.json');

module.exports = {
  ...appJson.expo,
  owner: 'joel010999',
  plugins: [...(appJson.expo.plugins || []), 'expo-web-browser'],
  extra: {
    ...(appJson.expo.extra || {}),
    apiUrl: process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_URBANO_API_BASE || 'https://elurbano-production.up.railway.app',
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
    eas: {
      projectId: '48aae92f-a227-4f69-a75f-41bae75b850c',
    },
  },
};
