/**
 * Live menu quadrilateral detection and perspective flattening with OpenCV.js.
 *
 * OpenCV.js (@techstark/opencv-js) is ~13 MB, so it is lazy-loaded only after
 * the camera stream starts via `loadOpenCv()`.
 */

export interface Point {
  x: number;
  y: number;
}

/** Four corners of a detected menu quadrilateral ordered: [TL, TR, BR, BL] */
export type QuadCorners = [Point, Point, Point, Point];

export interface CanvasLike {
  width: number;
  height: number;
  getContext(
    contextId: '2d',
    options?: CanvasRenderingContext2DSettings
  ): {
    getImageData(sx: number, sy: number, sw: number, sh: number): {
      data: Uint8ClampedArray;
      width: number;
      height: number;
    };
    putImageData(imageData: any, dx: number, dy: number): void;
  } | null;
}

let cvInstance: any = null;
let cvLoadPromise: Promise<any> | null = null;
let loggedDetectMs = false;
let lastDetectMs: number | null = null;

/**
 * Lazy-loads @techstark/opencv-js. Safe to call multiple times.
 * Does not use `onRuntimeInitialized` (which never fires in 4.11+/5.x).
 */
export async function loadOpenCv(): Promise<any> {
  if (cvInstance) return cvInstance;
  if (!cvLoadPromise) {
    cvLoadPromise = (async () => {
      const mod: any = (await import('@techstark/opencv-js')).default;
      const cv = mod instanceof Promise ? await mod : mod; // 4.11+/5.x export a Promise
      cvInstance = cv;
      return cv;
    })();
  }
  return cvLoadPromise;
}

export function isOpenCvReady(): boolean {
  return Boolean(cvInstance);
}

export function getLastDetectQuadMs(): number | null {
  return lastDetectMs;
}

/**
 * Orders 4 points of a convex quadrilateral into [TL, TR, BR, BL].
 */
export function orderCorners(pts: Point[]): QuadCorners {
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;

  // Sort clockwise around the centroid in screen coordinates (x right, y down)
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );

  // Rotate so the top-left corner (minimum x + y) is first
  let tlIdx = 0;
  let minSum = Infinity;
  for (let i = 0; i < 4; i++) {
    const sum = sorted[i].x + sorted[i].y;
    if (sum < minSum) {
      minSum = sum;
      tlIdx = i;
    }
  }

  return [
    { x: sorted[tlIdx].x, y: sorted[tlIdx].y },
    { x: sorted[(tlIdx + 1) % 4].x, y: sorted[(tlIdx + 1) % 4].y },
    { x: sorted[(tlIdx + 2) % 4].x, y: sorted[(tlIdx + 2) % 4].y },
    { x: sorted[(tlIdx + 3) % 4].x, y: sorted[(tlIdx + 3) % 4].y },
  ];
}

/**
 * Exponential moving average (EMA) smoothing for quad corners.
 */
export function smoothQuad(
  prev: QuadCorners | null,
  next: QuadCorners,
  alpha = 0.5
): QuadCorners {
  if (!prev) return next;
  return [0, 1, 2, 3].map((i) => ({
    x: prev[i].x + (next[i].x - prev[i].x) * alpha,
    y: prev[i].y + (next[i].y - prev[i].y) * alpha,
  })) as QuadCorners;
}

/**
 * Returns the maximum corner movement between two quads as a fraction of `frameWidth`.
 */
export function maxCornerMovement(
  a: QuadCorners,
  b: QuadCorners,
  frameWidth = 1
): number {
  const norm = Math.max(1e-6, frameWidth);
  let maxDist = 0;
  for (let i = 0; i < 4; i++) {
    const dist = Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y) / norm;
    if (dist > maxDist) maxDist = dist;
  }
  return maxDist;
}

/**
 * Detects the largest convex 4-point contour covering >= 15% of `canvas320`.
 * Pipeline: grayscale -> GaussianBlur 5x5 -> Canny(50,150) -> dilate 3x3 ->
 *           findContours(RETR_LIST) -> approxPolyDP(0.02 * perimeter).
 * Returns corners ordered [TL, TR, BR, BL] in `canvas320` pixel coordinates.
 */
export function detectQuad(canvas320: CanvasLike): QuadCorners | null {
  const cv = cvInstance;
  if (!cv) return null;

  const w = canvas320.width;
  const h = canvas320.height;
  if (!w || !h) return null;

  const ctx = canvas320.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const t0 = performance.now();

  let src: any = null;
  let gray: any = null;
  let blurred: any = null;
  let edges: any = null;
  let kernel: any = null;
  let dilated: any = null;
  let contours: any = null;
  let hierarchy: any = null;

  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    src = new cv.Mat(h, w, cv.CV_8UC4);
    src.data.set(imgData.data);

    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);

    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    dilated = new cv.Mat();
    cv.dilate(edges, dilated, kernel);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = w * h;
    const minArea = frameArea * 0.15;
    const maxArea = frameArea * 0.99;
    let bestArea = 0;
    let bestPts: Point[] | null = null;

    const count = contours.size();
    for (let i = 0; i < count; i++) {
      const cnt = contours.get(i);
      const approx = new cv.Mat();
      try {
        const peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const area = Math.abs(cv.contourArea(approx));
          if (area >= minArea && area <= maxArea && area > bestArea) {
            const d = approx.data32S;
            bestArea = area;
            bestPts = [
              { x: d[0], y: d[1] },
              { x: d[2], y: d[3] },
              { x: d[4], y: d[5] },
              { x: d[6], y: d[7] },
            ];
          }
        }
      } finally {
        cnt.delete();
        approx.delete();
      }
    }

    const elapsed = performance.now() - t0;
    lastDetectMs = elapsed;
    if (!loggedDetectMs) {
      loggedDetectMs = true;
      console.log(
        `[menuQuad] detectQuad took ${elapsed.toFixed(2)} ms on ${w}x${h} preview canvas`
      );
    } else if (loggedDetectMs === true && elapsed < 20) {
      // Log steady-state timing once after WASM JIT warm-up
      (loggedDetectMs as any) = 'warm';
      console.log(
        `[menuQuad] detectQuad steady-state took ${elapsed.toFixed(2)} ms on ${w}x${h} preview canvas`
      );
    }

    return bestPts ? orderCorners(bestPts) : null;
  } finally {
    src?.delete();
    gray?.delete();
    blurred?.delete();
    edges?.delete();
    kernel?.delete();
    dilated?.delete();
    contours?.delete();
    hierarchy?.delete();
  }
}

/**
 * Perspective-warps the quadrilateral defined by `corners` ([TL, TR, BR, BL])
 * in `fullResCanvas` into a flat, upright canvas whose output size matches
 * the quad's true edge lengths.
 */
export function warpFlat<T extends CanvasLike = HTMLCanvasElement>(
  fullResCanvas: T,
  corners: QuadCorners,
  createCanvas?: (w: number, h: number) => T
): T {
  const cv = cvInstance;
  if (!cv) return fullResCanvas;

  const fw = fullResCanvas.width;
  const fh = fullResCanvas.height;
  if (!fw || !fh) return fullResCanvas;

  const ctx = fullResCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fullResCanvas;

  // Support both pixel coordinates in fullResCanvas and normalized [0..1] coordinates
  const isNormalized = corners.every((c) => c.x <= 1.01 && c.y <= 1.01);
  const [tl, tr, br, bl] = corners.map((c) => ({
    x: isNormalized ? c.x * fw : c.x,
    y: isNormalized ? c.y * fh : c.y,
  })) as QuadCorners;

  const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const heightLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const heightRight = Math.hypot(br.x - tr.x, br.y - tr.y);

  const rawW = Math.max(widthTop, widthBottom);
  const rawH = Math.max(heightLeft, heightRight);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(rawW, rawH, 1));
  const outW = Math.max(1, Math.round(rawW * scale));
  const outH = Math.max(1, Math.round(rawH * scale));

  let src: any = null;
  let dst: any = null;
  let srcTri: any = null;
  let dstTri: any = null;
  let M: any = null;

  try {
    const imgData = ctx.getImageData(0, 0, fw, fh);
    src = new cv.Mat(fh, fw, cv.CV_8UC4);
    src.data.set(imgData.data);

    dst = new cv.Mat();
    srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x,
      tl.y,
      tr.x,
      tr.y,
      br.x,
      br.y,
      bl.x,
      bl.y,
    ]);
    dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      outW - 1,
      0,
      outW - 1,
      outH - 1,
      0,
      outH - 1,
    ]);

    M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(
      src,
      dst,
      M,
      new cv.Size(outW, outH),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 255)
    );

    const outCanvas: T = createCanvas
      ? createCanvas(outW, outH)
      : (document.createElement('canvas') as unknown as T);
    outCanvas.width = outW;
    outCanvas.height = outH;

    const outCtx = outCanvas.getContext('2d');
    if (outCtx) {
      const outBytes = new Uint8ClampedArray(dst.data);
      if (typeof ImageData !== 'undefined') {
        outCtx.putImageData(new ImageData(outBytes, outW, outH), 0, 0);
      } else {
        outCtx.putImageData({ data: outBytes, width: outW, height: outH }, 0, 0);
      }
    }

    return outCanvas;
  } finally {
    src?.delete();
    dst?.delete();
    srcTri?.delete();
    dstTri?.delete();
    M?.delete();
  }
}
