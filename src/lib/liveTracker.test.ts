import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Box2D,
  computeBoxIoU,
  computeCenterDistanceRatio,
  isIOSUserAgent,
  LiveTrackState,
  matchGeminiToMediaPipe,
  parseStallMask,
  resolveInitialDelegate,
  seedOpticalFlowPoints,
  shiftBoxByFlow,
  smoothBox2D,
  stepOpticalFlowTrack,
  transformPolygonToBox,
  updateMediaPipeTracks,
} from './liveTracker';
import { loadOpenCv } from './menuQuad';
import { EvaluatedItem } from '../agent/types';

function makeDummyEvaluatedItem(index: number, nameVi: string, box: Box2D): EvaluatedItem {
  return {
    index,
    perceived: {
      name_vi: nameVi,
      name_en: nameVi,
      category: 'fruit',
      price_vnd: 80000,
      unit: 'kg',
      box_2d: box,
      confidence: 0.9,
    },
    normalized: {
      index,
      perceived: {
        name_vi: nameVi,
        name_en: nameVi,
        category: 'fruit',
        price_vnd: 80000,
        unit: 'kg',
        box_2d: box,
        confidence: 0.9,
      },
      matched_id: 'xoai_cat',
      match_score: 1,
      normalized_price_vnd: 80000,
      normalized_unit: 'kg',
      needs_confirmation: false,
    },
    reference: null,
    base_reference: null,
    factors: [],
    judgment: {
      verdict: 'fair',
      ratio: 1,
      pct_above_median: 0,
      pct_above_high: 0,
      quoted_vnd: 80000,
      reference: null,
      confidence: 0.9,
    },
    response: {
      explanation_en: '',
      explanation_vi: '',
      phrase_header_en: '',
      phrase_header_vi: '',
      phrase_vi: '',
      pronunciation: '',
      phrase_en: '',
      tip_en: '',
      tip_vi: '',
      more_phrases: [],
    },
  };
}

test('isIOSUserAgent detects iPhone/iPad and resolveInitialDelegate defaults to CPU on iOS', () => {
  const iphoneUa =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
  const androidUa =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

  assert.equal(isIOSUserAgent(iphoneUa), true);
  assert.equal(isIOSUserAgent(androidUa), false);

  assert.equal(resolveInitialDelegate('auto', iphoneUa), 'CPU');
  assert.equal(resolveInitialDelegate('auto', androidUa), 'GPU');
  assert.equal(resolveInitialDelegate('CPU', androidUa), 'CPU');
  assert.equal(resolveInitialDelegate('GPU', iphoneUa), 'GPU');
});

test('matchGeminiToMediaPipe matches by IoU > 0.3, falls back to center distance < 0.5x diagonal, and assigns unmatched to optical_flow', () => {
  const geminiBoxes: { itemIndex: number; box: Box2D }[] = [
    // Item 0: Cam (matches MediaPipe box 0 with high IoU)
    { itemIndex: 0, box: [100, 600, 400, 900] },
    // Item 1: Chuối (small IoU with MediaPipe box 1, but center distance < 0.5x diagonal)
    { itemIndex: 1, box: [500, 600, 800, 900] },
    // Item 2: Xoài (no MediaPipe detection near it -> optical_flow)
    { itemIndex: 2, box: [150, 50, 750, 500] },
  ];

  const mpDetections = [
    { box: [110, 610, 390, 890] as Box2D, score: 0.82, categoryName: 'orange' },
    // Smaller box near center of [500, 600, 800, 900] -> IoU < 0.3, center distance = 0
    { box: [600, 700, 700, 800] as Box2D, score: 0.65, categoryName: 'banana' },
  ];

  assert.ok(computeBoxIoU(geminiBoxes[0].box, mpDetections[0].box) > 0.3);
  assert.ok(computeBoxIoU(geminiBoxes[1].box, mpDetections[1].box) < 0.3);
  assert.ok(computeCenterDistanceRatio(geminiBoxes[1].box, mpDetections[1].box) < 0.5);

  const matched = matchGeminiToMediaPipe(geminiBoxes, mpDetections);
  assert.equal(matched.length, 3);

  assert.equal(matched[0].mode, 'mediapipe');
  assert.equal(matched[0].matchedMpIndex, 0);

  assert.equal(matched[1].mode, 'mediapipe');
  assert.equal(matched[1].matchedMpIndex, 1);

  assert.equal(matched[2].mode, 'optical_flow');
  assert.equal(matched[2].matchedMpIndex, null);
});

test('updateMediaPipeTracks smooths with EMA (alpha 0.5) and drops tracks after 10 missed frames', () => {
  const initialBox: Box2D = [100, 100, 300, 300];
  const track: LiveTrackState = {
    trackId: 'mp-0',
    itemIndex: 0,
    item: makeDummyEvaluatedItem(0, 'Cam', initialBox),
    mode: 'mediapipe',
    initialBox,
    box: [...initialBox] as Box2D,
    missedFrames: 0,
    visible: true,
    dropped: false,
    flowPoints: [],
    framesSinceSeed: 0,
    parsedMask: { kind: 'box' },
  };

  // Shifted box with IoU > 0.3
  const nextMpBox: Box2D = [120, 140, 320, 340];
  updateMediaPipeTracks([track], [{ box: nextMpBox, score: 0.8, categoryName: 'orange' }]);

  // EMA alpha 0.5 -> halfway between [100, 100, 300, 300] and [120, 140, 320, 340]
  assert.deepEqual(track.box, [110, 120, 310, 320]);
  assert.equal(track.missedFrames, 0);
  assert.equal(track.dropped, false);

  // Miss 10 frames -> still alive on frame 10, dropped on frame 11 (> 10 missed frames)
  for (let i = 1; i <= 10; i++) {
    updateMediaPipeTracks([track], []);
    assert.equal(track.missedFrames, i);
    assert.equal(track.dropped, false);
  }
  updateMediaPipeTracks([track], []);
  assert.equal(track.missedFrames, 11);
  assert.equal(track.dropped, true);
  assert.equal(track.visible, false);
});

test('OpenCV optical flow seeds goodFeaturesToTrack, shifts box via calcOpticalFlowPyrLK, re-seeds at 30 frames, and fades if <5 points survive', async () => {
  const cv = await loadOpenCv();
  const w = 320;
  const h = 240;

  const drawTexturedPatch = (mat: any, offsetX: number, offsetY: number) => {
    mat.setTo(new cv.Scalar(30));
    // Draw a 6x4 grid of bright small squares inside the mango pile area so goodFeaturesToTrack finds >= 15 strong corners
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        const x = 50 + gx * 18 + offsetX;
        const y = 50 + gy * 18 + offsetY;
        const roi = mat.roi(new cv.Rect(x, y, 8, 8));
        roi.setTo(new cv.Scalar(235));
        roi.delete();
      }
    }
  };

  const gray1 = new cv.Mat(h, w, cv.CV_8UC1);
  const gray2 = new cv.Mat(h, w, cv.CV_8UC1);

  try {
    drawTexturedPatch(gray1, 0, 0);
    // Shift textured pile by (+6px, +4px) on the 320x240 frame
    drawTexturedPatch(gray2, 6, 4);

    const initialBox: Box2D = [150, 120, 600, 500];
    const pts = seedOpticalFlowPoints(cv, gray1, initialBox, w, h);
    assert.ok(pts.length >= 5 && pts.length <= 20, `expected 5..20 points, got ${pts.length}`);

    const track: LiveTrackState = {
      trackId: 'flow-0',
      itemIndex: 0,
      item: makeDummyEvaluatedItem(0, 'Xoài', initialBox),
      mode: 'optical_flow',
      initialBox,
      box: [...initialBox] as Box2D,
      missedFrames: 0,
      visible: true,
      dropped: false,
      flowPoints: pts,
      framesSinceSeed: 29, // Next frame is frame 30 -> triggers re-seed
      parsedMask: { kind: 'box' },
    };

    stepOpticalFlowTrack(cv, gray1, gray2, track, w, h);
    assert.equal(track.visible, true);
    // Box should have shifted right and down
    assert.ok(track.box[1] > initialBox[1], `expected xmin ${track.box[1]} > ${initialBox[1]}`);
    assert.ok(track.box[0] > initialBox[0], `expected ymin ${track.box[0]} > ${initialBox[0]}`);
    // Re-seeded on frame 30
    assert.equal(track.framesSinceSeed, 0);

    // If fewer than 5 points survive, label fades out (visible = false)
    track.flowPoints = pts.slice(0, 3);
    stepOpticalFlowTrack(cv, gray1, gray2, track, w, h);
    assert.equal(track.visible, false);
  } finally {
    gray1.delete();
    gray2.delete();
  }
});

test('parseStallMask handles polygon arrays, base64 PNG strings, and missing/invalid masks', () => {
  const box: Box2D = [200, 100, 700, 600];

  const poly = parseStallMask(
    [
      [120, 220],
      [580, 220],
      [590, 680],
      [110, 680],
    ],
    box
  );
  assert.equal(poly.kind, 'polygon');
  if (poly.kind === 'polygon') {
    assert.equal(poly.points.length, 4);
    const moved = transformPolygonToBox(poly.points, box, [250, 150, 750, 650]);
    assert.deepEqual(moved[0], [170, 270]);
  }

  const png = parseStallMask(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    box
  );
  assert.equal(png.kind, 'png');

  assert.equal(parseStallMask(null, box).kind, 'box');
  assert.equal(parseStallMask([[10, 20]], box).kind, 'box');
  assert.equal(parseStallMask('invalid', box).kind, 'box');
});

test('smoothBox2D and shiftBoxByFlow preserve valid 0..1000 bounds', () => {
  const b: Box2D = [100, 200, 300, 400];
  assert.deepEqual(smoothBox2D(b, [200, 300, 400, 500], 0.5), [150, 250, 350, 450]);
  const shifted = shiftBoxByFlow(b, 32, 24, 320, 240);
  assert.deepEqual(shifted, [200, 300, 400, 500]);
});
