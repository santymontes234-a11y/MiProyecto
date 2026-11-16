import { evaluateFix, type GpsFix } from '../track-filter';

const fix = (lng: number, lat: number, t: number, accuracy: number | null = 5): GpsFix => ({ coord: [lng, lat], timestamp: t, accuracy });

describe('evaluateFix', () => {
  it('acepta el primer fix preciso', () => {
    expect(evaluateFix(null, fix(-100.39, 20.58, 0))).toBe('accept');
  });
  it('descarta fixes imprecisos', () => {
    expect(evaluateFix(null, fix(-100.39, 20.58, 0, 120))).toBe('inaccurate');
  });
  it('descarta movimientos menores al paso mínimo', () => {
    expect(evaluateFix(fix(-100.39, 20.58, 0), fix(-100.39001, 20.58, 3000))).toBe('too_close');
  });
  it('descarta saltos imposibles', () => {
    // ~1.1 km en 3 s
    expect(evaluateFix(fix(-100.39, 20.58, 0), fix(-100.39, 20.59, 3000))).toBe('jump');
  });
  it('acepta avance realista en bici', () => {
    // ~22 m en 5 s ≈ 16 km/h
    expect(evaluateFix(fix(-100.39, 20.58, 0), fix(-100.39, 20.5802, 5000))).toBe('accept');
  });
});
