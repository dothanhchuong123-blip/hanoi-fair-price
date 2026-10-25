import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertToReferenceUnit, perUnit, unitLabel, unitsForReference } from './units';

test('bánh mì is only offered per piece, never per bowl', () => {
  const units = unitsForReference({ unit: 'chiếc', category: 'street_food' });
  assert.deepEqual(units, ['chiếc']);
  assert.equal(perUnit('chiếc', 'en'), 'per piece');
  assert.equal(unitLabel('chiếc', 'en'), 'Piece · chiếc');
});

test('mango sold by weight can be quoted per kg or per lạng', () => {
  assert.deepEqual(unitsForReference({ unit: 'kg', category: 'fruit' }), ['kg', 'lạng']);
});

test('bia hơi is per glass', () => {
  assert.deepEqual(unitsForReference({ unit: 'cốc', category: 'drink' }), ['cốc']);
  assert.equal(perUnit('cốc', 'vi'), '/ cốc');
});

test('kg and lạng convert both ways', () => {
  assert.equal(convertToReferenceUnit(15000, 'lạng', 'kg'), 150000);
  assert.equal(convertToReferenceUnit(150000, 'kg', 'lạng'), 15000);
  assert.equal(convertToReferenceUnit(30000, 'chiếc', 'kg'), null);
});
