import { errorResponse, forward, sessionResponse } from "@/lib/bff";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import { registerRequestSchema } from "@/lib/validation/schemas";

/** POST /auth/register devuelve TokenPair (contrato §2): el usuario queda con sesión iniciada. */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return errorResponse(403, "FORBIDDEN", "Solicitud rechazada");
  const parsed = registerRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(422, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Datos inválidos");
  return sessionResponse(await forward("/auth/register", parsed.data, request), 201);
}
