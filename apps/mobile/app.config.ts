import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extiende app.json según la variante de build (SECURITY.md §4):
 * `usesCleartextTraffic` solo fuera de producción, para hablar con la API local por HTTP.
 * APP_VARIANT lo fija eas.json en cada perfil.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const isProduction = process.env.APP_VARIANT === 'production';
  const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
  if (isProduction && !apiUrl.startsWith('https://')) {
    // SECURITY.md §4 / SEC-06: nunca generar un build de producción apuntando a HTTP.
    throw new Error('Build de producción: define EXPO_PUBLIC_API_BASE_URL con https:// (variable de entorno de EAS).');
  }
  const plugins = (config.plugins ?? []).filter((p) => p !== 'expo-build-properties');
  plugins.push(['expo-build-properties', { android: { usesCleartextTraffic: !isProduction } }]);
  return {
    ...config,
    name: config.name ?? 'EcoMove Querétaro',
    slug: config.slug ?? 'ecomove-queretaro',
    plugins,
  };
};
