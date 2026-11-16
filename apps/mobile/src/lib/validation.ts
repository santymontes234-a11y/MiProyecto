import { LIMITS } from '@ecomove/shared';

/**
 * Validaciones de FORMATO para UX (AGENTS.md §2.2). La API vuelve a validar todo.
 * Cada validador devuelve un mensaje de error o null.
 */
export type Validator = (value: string) => string | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const validateEmail: Validator = (v) => {
  const value = v.trim();
  if (!value) return 'Ingresa tu correo electrónico.';
  if (!EMAIL_RE.test(value)) return 'Ingresa un correo válido (ej. ana@correo.com).';
  return null;
};

export const validatePassword: Validator = (v) => {
  if (!v) return 'Ingresa una contraseña.';
  if (v.length < LIMITS.PASSWORD_MIN) return `Debe tener al menos ${LIMITS.PASSWORD_MIN} caracteres.`;
  if (v.length > LIMITS.PASSWORD_MAX) return `Debe tener como máximo ${LIMITS.PASSWORD_MAX} caracteres.`;
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(v) || !/\d/.test(v)) return 'Debe incluir al menos una letra y un número.';
  return null;
};

export const validateRequired =
  (message: string): Validator =>
  (v) =>
    v.trim() ? null : message;

export const validateFullName: Validator = (v) => {
  const value = v.trim();
  if (!value) return 'Ingresa tu nombre.';
  if (value.length < 2) return 'El nombre es demasiado corto.';
  if (value.length > LIMITS.FULL_NAME_MAX) return `Máximo ${LIMITS.FULL_NAME_MAX} caracteres.`;
  return null;
};

export const validateMatch =
  (other: string, message = 'Las contraseñas no coinciden.'): Validator =>
  (v) =>
    v === other ? null : message;

/** Valida un formulario completo: { campo: validador } → { campo: error }. */
export function validateForm<K extends string>(
  values: Record<K, string>,
  rules: Partial<Record<K, Validator>>,
): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {};
  for (const key of Object.keys(rules) as K[]) {
    const rule = rules[key];
    const err = rule ? rule(values[key]) : null;
    if (err) errors[key] = err;
  }
  return errors;
}

export const hasErrors = (errors: Partial<Record<string, string>>): boolean => Object.values(errors).some(Boolean);
