import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CanvasLike,
  detectQuad,
  getLastDetectQuadMs,
  loadOpenCv,
  maxCornerMovement,
  orderCorners,
  Point,
  QuadCorners,
  smoothQuad,
  warpFlat,
} from './menuQuad';

/**
 * Minimal in-memory RGBA canvas for deterministic Node unit testing of OpenCV.js
 * detectQuad and warpFlat.
 */
class MockCanvas implements CanvasLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;

  constructor(width: number, height: number, bg: [number, number, number, number] = [12, 12, 16, 255]) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      this.data[i * 4] = bg[0];
      this.data[i * 4 + 1] = bg[1];
      this.data[i * 4 + 2] = bg[2];
      this.data[i * 4 + 3] = bg[3];
    }
  }

  /** Fills a convex polygon with an RGBA color using half-plane tests. */
  fillPolygon(poly: QuadCorners, color: [number, number, number, number]) {
    const inside = (px: number, py: number) => {
      for (let i = 0; i < 4; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % 4];
        const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
        if (cross < 0) return false;
      }
      return true;
    };

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (inside(x, y)) {
          const idx = (y * this.width + x) * 4;
          this.data[idx] = color[0];
          this.data[idx + 1] = color[1];
          this.data[idx + 2] = color[2];
          this.data[idx + 3] = color[3];
        }
      }
    }
  }

  getContext(_type: '2d') {
    return {
      getImageData: (_sx: number, _sy: number, sw: number, sh: number) => ({
        data: this.data,
        width: sw,
        height: sh,
      }),
      putImageData: (imgData: { data: Uint8ClampedArray; width: number; height: number }) => {
        this.data = new Uint8ClampedArray(imgData.data);
      },
    };
  }
}

test('orderCorners orders scrambled vertices into TL, TR, BR, BL', () => {
  const tl: Point = { x: 45, y: 55 };
  const tr: Point = { x: 270, y: 40 };
  const br: Point = { x: 285, y: 360 };
  const bl: Point = { x: 35, y: 375 };

  const ordered = orderCorners([br, tl, bl, tr]);
  assert.deepEqual(ordered, [tl, tr, br, bl]);
});

test('smoothQuad applies EMA with alpha=0.5 and maxCornerMovement measures normalized displacement', () => {
  const q1: QuadCorners = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ];
  const q2: QuadCorners = [
    { x: 0.11, y: 0.1 },
    { x: 0.91, y: 0.1 },
    { x: 0.91, y: 0.9 },
    { x: 0.11, y: 0.9 },
  ];

  const move = maxCornerMovement(q1, q2, 1);
  assert.ok(move < 0.02 && move > 0.009);

  const smoothed = smoothQuad(q1, q2, 0.5);
  assert.ok(Math.abs(smoothed[0].x - 0.105) < 1e-6);
});

test('OpenCV detectQuad finds a tilted menu sheet and warpFlat flattens it to true edge aspect ratio', async () => {
  await loadOpenCv();

  const canvas320 = new MockCanvas(320, 426, [15, 15, 20, 255]);
  const expectedQuad: QuadCorners = [
    { x: 42, y: 60 }, // TL
    { x: 278, y: 44 }, // TR
    { x: 290, y: 366 }, // BR
    { x: 32, y: 382 }, // BL
  ];
  canvas320.fillPolygon(expectedQuad, [239, 230, 208, 255]);

  const detected = detectQuad(canvas320);
  assert.ok(detected, 'Expected detectQuad to return a 4-point contour');

  for (let i = 0; i < 4; i++) {
    const dist = Math.hypot(
      detected[i].x - expectedQuad[i].x,
      detected[i].y - expectedQuad[i].y
    );
    assert.ok(
      dist <= 8,
      `Corner ${i} (${detected[i].x},${detected[i].y}) should be close to (${expectedQuad[i].x},${expectedQuad[i].y}), dist=${dist}`
    );
  }

  const detectMs = getLastDetectQuadMs();
  assert.ok(detectMs !== null && detectMs >= 0, 'Expected detectQuad timing to be recorded');

  // Test warpFlat on the tilted sheet
  const warped = warpFlat(
    canvas320,
    detected,
    (w, h) => new MockCanvas(w, h)
  );

  // Expected width ~245-260px, height ~320-330px
  assert.ok(warped.width >= 225 && warped.width <= 275, `Unexpected warped width: ${warped.width}`);
  assert.ok(warped.height >= 300 && warped.height <= 350, `Unexpected warped height: ${warped.height}`);

  // Center pixel of the flattened menu should be the cream paper color [239, 230, 208]
  const centerIdx = (Math.floor(warped.height / 2) * warped.width + Math.floor(warped.width / 2)) * 4;
  assert.ok(warped.data[centerIdx] > 220, 'Center of warped menu should be bright cream paper');
});
