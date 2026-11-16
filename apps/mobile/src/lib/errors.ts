import { ApiError } from '@ecomove/shared';

/**
 * Mensajes de UI para los códigos de error del contrato (API_CONTRACT §0).
 * Comparación exacta: un código fuera del contrato cae al mensaje del servidor y queda visible.
 */
const MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'No pudimos conectar con el servidor. Revisa tu conexión a internet.',
  TIMEOUT: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  EMAIL_ALREADY_REGISTERED: 'Ya existe una cuenta con este correo.',
  USER_INACTIVE: 'Tu cuenta está desactivada. Contacta a soporte.',
  TOKEN_EXPIRED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  TOKEN_INVALID: 'Tu sesión ya no es válida. Inicia sesión de nuevo.',
  UNAUTHORIZED: 'Necesitas iniciar sesión.',
  FORBIDDEN: 'No tienes permiso para realizar esta acción.',
  TRIP_NOT_FOUND: 'Este viaje no existe o fue eliminado.',
  NOT_FOUND: 'No encontramos lo que buscabas.',
  BBOX_TOO_LARGE: 'Acerca el mapa para ver la infraestructura de la zona.',
  RATE_LIMITED: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  VALIDATION_ERROR: 'Revisa los datos ingresados.',
  INTERNAL_ERROR: 'Ocurrió un error en el servidor. Inténtalo más tarde.',
  // 1.1.0
  EMAIL_NOT_VERIFIED: 'Confirma tu correo con el enlace que te enviamos antes de iniciar sesión.',
  RESET_TOKEN_INVALID: 'El enlace para restablecer la contraseña no es válido o caducó. Solicita uno nuevo.',
  VERIFICATION_TOKEN_INVALID: 'El enlace de verificación no es válido o caducó. Solicita uno nuevo.',
  TRIP_OUTSIDE_SERVICE_AREA: 'El trayecto está fuera del área de servicio del estado de Querétaro.',
  TRIP_TOO_SHORT: 'El trayecto es demasiado corto (mínimo 50 m).',
  TRIP_IMPLAUSIBLE_SPEED: 'La velocidad del trayecto no es posible para el medio elegido. Revisa el medio de transporte.',
  MODE_INACTIVE: 'Este medio de transporte no está disponible por ahora. Guardamos tu viaje en el teléfono.',
  TRIP_DUPLICATE: 'Ya registraste un viaje en ese medio y horario.',
  ROUTE_TOKEN_INVALID: 'La ruta planificada caducó. Vuelve a calcularla.',
  ROUTE_NOT_FOUND: 'No encontramos una ruta entre esos puntos para el medio elegido.',
  ROUTING_UNAVAILABLE: 'El cálculo de rutas no está disponible por ahora.',
  PAYLOAD_TOO_LARGE: 'El viaje es demasiado grande para enviarse.',
  NOTIFICATION_NOT_FOUND: 'La notificación ya no existe.',
};

export function errorCode(e: unknown): string | null {
  return e instanceof ApiError ? e.code : null;
}

export function getErrorMessage(e: unknown, fallback = 'Ocurrió un error inesperado.'): string {
  if (e instanceof ApiError) {
    const known = MESSAGES[e.code];
    if (known) return known;
    if (e.status >= 500) return MESSAGES.INTERNAL_ERROR ?? fallback;
    return e.message || fallback;
  }
  return fallback;
}

export const isNetworkError = (e: unknown): boolean => {
  const code = errorCode(e);
  return code === 'NETWORK_ERROR' || code === 'TIMEOUT';
};

interface ValidationDetail {
  loc: (string | number)[];
  msg: string;
}

function isValidationDetail(v: unknown): v is ValidationDetail {
  return typeof v === 'object' && v !== null && Array.isArray((v as ValidationDetail).loc) && typeof (v as ValidationDetail).msg === 'string';
}

/**
 * Extrae errores por campo de un 422 (`details: [{loc: ['body','email'], msg}]`).
 * Devuelve { email: 'msg' }. Los mensajes del servidor se muestran tal cual.
 */
export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_ERROR' || !Array.isArray(e.details)) return out;
  for (const d of e.details) {
    if (!isValidationDetail(d)) continue;
    const field = d.loc.filter((p): p is string => typeof p === 'string' && p !== 'body').at(-1);
    if (field && !out[field]) out[field] = d.msg;
  }
  return out;
}
