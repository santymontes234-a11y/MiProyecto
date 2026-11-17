# Android: APK de pruebas y AAB de producción

App: `apps/mobile` (Expo SDK 58, React Native). Ya configurado en el repositorio:

| Elemento | Valor | Archivo |
|---|---|---|
| Nombre | **EcoMove Querétaro** | `app.json` |
| Paquete | `mx.ecomove.queretaro` | `app.json` (no lo cambies tras publicar) |
| Icono | `assets/icon.png` + icono adaptativo (fondo `#16A34A`, monocromo) | `app.json` |
| Splash | `assets/splash-icon.png` sobre verde `#16A34A` (oscuro `#111827`) | plugin `expo-splash-screen` |
| Permisos | ubicación en uso e Internet; bloqueados ubicación en segundo plano y micrófono | `app.json` |
| HTTP en claro | solo en `development`/`preview`; **prohibido** en `production` | `app.config.ts` |
| Versión | `version` en `app.json` (0.1.0); `versionCode` remoto y autoincremental en EAS | `eas.json` |

## URL de la API de producción

La app lee `EXPO_PUBLIC_API_BASE_URL` **al compilar**. Con `APP_VARIANT=production`:

- `app.config.ts` **se niega a compilar** si la URL no empieza por `https://`.
- `src/lib/config.ts` lanza un error al arrancar si la URL no es HTTPS.

Valor: `https://api.midominio.mx/api/v1` (el mismo `API_DOMAIN` de `.env.production`). La API debe estar
desplegada con un certificado válido antes de repartir el APK.

## Perfiles de `eas.json`

| Perfil | Salida | API | Uso |
|---|---|---|---|
| `development` | APK con dev client | `http://10.0.2.2:8000` (emulador) | Desarrollo |
| `preview` | APK interno | variable del entorno EAS `preview` (puede ser HTTP de la LAN o un staging HTTPS) | Pruebas internas |
| `production-apk` | **APK** firmado, variante producción | variable del entorno EAS `production` (HTTPS) | Probar la versión de producción en teléfonos reales |
| `production` | **AAB** (Android App Bundle) | variable del entorno EAS `production` (HTTPS) | Google Play (no se publica automáticamente) |

## Opción A — EAS Build (recomendada)

Compila en la nube de Expo, gestiona el keystore de firma y no necesita Android Studio.

```bash
npm i -g eas-cli            # o usa npx eas-cli@latest
eas login                   # cuenta propietaria del proyecto (app.json → "owner")
cd apps/mobile

# 1) Variable de la API (una sola vez por entorno). Es pública (va dentro del APK): no es un secreto.
eas env:create --environment production --name EXPO_PUBLIC_API_BASE_URL \
  --value https://api.midominio.mx/api/v1 --visibility plaintext
# Opcional: tiles propios
# eas env:create --environment production --name EXPO_PUBLIC_TILE_URL --value 'https://...' --visibility plaintext
eas env:list --environment production

# 2) Builds (desde la raíz del repo, con los scripts del workspace)
cd ../..
npm run build:apk:prod-api -w @ecomove/mobile    # APK de pruebas con la API de producción
npm run build:aab -w @ecomove/mobile             # AAB de producción
npm run build:apk -w @ecomove/mobile             # APK "preview"
```

Al terminar, EAS muestra un enlace/QR para descargar el APK o AAB desde expo.dev.

- **Keystore:** en el primer build de producción EAS ofrece generarlo y lo guarda. Descárgalo y guárdalo en un lugar
  seguro (`eas credentials` → Android → Download keystore). **Si se pierde, no podrás actualizar la app en Google Play**
  (salvo con Play App Signing).
- `owner` y `extra.eas.projectId` de `app.json` deben corresponder a la cuenta de Expo del propietario. Si cambias de
  cuenta: borra `projectId`, ejecuta `eas init` y vuelve a crear las variables.
- Workflow opcional `.github/workflows/android-build.yml` (manual, deshabilitado): requiere
  `ANDROID_BUILD_ENABLED=true` y el secreto `EXPO_TOKEN`. Nunca ejecuta `eas submit`.

## Opción B — Build local (Android Studio / SDK)

Requiere JDK 17, Android SDK (`ANDROID_HOME`) y ~10 GB libres.

```bash
cd apps/mobile
export APP_VARIANT=production EXPO_PUBLIC_APP_VARIANT=production
export EXPO_PUBLIC_API_BASE_URL=https://api.midominio.mx/api/v1
npx expo prebuild --platform android --clean      # genera android/ (ignorado por Git)
cd android
./gradlew assembleRelease     # APK → app/build/outputs/apk/release/app-release.apk
./gradlew bundleRelease       # AAB → app/build/outputs/bundle/release/app-release.aab
```

El proyecto generado firma `release` con la **clave de depuración**: sirve para probar, **no** para Google Play.
Para Play, crea tu keystore (`keytool -genkeypair -v -storetype PKCS12 -keystore ecomove-release.keystore -alias ecomove
-keyalg RSA -keysize 2048 -validity 10000`) y configura `signingConfigs.release` en `android/app/build.gradle` con
variables de `~/.gradle/gradle.properties` (nunca en Git).

## Instalar el APK de pruebas

```bash
adb install -r app-release.apk        # o descarga el enlace de EAS en el teléfono
```

En el teléfono hay que permitir «Instalar apps desconocidas» para el navegador o el gestor de archivos.

## Antes de Google Play (no automatizado)

- Política de privacidad pública (la app tiene `/privacy`; publícala también en la web).
- Formulario de seguridad de datos de Play (ubicación, correo, viajes).
- Capturas, descripción, clasificación de contenido.
- Subir el AAB a una pista de **prueba interna** antes de producción.
- Tiles del mapa: los de CARTO tienen condiciones de uso; para tráfico real, contrata un plan o usa un servidor de
  tiles propio (`EXPO_PUBLIC_TILE_URL`).

## Verificado en esta preparación

- `npx expo config` con `APP_VARIANT=production` y URL HTTPS: nombre «EcoMove Querétaro», paquete
  `mx.ecomove.queretaro`, `usesCleartextTraffic: false`.
- Con URL `http://` la configuración de producción falla, como se espera.
- **No** se compiló ningún APK/AAB (este equipo no tiene Android SDK y los builds de EAS se ejecutan en servidores
  externos, fuera del alcance de esta preparación).
