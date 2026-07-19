'use strict';

const { _internals } = require('../../srv/lib/aggregator');
const {
  weightedSum, weightedAverage, toFraction, toKg,
} = _internals;

describe('aggregator helpers', () => {
  test('toFraction converts percent to fraction, keeps other units literal', () => {
    expect(toFraction(95, '%')).toBeCloseTo(0.95);
    expect(toFraction(5, '%')).toBeCloseTo(0.05);
    expect(toFraction(2, 'kg')).toBe(2);
    expect(toFraction(null, '%')).toBe(1);
  });

  test('weightedSum combines a self value with weighted child contributions', () => {
    const result = weightedSum(null, [
      { value: 3.0, weight: 0.95 },
      { value: 8.0, weight: 0.05 },
    ]);
    expect(result).toBeCloseTo(3.25, 5);
  });

  test('weightedSum returns null when no self and no children contribute', () => {
    expect(weightedSum(null, [])).toBeNull();
    expect(weightedSum(null, [{ value: null, weight: 1 }])).toBeNull();
  });

  test('weightedAverage divides by total weight including the self entry', () => {
    const result = weightedAverage(null, [
      { value: 20, weight: 0.95 },
      { value: 0,  weight: 0.05 },
    ]);
    expect(result).toBeCloseTo(19, 5);
  });

  test('toKg converts g/kg directly and % via the parent unit weight', () => {
    expect(toKg(2, 'kg')).toBe(2);
    expect(toKg(500, 'g')).toBeCloseTo(0.5, 6);
    expect(toKg(95, '%', 180)).toBeCloseTo(0.171, 6);   // 95% of a 180 g garment
  });

  test('toKg has no mass basis for pcs, percent-without-weight, or null quantity', () => {
    expect(toKg(1, 'pcs', 180)).toBeNull();
    expect(toKg(95, '%', null)).toBeNull();
    expect(toKg(null, 'kg')).toBeNull();
  });

  test('CO2 rollup: self per-unit emission + consumed mass × component intensity', () => {
    // T-shirt: own cut&sew 2.4 kg/unit + cotton (intensity 15.0 kg/kg) × 0.171 kg consumed.
    const co2 = weightedSum(2.4, [{ value: 15.0, weight: toKg(95, '%', 180) }]);
    expect(co2).toBeCloseTo(4.965, 5);
  });

  test('recycled content is a mass-weighted average over resolved components', () => {
    // Only cotton (15%, 0.171 kg) resolves; elastane is external/excluded.
    const recycled = weightedAverage(null, [{ value: 15, weight: toKg(95, '%', 180) }]);
    expect(recycled).toBeCloseTo(15, 5);
  });
});
