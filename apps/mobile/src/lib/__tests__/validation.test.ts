import { hasErrors, validateEmail, validateForm, validateFullName, validateMatch, validatePassword } from '../validation';

describe('validation', () => {
  it('valida correos', () => {
    expect(validateEmail('')).not.toBeNull();
    expect(validateEmail('ana@')).not.toBeNull();
    expect(validateEmail(' ana@correo.com ')).toBeNull();
  });

  it('exige contraseña de 8+ con letra y número (contrato)', () => {
    expect(validatePassword('corta1')).toMatch(/8/);
    expect(validatePassword('solotexto')).toMatch(/letra y un número/);
    expect(validatePassword('12345678')).toMatch(/letra y un número/);
    expect(validatePassword('Querétaro2026')).toBeNull();
  });

  it('valida nombre y coincidencia', () => {
    expect(validateFullName(' ')).not.toBeNull();
    expect(validateFullName('Ana López')).toBeNull();
    expect(validateMatch('abc')('abd')).not.toBeNull();
    expect(validateMatch('abc')('abc')).toBeNull();
  });

  it('validateForm agrega errores por campo', () => {
    const errors = validateForm({ email: 'x', password: 'Valida123' }, { email: validateEmail, password: validatePassword });
    expect(Object.keys(errors)).toEqual(['email']);
    expect(hasErrors(errors)).toBe(true);
    expect(hasErrors({})).toBe(false);
  });
});
