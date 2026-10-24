import test from 'node:test';
import assert from 'node:assert/strict';
import { norm, priceKey, snapItems } from './fuse';
import { PerceivedItem } from '../agent/types';
import { OcrWord } from './ocr';

test('priceKey turns 120k, 120K, 120.000, 120,000, 120 k, and split "120"+"k" into 120000', () => {
  assert.equal(priceKey('120k'), 120000);
  assert.equal(priceKey('120K'), 120000);
  assert.equal(priceKey('120.000'), 120000);
  assert.equal(priceKey('120,000'), 120000);
  assert.equal(priceKey('120 k'), 120000);
  assert.equal(priceKey('120.000đ'), 120000);
  assert.equal(priceKey('120', 'k'), 120000);
  assert.equal(priceKey(['120', 'k']), 120000);
  assert.equal(priceKey('50k-70k-90k'), 50000);
  assert.equal(priceKey('phở'), null);
});

test('norm folds Vietnamese accents and đ/Đ to lowercase ASCII alphanumerics', () => {
  assert.equal(norm('Phở bò'), 'phobo');
  assert.equal(norm('Bún chả Hà Nội'), 'bunchahanoi');
  assert.equal(norm('Đậu phụ tẩm hành!'), 'dauphutamhanh');
  assert.equal(norm('Cà phê trứng (nóng/đá)'), 'caphetrungnongda');
  assert.equal(norm('120.000đ'), '120000d');
});

test('snapItems snaps one exact-match menu row to tight OCR union box', () => {
  const items: PerceivedItem[] = [
    {
      name_vi: 'Bún chả',
      name_en: 'Grilled pork & noodles',
      category: 'street_food',
      price_vnd: 120000,
      raw_price_text: '120k',
      unit: 'suất',
      // Loose Gemini box
      box_2d: [290, 100, 390, 890],
      confidence: 0.95,
    },
  ];

  const words: OcrWord[] = [
    // Heading above (should not be included)
    { text: 'MÓN', box: [200, 300, 230, 400], confidence: 0.99 },
    { text: 'CHÍNH', box: [200, 410, 230, 520], confidence: 0.99 },
    // Target row
    { text: 'Bún', box: [312, 135, 348, 210], confidence: 0.98 },
    { text: 'chả', box: [314, 220, 348, 290], confidence: 0.97 },
    { text: '120', box: [313, 760, 347, 825], confidence: 0.99 },
    { text: 'k', box: [315, 828, 347, 850], confidence: 0.99 },
  ];

  const snapped = snapItems(items, words);
  assert.equal(snapped.length, 1);
  assert.equal(snapped[0].box_source, 'ocr');
  assert.deepEqual(snapped[0].box_2d, [312, 135, 348, 850]);
});

test('snapItems snaps a wrapped item name across line i and line i+1', () => {
  const items: PerceivedItem[] = [
    {
      name_vi: 'Bún đậu mắm tôm đặc biệt',
      name_en: 'Special tofu & shrimp paste platter',
      category: 'street_food',
      price_vnd: 65000,
      raw_price_text: '65.000',
      unit: 'suất',
      box_2d: [400, 110, 510, 880],
      confidence: 0.93,
    },
  ];

  const words: OcrWord[] = [
    // Line 1 of wrapped item
    { text: 'Bún', box: [410, 130, 440, 195], confidence: 0.98 },
    { text: 'đậu', box: [410, 205, 440, 270], confidence: 0.98 },
    { text: 'mắm', box: [410, 280, 440, 360], confidence: 0.97 },
    { text: 'tôm', box: [410, 370, 440, 435], confidence: 0.97 },
    // Line 2 of wrapped item + price
    { text: 'đặc', box: [455, 130, 485, 195], confidence: 0.96 },
    { text: 'biệt', box: [455, 205, 485, 275], confidence: 0.96 },
    { text: '65.000', box: [455, 740, 485, 855], confidence: 0.99 },
  ];

  const snapped = snapItems(items, words);
  assert.equal(snapped[0].box_source, 'ocr');
  assert.deepEqual(snapped[0].box_2d, [410, 130, 485, 855]);
});

test('snapItems marks used words so duplicate "Phở bò" rows bind to different lines', () => {
  const items: PerceivedItem[] = [
    {
      name_vi: 'Phở bò',
      name_en: 'Beef noodle soup (small)',
      category: 'street_food',
      price_vnd: 50000,
      raw_price_text: '50k',
      unit: 'bát',
      // Overlapping Gemini boxes covering both rows
      box_2d: [200, 100, 280, 880],
      confidence: 0.95,
    },
    {
      name_vi: 'Phở bò',
      name_en: 'Beef noodle soup (large)',
      category: 'street_food',
      price_vnd: 65000,
      raw_price_text: '65k',
      unit: 'bát',
      box_2d: [230, 100, 320, 880],
      confidence: 0.95,
    },
  ];

  const words: OcrWord[] = [
    // Row 1
    { text: 'Phở', box: [215, 120, 245, 190], confidence: 0.99 },
    { text: 'bò', box: [215, 200, 245, 245], confidence: 0.99 },
    { text: '50k', box: [215, 780, 245, 850], confidence: 0.99 },
    // Row 2
    { text: 'Phở', box: [275, 122, 305, 192], confidence: 0.99 },
    { text: 'bò', box: [275, 202, 305, 247], confidence: 0.99 },
    { text: '65k', box: [275, 782, 305, 852], confidence: 0.99 },
  ];

  const snapped = snapItems(items, words);
  assert.equal(snapped[0].box_source, 'ocr');
  assert.equal(snapped[1].box_source, 'ocr');
  assert.deepEqual(snapped[0].box_2d, [215, 120, 245, 850]);
  assert.deepEqual(snapped[1].box_2d, [275, 122, 305, 852]);
});

test('snapItems falls back to gemini box when OCR words are empty or fail sanity check', () => {
  const geminiBox: [number, number, number, number] = [240, 120, 300, 860];
  const items: PerceivedItem[] = [
    {
      name_vi: 'Trà đá',
      name_en: 'Iced tea',
      category: 'drink',
      price_vnd: 15000,
      raw_price_text: '15k',
      unit: 'cốc',
      box_2d: geminiBox,
      confidence: 0.96,
    },
  ];

  // 1. Empty OCR words -> fallback to gemini
  const noOcr = snapItems(items, []);
  assert.equal(noOcr[0].box_source, 'gemini');
  assert.deepEqual(noOcr[0].box_2d, geminiBox);

  // 2. OCR words whose center is > 100 units shifted from Gemini box -> rejected by sanity check
  const shiftedWords: OcrWord[] = [
    { text: 'Trà', box: [250, 700, 280, 760], confidence: 0.95 },
    { text: 'đá', box: [250, 770, 280, 810], confidence: 0.95 },
    { text: '15k', box: [250, 820, 280, 870], confidence: 0.95 },
  ];
  const rejected = snapItems(items, shiftedWords);
  assert.equal(rejected[0].box_source, 'gemini');
  assert.deepEqual(rejected[0].box_2d, geminiBox);
});
