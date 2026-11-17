import { errorResponse, forward, sessionResponse } from "@/lib/bff";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import { loginSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return errorResponse(403, "FORBIDDEN", "Solicitud rechazada");
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(422, "VALIDATION_ERROR", "Correo o contraseña con formato inválido");
  return sessionResponse(await forward("/auth/login", parsed.data, request));
}
