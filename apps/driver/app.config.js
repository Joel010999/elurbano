const appJson = require('./app.json');
module.exports = {
  ...appJson.expo,
  extra: {
    urbanoApiBase: process.env.EXPO_PUBLIC_URBANO_API_BASE || '',
  },
};
