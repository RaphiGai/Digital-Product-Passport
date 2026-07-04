'use strict';

// Write-side validation of the category-specific `attributes` bag (Epic 12):
// datatype/constraint checks against AttributeDefinitions, rejection of unknown
// and reserved keys, http(s)-only URL guard (stored-XSS), and normalization
// (sorted keys, empties dropped, empty bag → null).

const { validateAttributes } = require('../../srv/lib/attribute-validate');

// Synthetic electronics-style catalogue (storage='json' fields on product level).
const catalogue = {
  byLevel: {
    product: [
      { key: 'energy_class', level: 'product', storage: 'json', label: 'Energy class', datatype: 'enum',
        options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }], mandatory: true },
      { key: 'spare_parts_years', level: 'product', storage: 'json', label: 'Spare parts availability (years)',
        datatype: 'integer', min_value: 0, max_value: 30 },
      { key: 'sw_update_until', level: 'product', storage: 'json', label: 'Software updates until', datatype: 'date' },
      { key: 'battery_removable', level: 'product', storage: 'json', label: 'Battery removable', datatype: 'boolean' },
      { key: 'manual_url', level: 'product', storage: 'json', label: 'Manual link', datatype: 'url', max_length: 500 },
      { key: 'model_code', level: 'product', storage: 'json', label: 'Model code', datatype: 'string',
        max_length: 10, regex: '^[A-Z]{2}-\\d+$' },
      // a column-backed core field must NOT be writable through the bag
      { key: 'name', level: 'product', storage: 'column', label: 'Name', datatype: 'string' },
    ],
    variant: [],
    batch: [],
  },
};

const run = (bag) => {
  const errors = [];
  const result = validateAttributes(bag, catalogue, 'product', (m) => errors.push(m));
  return { result, errors };
};

describe('attribute-validate — acceptance & normalization', () => {
  test('valid values pass and are stored normalized (sorted keys, empties dropped)', () => {
    const { result, errors } = run({
      sw_update_until: '2032-01-01',
      energy_class: 'A',
      spare_parts_years: 7,
      battery_removable: true,
      manual_url: 'https://example.com/manual.pdf',
      model_code: 'AB-42',
    });
    expect(errors).toEqual([]);
    expect(JSON.parse(result)).toEqual({
      battery_removable: true,
      energy_class: 'A',
      manual_url: 'https://example.com/manual.pdf',
      model_code: 'AB-42',
      spare_parts_years: 7,
      sw_update_until: '2032-01-01',
    });
    expect(Object.keys(JSON.parse(result))).toEqual(Object.keys(JSON.parse(result)).sort());
  });

  test('an empty bag (or all-empty values of DEFINED keys) is stored as null', () => {
    expect(run({}).result).toBeNull();
    expect(run({ energy_class: '' }).result).toBeNull();
    expect(run({ energy_class: null, manual_url: '' }).result).toBeNull();
    expect(run(null).result).toBeNull();
  });

  test('unknown keys are rejected even with empty values (client-bug signal)', () => {
    const { errors } = run({ unused: '' });
    expect(errors[0]).toMatch(/'unused' is not an attribute/);
  });

  test('a JSON string payload is accepted (OData sends the column as string)', () => {
    const { result, errors } = run(JSON.stringify({ energy_class: 'B' }));
    expect(errors).toEqual([]);
    expect(JSON.parse(result)).toEqual({ energy_class: 'B' });
  });

  test('presence is NOT enforced here — mandatory gaps are the approve gate\'s concern', () => {
    const { errors } = run({ spare_parts_years: 5 }); // mandatory energy_class missing
    expect(errors).toEqual([]);
  });
});

describe('attribute-validate — rejections', () => {
  const firstError = (bag) => run(bag).errors[0];

  test('unknown keys are rejected', () => {
    expect(firstError({ nonsense: 1 })).toMatch(/'nonsense' is not an attribute of this product category/);
  });

  test('column-backed fields cannot be smuggled through the bag', () => {
    expect(firstError({ name: 'hack' })).toMatch(/'name' is not an attribute/);
  });

  test('reserved keys are rejected (drift-hash stripDeep collision guard)', () => {
    expect(firstError({ status: 'x' })).toMatch(/not a valid attribute name/);
    expect(firstError({ some_id: 'x' })).toMatch(/not a valid attribute name/);
  });

  test('enum values outside the options are rejected', () => {
    expect(firstError({ energy_class: 'Z' })).toBe('Energy class must be one of: A, B.');
  });

  test('numbers: NaN, below min and above max are rejected; comma decimals accepted', () => {
    expect(firstError({ spare_parts_years: 'many' })).toMatch(/must be a number/);
    expect(firstError({ spare_parts_years: -1 })).toMatch(/at least 0/);
    expect(firstError({ spare_parts_years: 31 })).toMatch(/at most 30/);
    expect(firstError({ spare_parts_years: '7,5' })).toMatch(/whole number/);
  });

  test('dates must be YYYY-MM-DD', () => {
    expect(firstError({ sw_update_until: '01.04.2032' })).toMatch(/must be a date/);
  });

  test('booleans must be true/false', () => {
    expect(firstError({ battery_removable: 'maybe' })).toMatch(/yes or no/);
  });

  test('url fields block javascript:/data: (stored XSS on the public passport)', () => {
    expect(firstError({ manual_url: 'javascript:alert(1)' })).toMatch(/must be a full web address starting with https:\/\//);
    expect(firstError({ manual_url: 'data:text/html,x' })).toMatch(/must be a full web address starting with https:\/\//);
  });

  test('string constraints: max_length and regex', () => {
    expect(firstError({ model_code: 'AB-1234567890' })).toMatch(/at most 10 characters/);
    expect(firstError({ model_code: 'nope' })).toMatch(/invalid format/);
  });

  test('malformed bag payloads are rejected cleanly', () => {
    expect(firstError('{not json')).toBe('Attributes must be a valid set of field values.');
    expect(firstError([1, 2])).toBe('Attributes must be a valid set of field values.');
  });
});
