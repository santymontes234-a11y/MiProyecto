import { ApiError } from '@ecomove/shared';

import { fieldErrors, getErrorMessage, isNetworkError } from '../errors';

describe('errors', () => {
  it('traduce códigos del contrato', () => {
    expect(getErrorMessage(new ApiError(401, 'INVALID_CREDENTIALS', 'x'))).toBe('Correo o contraseña incorrectos.');
    expect(getErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'))).toMatch(/conexión/);
  });

  it('códigos fuera del contrato muestran el mensaje del servidor (no se ocultan)', () => {
    expect(getErrorMessage(new ApiError(400, 'SOMETHING_NEW', 'Mensaje del servidor'))).toBe('Mensaje del servidor');
  });

  it('5xx desconocido usa mensaje genérico', () => {
    expect(getErrorMessage(new ApiError(503, 'X', ''))).toMatch(/servidor/);
  });

  it('errores no-API usan el fallback', () => {
    expect(getErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('extrae errores por campo de un 422', () => {
    const e = new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [
      { loc: ['body', 'email'], msg: 'correo inválido', type: 'value_error' },
      { loc: ['body', 'password'], msg: 'muy corta', type: 'value_error' },
      { loc: 'malformado', msg: 'x' },
    ]);
    expect(fieldErrors(e)).toEqual({ email: 'correo inválido', password: 'muy corta' });
    expect(fieldErrors(new ApiError(400, 'BAD_REQUEST', 'x'))).toEqual({});
  });

  it('detecta errores de red', () => {
    expect(isNetworkError(new ApiError(0, 'TIMEOUT', ''))).toBe(true);
    expect(isNetworkError(new ApiError(500, 'INTERNAL_ERROR', ''))).toBe(false);
  });
});

describe('errores del contrato 1.1.0', () => {
  it('traduce códigos nuevos de viajes y ruteo', () => {
    expect(getErrorMessage(new ApiError(422, 'MODE_INACTIVE', 'x', { mode: 'E_SCOOTER' }))).toMatch(/Guardamos tu viaje/);
    expect(getErrorMessage(new ApiError(503, 'ROUTING_UNAVAILABLE', 'x'))).toMatch(/rutas/);
    expect(getErrorMessage(new ApiError(400, 'RESET_TOKEN_INVALID', 'x'))).toMatch(/enlace/);
  });
  it('dominio reservado en el registro llega como error del campo email', () => {
    const e = new ApiError(422, 'VALIDATION_ERROR', 'Datos inválidos', [{ loc: ['body', 'email'], msg: 'Dominio de correo no permitido', type: 'value_error' }]);
    expect(fieldErrors(e)).toEqual({ email: 'Dominio de correo no permitido' });
  });
});
