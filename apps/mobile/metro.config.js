// Desde SDK 52, expo/metro-config detecta el monorepo (npm workspaces) automáticamente:
// no hace falta configurar watchFolders ni nodeModulesPaths a mano.
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
