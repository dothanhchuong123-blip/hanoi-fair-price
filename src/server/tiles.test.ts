import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapTileBoxToGlobal,
  mergeTileItems,
  planTiles,
  shouldTile,
  TileItemDetection,
} from './tiles';
import {
  computePaddedUpscaledCrop,
  findFlaggedItemIndices,
  shouldReplaceWithSecondPass,
} from './secondPass';
import { PerceivedItem } from '../agent/types';

test('mapTileBoxToGlobal maps tile-local 0-1000 boxes into global 0-1000 coordinates', () => {
  // Image 2000x2000, tile at (819, 819) with size 1024x1024
  const tile = { x: 819, y: 819, w: 1024, h: 1024 };
  const globalBox = mapTileBoxToGlobal([100, 200, 200, 800], tile, 2000, 2000);

  // gx = (819 + xmin/1000 * 1024) / 2000 * 1000
  // ymin: (819 + 102.4) / 2000 * 1000 = 460.7 -> 461
  // xmin: (819 + 204.8) / 2000 * 1000 = 511.9 -> 512
  // ymax: (819 + 204.8) / 2000 * 1000 = 511.9 -> 512
  // xmax: (819 + 819.2) / 2000 * 1000 = 819.1 -> 819
  assert.deepEqual(globalBox, [461, 512, 512, 819]);

  // Top-left tile covering full 1000x1000 image maps 1:1
  const fullTile = { x: 0, y: 0, w: 1000, h: 1000 };
  assert.deepEqual(
    mapTileBoxToGlobal([250, 120, 310, 880], fullTile, 1000, 1000),
    [250, 120, 310, 880]
  );
});

test('mergeTileItems merges duplicate row seen by two overlapping tiles into one item (most central kept) and drops edge-clipped boxes', () => {
  // Image 1024 x 1843 -> 2 vertical tiles:
  // Tile 0: y=0..1024 (hasBottom=true)
  // Tile 1: y=819..1843 (hasTop=true)
  const imageW = 1024;
  const imageH = 1843;

  const tile0 = {
    x: 0,
    y: 0,
    w: 1024,
    h: 1024,
    hasLeft: false,
    hasRight: false,
    hasTop: false,
    hasBottom: true,
  };
  const tile1 = {
    x: 0,
    y: 819,
    w: 1024,
    h: 1024,
    hasLeft: false,
    hasRight: false,
    hasTop: true,
    hasBottom: false,
  };

  // A menu row at global y = [880..920] px:
  // In tile 0 (y=0..1024): local y is [859..898] (center Cy = 878.5, distance from 500 is 378.5)
  // In tile 1 (y=819..1024): y offset is 61..101 px -> local y is [60..99] (center Cy = 79.5, distance from 500 is 420.5)
  // Wait: let's make tile 1 see the row closer to its center, e.g. at global y = [980..1020] px:
  // In tile 0: local y = [957..996] (near bottom edge, Cy = 976.5, dist from 500 = 476.5)
  // In tile 1: y offset = 161..201 px -> local y = [157..196] (more central, Cy = 176.5, dist from 500 = 323.5)
  const detections: TileItemDetection[] = [
    {
      tile: tile0,
      item: {
        name_vi: 'Bún chả Hà Nội',
        name_en: 'Grilled pork noodles (from tile 0 edge)',
        category: 'street_food',
        price_vnd: 60000,
        raw_price_text: '60k',
        unit: 'suất',
        box_2d: [957, 100, 996, 900],
        clipped: false,
        confidence: 0.88,
      },
    },
    {
      tile: tile1,
      item: {
        name_vi: 'Bún chả Hà Nội',
        name_en: 'Grilled pork noodles (from tile 1 central)',
        category: 'street_food',
        price_vnd: 60000,
        raw_price_text: '60k',
        unit: 'suất',
        box_2d: [157, 100, 196, 900],
        clipped: false,
        confidence: 0.96,
      },
    },
    // Clipped box at the very bottom edge of tile 0 (Cy = 980 >= 940, hasBottom = true) -> should be dropped
    {
      tile: tile0,
      item: {
        name_vi: 'Phở gà',
        name_en: 'Chicken pho clipped',
        category: 'street_food',
        price_vnd: 50000,
        unit: 'bát',
        box_2d: [965, 100, 995, 900],
        clipped: true,
        confidence: 0.75,
      },
    },
  ];

  const merged = mergeTileItems(detections, imageW, imageH);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name_vi, 'Bún chả Hà Nội');
  // Kept the more central detection from tile 1
  assert.equal(merged[0].name_en, 'Grilled pork noodles (from tile 1 central)');
  assert.equal((merged[0] as unknown as { clipped?: boolean }).clipped, undefined);
});

test('mergeTileItems runs NMS at IoU 0.5 for overlapping boxes with different names', () => {
  const tile = {
    x: 0,
    y: 0,
    w: 1000,
    h: 1000,
    hasLeft: false,
    hasRight: false,
    hasTop: false,
    hasBottom: false,
  };

  const detections: TileItemDetection[] = [
    {
      tile,
      item: {
        name_vi: 'Cà phê trứng',
        name_en: 'Egg coffee',
        category: 'drink',
        price_vnd: 45000,
        unit: 'cốc',
        box_2d: [480, 100, 520, 900], // very central (Cy=500, Cx=500)
        clipped: false,
        confidence: 0.95,
      },
    },
    {
      tile,
      item: {
        name_vi: 'Cà phê sữa đá',
        name_en: 'Iced milk coffee duplicate box',
        category: 'drink',
        price_vnd: 35000,
        unit: 'cốc',
        box_2d: [482, 100, 522, 900], // IoU > 0.8 with above box
        clipped: false,
        confidence: 0.72,
      },
    },
  ];

  const merged = mergeTileItems(detections, 1000, 1000);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name_vi, 'Cà phê trứng');
});

test('planTiles uses 1024px tiles with stride 819px, switches to 1280px when >12 needed, and caps at 12 tiles', () => {
  // 1. Standard 1800x2600 menu -> 2 cols x 3 rows = 6 tiles of 1024px with stride 819
  const mediumTiles = planTiles(1800, 2600);
  assert.equal(mediumTiles.length, 6);
  assert.equal(mediumTiles[0].tileSize, 1024);
  assert.equal(mediumTiles[0].x, 0);
  assert.equal(mediumTiles[1].x, 819);
  assert.equal(mediumTiles[2].y, 819);

  // 2. Sliver skip: 1024 + 60 = 1084px width -> second stride at 819 has width 265 (< 30% of 1024 = 307.2) -> skipped!
  const sliverTiles = planTiles(1084, 1024);
  assert.equal(sliverTiles.length, 1);

  // 3. Large image (3000x4000) would need 4x5 = 20 tiles at 1024px -> switches to 1280px tiles (3x4 = 12 tiles)
  const switchedTiles = planTiles(3000, 4000);
  assert.ok(switchedTiles.length <= 12);
  assert.equal(switchedTiles[0].tileSize, 1280);

  // 4. Huge image (8000x8000) -> strictly capped at 12 tiles
  const hugeTiles = planTiles(8000, 8000);
  assert.equal(hugeTiles.length, 12);
  assert.equal(hugeTiles[0].tileSize, 1280);
});

test('shouldTile triggers only for dense menus and skips short 7-item menus', () => {
  const shortItems: PerceivedItem[] = Array.from({ length: 7 }, (_, i) => ({
    name_vi: `Món ${i + 1}`,
    name_en: `Dish ${i + 1}`,
    category: 'street_food',
    price_vnd: 50000,
    unit: 'bát',
    box_2d: [100 + i * 80, 100, 150 + i * 80, 900],
    confidence: 0.95,
  }));

  // 7 items, no missed OCR lines -> false
  assert.equal(shouldTile(shortItems, [], 1200, 1600), false);

  // 15 items -> true
  const manyItems: PerceivedItem[] = Array.from({ length: 15 }, (_, i) => ({
    ...shortItems[0],
    name_vi: `Món ${i + 1}`,
  }));
  assert.equal(shouldTile(manyItems, [], 1200, 1600), true);
});

test('secondPass flags unsure items and computes 15% padded crop upscaled to >=768px short side', () => {
  const items: PerceivedItem[] = [
    {
      name_vi: 'Phở bò',
      name_en: 'Beef pho',
      category: 'street_food',
      price_vnd: 60000,
      unit: 'bát',
      box_2d: [100, 100, 140, 850],
      box_source: 'ocr',
      confidence: 0.95,
    },
    {
      name_vi: 'Món mờ',
      name_en: 'Blurry dish',
      category: 'street_food',
      price_vnd: 40000,
      unit: 'bát',
      box_2d: [200, 100, 230, 850],
      box_source: 'ocr',
      confidence: 0.55, // < 0.7 -> flagged
    },
  ];

  const flagged = findFlaggedItemIndices(items, []);
  assert.deepEqual(flagged, [1]);

  const crop = computePaddedUpscaledCrop([200, 100, 230, 850], 1200, 1600);
  assert.ok(Math.min(crop.targetWidth, crop.targetHeight) >= 768);
  assert.equal(shouldReplaceWithSecondPass(items[1], 'Món mới'), true);
  assert.equal(shouldReplaceWithSecondPass(items[1], 'Hoàn toàn khác biệt hoàn toàn'), false);
});
