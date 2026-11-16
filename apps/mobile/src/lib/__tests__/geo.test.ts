import type { Position } from '@ecomove/shared';

import { clampBBox, fitToPointLimit, haversineM, pathLengthM, simplify, snapBBox } from '../geo';

const CENTRO: Position = [-100.3899, 20.5888];
const ALAMEDA: Position = [-100.3925, 20.5874];

describe('geo', () => {
  it('haversine da ~0 para el mismo punto y una distancia razonable entre puntos cercanos', () => {
    expect(haversineM(CENTRO, CENTRO)).toBeCloseTo(0, 5);
    const d = haversineM(CENTRO, ALAMEDA);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(350);
  });

  it('pathLength suma los segmentos', () => {
    expect(pathLengthM([CENTRO, ALAMEDA, CENTRO])).toBeCloseTo(2 * haversineM(CENTRO, ALAMEDA), 3);
    expect(pathLengthM([CENTRO])).toBe(0);
  });

  it('simplify elimina puntos colineales y conserva extremos', () => {
    const line: Position[] = Array.from({ length: 50 }, (_, i) => [-100.39 + i * 0.0001, 20.58]);
    const out = simplify(line, 1);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(line[0]);
    expect(out[1]).toEqual(line[49]);
  });

  it('simplify conserva un vértice significativo', () => {
    const out = simplify([[-100.39, 20.58], [-100.385, 20.59], [-100.38, 20.58]], 5);
    expect(out).toHaveLength(3);
  });

  it('fitToPointLimit respeta el máximo del contrato', () => {
    const zigzag: Position[] = Array.from({ length: 2000 }, (_, i) => [-100.39 + i * 0.00005, 20.58 + (i % 2) * 0.0002]);
    const out = fitToPointLimit(zigzag, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out[0]).toEqual(zigzag[0]);
    expect(out.at(-1)).toEqual(zigzag.at(-1));
  });

  it('clampBBox limita el área a 0.5° × 0.5°', () => {
    const [minLng, minLat, maxLng, maxLat] = clampBBox([-101, 20, -99, 21.5]);
    expect(maxLng - minLng).toBeLessThan(0.5);
    expect(maxLat - minLat).toBeLessThan(0.5);
    expect((minLng + maxLng) / 2).toBeCloseTo(-100, 5);
  });

  it('snapBBox expande hacia una rejilla estable', () => {
    expect(snapBBox([-100.3912, 20.5811, -100.3801, 20.5999])).toEqual([-100.4, 20.58, -100.38, 20.6]);
  });
});
