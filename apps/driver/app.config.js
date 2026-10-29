const appJson = require('./app.json');

module.exports = {
  ...appJson.expo,
  plugins: [...(appJson.expo.plugins || []), 'expo-web-browser'],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_URBANO_API_BASE || 'https://elurbano-production.up.railway.app',
    googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '',
  },
};
