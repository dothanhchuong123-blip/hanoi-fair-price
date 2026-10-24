import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, convertUnitPrice, formatShortVnd, formatDotVnd, formatUsd } from './parsePrice';

test('parsePrice parses Vietnamese k/K shorthand', () => {
  assert.equal(parsePrice('35k').price_vnd, 35000);
  assert.equal(parsePrice('35K').price_vnd, 35000);
  assert.equal(parsePrice('120k').price_vnd, 120000);
  assert.equal(parsePrice('35k5').price_vnd, 35500);
});

test('parsePrice parses dot and comma separated VND formats', () => {
  assert.equal(parsePrice('35.000').price_vnd, 35000);
  assert.equal(parsePrice('35.000đ').price_vnd, 35000);
  assert.equal(parsePrice('35,000 VND').price_vnd, 35000);
  assert.equal(parsePrice('120.000đ').price_vnd, 120000);
});

test('parsePrice parses nghìn and triệu formats', () => {
  assert.equal(parsePrice('35 nghìn').price_vnd, 35000);
  assert.equal(parsePrice('1tr2').price_vnd, 1200000);
  assert.equal(parsePrice('1.2 triệu').price_vnd, 1200000);
});

test('parsePrice extracts unit and converts 1 lạng = 100g (×10 per kg) and 1 cân = 1 kg', () => {
  const perKg = parsePrice('150k/kg');
  assert.equal(perKg.price_vnd, 150000);
  assert.equal(perKg.unit, 'kg');
  assert.equal(perKg.normalized_per_base_vnd, 150000);
  assert.equal(perKg.base_unit, 'kg');

  const perLang = parsePrice('8k/lạng');
  assert.equal(perLang.price_vnd, 8000);
  assert.equal(perLang.unit, 'lạng');
  assert.equal(perLang.normalized_per_base_vnd, 80000);
  assert.equal(perLang.base_unit, 'kg');

  const perCan = convertUnitPrice(75000, 'cân');
  assert.equal(perCan.normalized_vnd, 75000);
  assert.equal(perCan.base_unit, 'kg');
});

test('formatters format VND and USD matching mockups', () => {
  assert.equal(formatShortVnd(120000), '120k');
  assert.equal(formatDotVnd(120000), '120.000đ');
  assert.equal(formatUsd(120000), '$4.60');
  assert.equal(formatUsd(80000), '$3.05');
});
