import { z } from "zod";
import { LIMITS, POI_CATEGORIES, ROLES } from "@ecomove/shared";

/**
 * Validación de FORMATO para UX (AGENTS §2.2). La API vuelve a validar todo; aquí no hay
 * reglas de negocio.
 */
const email = z.string().trim().toLowerCase().min(1, "Ingresa tu correo").email("Correo no válido").max(254);

/** Política de SECURITY.md §1: ≥ 8, al menos una letra y un número, máx. 128. */
export const passwordPolicy = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `Mínimo ${LIMITS.PASSWORD_MIN} caracteres`)
  .max(LIMITS.PASSWORD_MAX, `Máximo ${LIMITS.PASSWORD_MAX} caracteres`)
  .regex(/\p{L}/u, "Incluye al menos una letra")
  .regex(/\d/, "Incluye al menos un número");

const fullName = z.string().trim().min(2, "Ingresa tu nombre").max(LIMITS.FULL_NAME_MAX);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Ingresa tu contraseña").max(LIMITS.PASSWORD_MAX),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Cuerpo exacto de RegisterRequest (lo que reenvía el BFF). */
export const registerRequestSchema = z.object({ email, password: passwordPolicy, full_name: fullName }).strict();

/** Formulario de registro: añade confirmación y aviso de privacidad (solo UX). */
export const registerFormSchema = z
  .object({
    full_name: fullName,
    email,
    password: passwordPolicy,
    confirm_password: z.string(),
    accept_privacy: z.boolean().refine((v) => v, "Debes aceptar el aviso de privacidad"),
  })
  .refine((d) => d.password === d.confirm_password, { path: ["confirm_password"], message: "Las contraseñas no coinciden" });
export type RegisterFormInput = z.infer<typeof registerFormSchema>;

export const profileSchema = z.object({ full_name: fullName });
export type ProfileInput = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Ingresa tu contraseña actual"),
    new_password: passwordPolicy,
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, { path: ["confirm_password"], message: "Las contraseñas no coinciden" })
  .refine((d) => d.new_password !== d.current_password, { path: ["new_password"], message: "La nueva contraseña debe ser distinta" });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Formulario de POI (estaciones/infraestructura). Coordenadas en formato, no en negocio. */
export const poiFormSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(160),
  category: z.enum(POI_CATEGORIES),
  description: z.string().trim().max(1000).optional(),
  lat: z.coerce.number<number>().min(-90).max(90, "Latitud inválida"),
  lng: z.coerce.number<number>().min(-180).max(180, "Longitud inválida"),
  capacity: z.union([z.literal(""), z.coerce.number<number>().int().min(0).max(10_000)]).optional(),
  /** §5.1: código oficial asignado por un administrador; único entre paradas (409 CONFLICT). */
  code: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/, "2 a 32 caracteres: A-Z, 0-9, _ o -")]).optional(),
  /** §5.1: líneas separadas por comas, ≤ 50 de ≤ 32 caracteres. */
  lines: z
    .string()
    .optional()
    .refine((v) => !v || splitLines(v).length <= 50, "Máximo 50 líneas")
    .refine((v) => !v || splitLines(v).every((l) => l.length <= 32), "Cada línea admite hasta 32 caracteres"),
  is_active: z.boolean(),
});

export function splitLines(v: string): string[] {
  return v.split(",").map((l) => l.trim()).filter(Boolean);
}
export type PoiFormInput = z.infer<typeof poiFormSchema>;

export const emissionFactorSchema = z.object({
  grams_per_km: z.coerce.number<number>().min(0, "No puede ser negativo").max(2000, "Valor fuera de rango"),
});
export type EmissionFactorInput = z.infer<typeof emissionFactorSchema>;

export const roleSchema = z.enum(ROLES);

export const emailRequestSchema = z.object({ email });
export type EmailRequestInput = z.infer<typeof emailRequestSchema>;

export const resetPasswordSchema = z
  .object({ new_password: passwordPolicy, confirm_password: z.string() })
  .refine((d) => d.new_password === d.confirm_password, { path: ["confirm_password"], message: "Las contraseñas no coinciden" });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Token de un solo uso de los enlaces de correo (≥ 256 bits, URL-safe). Solo formato. */
export const oneTimeTokenSchema = z.string().min(16).max(512).regex(/^[A-Za-z0-9_\-.~]+$/);

export const citizenReportSchema = z.object({
  category: z.enum(["BIKE_LANE_DAMAGE", "MISSING_INFRASTRUCTURE", "SAFETY", "POI_ISSUE", "OTHER"]),
  title: z.string().trim().min(3, "Mínimo 3 caracteres").max(120),
  description: z.string().trim().max(2000, "Máximo 2000 caracteres"),
});
export type CitizenReportInput = z.infer<typeof citizenReportSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(5, "Explica el motivo (mínimo 5 caracteres)").max(500) });
export type ReasonInput = z.infer<typeof reasonSchema>;

export const preferencesSchema = z.object({
  language: z.enum(["es", "en"]),
  default_mode: z.string(),
  default_vehicle_type: z.string(),
  weekly_goal_trips: z.union([z.literal(""), z.coerce.number<number>().int().min(1, "Mínimo 1").max(100, "Máximo 100")]),
  email_notifications: z.boolean(),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Ingresa tu contraseña"),
  confirm: z.literal("ELIMINAR", { error: "Escribe ELIMINAR para confirmar" }),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
