import { Image } from 'react-native';

// Generado desde docs/brand/logo.svg (identidad oficial: BRAND / LOGO_SVG de @ecomove/shared).
const LOGO = require('../../../assets/icon.png') as number;

export function BrandLogo({ size = 56 }: { size?: number }) {
  return <Image source={LOGO} style={{ width: size, height: size, borderRadius: size * 0.28 }} accessibilityLabel="Logotipo de EcoMove Querétaro" />;
}
