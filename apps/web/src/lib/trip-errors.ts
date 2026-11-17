import { ApiError } from "@ecomove/shared";
import { errorMessage } from "@/hooks/useApiQuery";

/** Mensajes de las validaciones de negocio de viajes (contrato §4.1, §4.3, §12). */
export function tripErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return "No hay conexión con la API.";
  switch (e.code) {
    case "TRIP_DUPLICATE":
      return "Ya tienes un viaje completado en ese medio que se cruza con este horario.";
    case "ROUTE_TOKEN_INVALID":
      return "La ruta calculada caducó o no corresponde al medio elegido. Vuelve a calcularla.";
    case "TRIP_OUTSIDE_SERVICE_AREA":
      return "El origen o el destino está fuera del área de servicio (zona metropolitana de Querétaro).";
    case "TRIP_IMPLAUSIBLE_SPEED":
      return "La duración no es creíble para ese medio y esa distancia. Revisa las horas.";
    case "TRIP_TOO_SHORT":
      return "El viaje es demasiado corto para registrarse.";
    case "MODE_INACTIVE":
      return "Ese medio de transporte está desactivado por ahora.";
    case "ROUTE_NOT_FOUND":
      return "No encontramos una ruta entre esos puntos para el medio elegido.";
    case "ROUTING_UNAVAILABLE":
      return "El cálculo de rutas no está disponible ahora. Inténtalo en unos minutos.";
    default:
      return errorMessage(e);
  }
}
