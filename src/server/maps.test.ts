import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractChunksFromGenerateContent,
  extractChunksFromInteraction,
  matchPlaceToChunk,
  parsePriceHint,
  MapsGroundedChunk,
} from './maps';

test('parsePriceHint splits on - or – and runs parsePrice on each side', () => {
  assert.deepEqual(parsePriceHint('40k - 60k'), { low: 40000, high: 60000 });
  assert.deepEqual(parsePriceHint('50.000–70.000đ'), { low: 50000, high: 70000 });
  assert.deepEqual(parsePriceHint('45k-65k'), { low: 45000, high: 65000 });

  // Set both to null if not a 2-sided range or if either side fails to parse
  assert.deepEqual(parsePriceHint('60k'), { low: null, high: null });
  assert.deepEqual(parsePriceHint('40k - unknown'), { low: null, high: null });
  assert.deepEqual(parsePriceHint('varies - 60k'), { low: null, high: null });
  assert.deepEqual(parsePriceHint(null), { low: null, high: null });
  assert.deepEqual(parsePriceHint(''), { low: null, high: null });
});

test('matchPlaceToChunk joins by accent-insensitive name and drops unmatched places', () => {
  const chunks: MapsGroundedChunk[] = [
    {
      title: 'Bún Chả Hàng Quạt',
      uri: 'https://maps.google.com/?cid=111',
      placeId: 'ChIJ_hang_quat',
    },
    {
      title: 'Bún Chả Đắc Kim',
      uri: 'https://maps.google.com/?cid=222',
      placeId: 'ChIJ_dac_kim',
    },
  ];

  // Exact with accents
  const m1 = matchPlaceToChunk('Bún Chả Hàng Quạt', chunks);
  assert.ok(m1);
  assert.equal(m1.placeId, 'ChIJ_hang_quat');

  // Accent-insensitive match
  const m2 = matchPlaceToChunk('Bun Cha Dac Kim - Hang Manh', chunks);
  assert.ok(m2);
  assert.equal(m2.placeId, 'ChIJ_dac_kim');

  // Unmatched place is dropped (returns null)
  const m3 = matchPlaceToChunk('Phở Thìn Bờ Hồ', chunks);
  assert.equal(m3, null);
});

test('extractChunksFromGenerateContent and extractChunksFromInteraction extract maps chunks safely', () => {
  const genResp = {
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: [
            {
              maps: {
                title: 'Bún Chả Hàng Quạt',
                uri: 'https://maps.google.com/?cid=111',
                placeId: 'places/ChIJ12345',
                text: 'Famous bun cha alley spot',
              },
            },
          ],
        },
      },
    ],
  };

  const chunks = extractChunksFromGenerateContent(genResp);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].title, 'Bún Chả Hàng Quạt');
  assert.equal(chunks[0].placeId, 'ChIJ12345');
  assert.equal(chunks[0].uri, 'https://maps.google.com/?cid=111');

  const interactionResp = {
    steps: [
      {
        type: 'model_output',
        content: [
          {
            type: 'text',
            text: 'Try Bún Chả 34 Hàng Than.',
            annotations: [
              {
                type: 'place_citation',
                title: 'Bún Chả 34 Hàng Than',
                uri: 'https://maps.google.com/?cid=333',
                place_id: 'ChIJ_hang_than',
              },
            ],
          },
        ],
      },
    ],
  };

  const intRes = extractChunksFromInteraction(interactionResp);
  assert.equal(intRes.chunks.length, 1);
  assert.equal(intRes.chunks[0].title, 'Bún Chả 34 Hàng Than');
  assert.equal(intRes.chunks[0].placeId, 'ChIJ_hang_than');
});
