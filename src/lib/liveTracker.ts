/**
 * Part 5: Live AR stall tracker combining MediaPipe EfficientDet-Lite0 (@mediapipe/tasks-vision@1.1.1)
 * with OpenCV.js Lucas-Kanade pyramidal optical flow (calcOpticalFlowPyrLK) for produce items
 * that COCO doesn't know (such as mango or dragon fruit).
 *
 * MediaPipe is lazy-loaded ONLY when Stall live tracking starts, never in Menu mode.
 */

import { EvaluatedItem } from '../agent/types';
import { isOpenCvReady, loadOpenCv, Point } from './menuQuad';

/** Normalized [ymin, xmin, ymax, xmax] in 0..1000 coordinates */
export type Box2D = [number, number, number, number];

export type DelegateType = 'CPU' | 'GPU';
export type DelegatePreference = 'auto' | 'CPU' | 'GPU';

const DELEGATE_STORAGE_KEY = 'cho_mediapipe_delegate';
const WASM_FILESET_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite';

export const TRACKER_IOU_THRESHOLD = 0.3;
export const TRACKER_CENTER_DIAG_RATIO = 0.5;
export const TRACKER_EMA_ALPHA = 0.5;
export const TRACKER_MAX_MISSES = 10;
export const FLOW_MAX_CORNERS = 20;
export const FLOW_MIN_SURVIVING = 5;
export const FLOW_RESEED_INTERVAL = 30;
export const FLOW_WORK_WIDTH = 320;

/**
 * Detects iOS / iPadOS user agents where MediaPipe WebGL GPU delegate has a known WebKit crash on iOS 27 beta.
 */
export function isIOSUserAgent(ua?: string): boolean {
  const agent =
    ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  if (/iPhone|iPad|iPod/i.test(agent)) return true;
  if (
    /Macintosh/i.test(agent) &&
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints ?? 0) > 1
  ) {
    return true;
  }
  return false;
}

export function getDelegatePreference(): DelegatePreference {
  if (typeof localStorage === 'undefined') return 'auto';
  const raw = localStorage.getItem(DELEGATE_STORAGE_KEY);
  if (raw === 'CPU' || raw === 'GPU' || raw === 'auto') return raw;
  return 'auto';
}

export function setDelegatePreference(pref: DelegatePreference): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(DELEGATE_STORAGE_KEY, pref);
}

/**
 * Resolves which delegate to try first given user preference and user-agent.
 * Defaults to 'CPU' on iOS, 'GPU' (with fallback to 'CPU') elsewhere.
 */
export function resolveInitialDelegate(
  pref: DelegatePreference = getDelegatePreference(),
  ua?: string
): DelegateType {
  if (pref === 'CPU') return 'CPU';
  if (pref === 'GPU') return 'GPU';
  return isIOSUserAgent(ua) ? 'CPU' : 'GPU';
}

/**
 * Intersection-over-Union (IoU) for two [ymin, xmin, ymax, xmax] boxes.
 */
export function computeBoxIoU(a: Box2D, b: Box2D): number {
  const [ay1, ax1, ay2, ax2] = a;
  const [by1, bx1, by2, bx2] = b;

  const interY1 = Math.max(ay1, by1);
  const interX1 = Math.max(ax1, bx1);
  const interY2 = Math.min(ay2, by2);
  const interX2 = Math.min(ax2, bx2);

  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;

  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
  const unionArea = areaA + areaB - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Center distance between `geminiBox` and `mpBox` divided by `geminiBox`'s diagonal.
 */
export function computeCenterDistanceRatio(geminiBox: Box2D, mpBox: Box2D): number {
  const [gy1, gx1, gy2, gx2] = geminiBox;
  const [my1, mx1, my2, mx2] = mpBox;

  const gcx = (gx1 + gx2) / 2;
  const gcy = (gy1 + gy2) / 2;
  const mcx = (mx1 + mx2) / 2;
  const mcy = (my1 + my2) / 2;

  const diag = Math.hypot(gx2 - gx1, gy2 - gy1);
  if (diag <= 1e-6) return Infinity;
  return Math.hypot(gcx - mcx, gcy - mcy) / diag;
}

/**
 * Exponential Moving Average (EMA) smoothing for a Box2D.
 */
export function smoothBox2D(prev: Box2D, next: Box2D, alpha = TRACKER_EMA_ALPHA): Box2D {
  return [
    prev[0] + (next[0] - prev[0]) * alpha,
    prev[1] + (next[1] - prev[1]) * alpha,
    prev[2] + (next[2] - prev[2]) * alpha,
    prev[3] + (next[3] - prev[3]) * alpha,
  ];
}

/**
 * Shifts a 0..1000 Box2D by pixel flow (dxPx, dyPx) measured on a frameW x frameH canvas,
 * preserving box dimensions and clamping inside [0..1000].
 */
export function shiftBoxByFlow(
  box: Box2D,
  dxPx: number,
  dyPx: number,
  frameW: number,
  frameH: number
): Box2D {
  if (frameW <= 0 || frameH <= 0) return box;
  const dxNorm = (dxPx / frameW) * 1000;
  const dyNorm = (dyPx / frameH) * 1000;

  const [ymin, xmin, ymax, xmax] = box;
  const bw = xmax - xmin;
  const bh = ymax - ymin;

  const nextXmin = Math.max(0, Math.min(1000 - bw, xmin + dxNorm));
  const nextYmin = Math.max(0, Math.min(1000 - bh, ymin + dyNorm));
  return [nextYmin, nextXmin, nextYmin + bh, nextXmin + bw];
}

export function medianNumber(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeMedianFlow(deltas: { dx: number; dy: number }[]): {
  dx: number;
  dy: number;
} {
  if (deltas.length === 0) return { dx: 0, dy: 0 };
  return {
    dx: medianNumber(deltas.map((d) => d.dx)),
    dy: medianNumber(deltas.map((d) => d.dy)),
  };
}

export type ParsedStallMask =
  | { kind: 'polygon'; points: [number, number][] }
  | { kind: 'png'; dataUrl: string }
  | { kind: 'box' };

/**
 * Parses Gemini's optional `mask` field on a stall item:
 * - Array of [x, y] points (0-1000 image-relative or box-relative) -> { kind: 'polygon', points }
 * - Base64 PNG string (older models) -> { kind: 'png', dataUrl }
 * - Missing or invalid -> { kind: 'box' }
 */
export function parseStallMask(mask: unknown, box_2d: Box2D): ParsedStallMask {
  if (!mask) return { kind: 'box' };

  if (typeof mask === 'string') {
    const trimmed = mask.trim();
    if (!trimmed) return { kind: 'box' };
    if (trimmed.startsWith('data:image/png;base64,')) {
      return { kind: 'png', dataUrl: trimmed };
    }
    // Raw base64 PNG starts with iVBORw0KGgo or valid base64 chars
    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length >= 32) {
      return { kind: 'png', dataUrl: `data:image/png;base64,${trimmed.replace(/\s+/g, '')}` };
    }
    return { kind: 'box' };
  }

  if (Array.isArray(mask) && mask.length >= 3) {
    const rawPts: [number, number][] = [];
    for (const pt of mask) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const x = Number(pt[0]);
        const y = Number(pt[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          rawPts.push([
            Math.max(0, Math.min(1000, x)),
            Math.max(0, Math.min(1000, y)),
          ]);
        }
      } else if (pt && typeof pt === 'object' && 'x' in pt && 'y' in pt) {
        const x = Number((pt as { x: number }).x);
        const y = Number((pt as { y: number }).y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          rawPts.push([
            Math.max(0, Math.min(1000, x)),
            Math.max(0, Math.min(1000, y)),
          ]);
        }
      }
    }

    if (rawPts.length < 3) return { kind: 'box' };

    const [ymin, xmin, ymax, xmax] = box_2d;
    const bw = Math.max(1, xmax - xmin);
    const bh = Math.max(1, ymax - ymin);
    const pad = 65;

    // Count how many points fall inside box_2d when interpreted as [x, y] vs [y, x] (image-relative)
    const insideAsXY = rawPts.filter(
      ([a, b]) => a >= xmin - pad && a <= xmax + pad && b >= ymin - pad && b <= ymax + pad
    ).length;
    const insideAsYX = rawPts.filter(
      ([a, b]) => b >= xmin - pad && b <= xmax + pad && a >= ymin - pad && a <= ymax + pad
    ).length;

    if (insideAsXY >= rawPts.length / 2 || insideAsYX >= rawPts.length / 2) {
      const orientedPts: [number, number][] =
        insideAsYX > insideAsXY
          ? rawPts.map(([y, x]) => [x, y])
          : rawPts;
      return { kind: 'polygon', points: orientedPts };
    }

    // Fallback: if points were returned box-relative (0..1000 within box_2d), map to image-relative
    const isBoxRelative = bw < 750 || bh < 750;
    const imagePts: [number, number][] = isBoxRelative
      ? rawPts.map(([px, py]) => [xmin + (px / 1000) * bw, ymin + (py / 1000) * bh])
      : rawPts;

    return { kind: 'polygon', points: imagePts };
  }

  return { kind: 'box' };
}

/**
 * Transforms image-relative polygon points from `initialBox` to `currentBox` so
 * polygon outlines move and scale with the tracked bounding box.
 */
export function transformPolygonToBox(
  points: [number, number][],
  initialBox: Box2D,
  currentBox: Box2D
): [number, number][] {
  const [iy1, ix1, iy2, ix2] = initialBox;
  const [cy1, cx1, cy2, cx2] = currentBox;
  const ibw = Math.max(1, ix2 - ix1);
  const ibh = Math.max(1, iy2 - iy1);
  const cbw = Math.max(1, cx2 - cx1);
  const cbh = Math.max(1, cy2 - cy1);

  return points.map(([x, y]) => {
    const relX = (x - ix1) / ibw;
    const relY = (y - iy1) / ibh;
    return [cx1 + relX * cbw, cy1 + relY * cbh];
  });
}

export interface MediaPipeDetectionBox {
  box: Box2D;
  score: number;
  categoryName: string;
}

export interface InitialTrackMatch {
  itemIndex: number;
  trackId: string;
  mode: 'mediapipe' | 'optical_flow';
  matchedMpIndex: number | null;
  box: Box2D;
}

/**
 * Greedily matches Gemini items to MediaPipe detections on the captured frame:
 * 1. First pass: greedy by IoU > 0.3
 * 2. Fallback pass: greedy by center distance < 0.5 * Gemini box diagonal
 * Unmatched Gemini items are assigned to OpenCV optical flow tracking.
 */
export function matchGeminiToMediaPipe(
  geminiBoxes: { itemIndex: number; box: Box2D }[],
  mpDetections: MediaPipeDetectionBox[]
): InitialTrackMatch[] {
  const matchedGemini = new Map<number, number>(); // itemIndex -> mpIdx
  const usedMp = new Set<number>();

  // Pass 1: Greedy IoU > 0.3
  const iouPairs: { itemIndex: number; mpIdx: number; iou: number }[] = [];
  for (const g of geminiBoxes) {
    for (let m = 0; m < mpDetections.length; m++) {
      const iou = computeBoxIoU(g.box, mpDetections[m].box);
      if (iou > TRACKER_IOU_THRESHOLD) {
        iouPairs.push({ itemIndex: g.itemIndex, mpIdx: m, iou });
      }
    }
  }
  iouPairs.sort((a, b) => b.iou - a.iou);
  for (const pair of iouPairs) {
    if (matchedGemini.has(pair.itemIndex) || usedMp.has(pair.mpIdx)) continue;
    matchedGemini.set(pair.itemIndex, pair.mpIdx);
    usedMp.add(pair.mpIdx);
  }

  // Pass 2: Fallback center distance < 0.5 * box diagonal
  const distPairs: { itemIndex: number; mpIdx: number; ratio: number }[] = [];
  for (const g of geminiBoxes) {
    if (matchedGemini.has(g.itemIndex)) continue;
    for (let m = 0; m < mpDetections.length; m++) {
      if (usedMp.has(m)) continue;
      const ratio = computeCenterDistanceRatio(g.box, mpDetections[m].box);
      if (ratio < TRACKER_CENTER_DIAG_RATIO) {
        distPairs.push({ itemIndex: g.itemIndex, mpIdx: m, ratio });
      }
    }
  }
  distPairs.sort((a, b) => a.ratio - b.ratio);
  for (const pair of distPairs) {
    if (matchedGemini.has(pair.itemIndex) || usedMp.has(pair.mpIdx)) continue;
    matchedGemini.set(pair.itemIndex, pair.mpIdx);
    usedMp.add(pair.mpIdx);
  }

  return geminiBoxes.map((g, idx) => {
    const mpIdx = matchedGemini.get(g.itemIndex) ?? null;
    if (mpIdx !== null) {
      return {
        itemIndex: g.itemIndex,
        trackId: `mp-${idx}`,
        mode: 'mediapipe',
        matchedMpIndex: mpIdx,
        // Keep Gemini's initial pile box smoothed with the matched MediaPipe box
        box: smoothBox2D(g.box, mpDetections[mpIdx].box, 0.35),
      };
    }
    return {
      itemIndex: g.itemIndex,
      trackId: `flow-${idx}`,
      mode: 'optical_flow',
      matchedMpIndex: null,
      box: [...g.box] as Box2D,
    };
  });
}

export interface LiveTrackState {
  trackId: string;
  itemIndex: number;
  item: EvaluatedItem;
  mode: 'mediapipe' | 'optical_flow';
  initialBox: Box2D;
  box: Box2D;
  missedFrames: number;
  visible: boolean;
  dropped: boolean;
  /** Optical flow points in 320px canvas coordinates */
  flowPoints: Point[];
  framesSinceSeed: number;
  parsedMask: ParsedStallMask;
}

/**
 * Greedily updates MediaPipe tracks against a new frame's MediaPipe detections (IoU > 0.3),
 * smoothing matched boxes with EMA (alpha 0.5) and dropping tracks after 10 missed frames.
 */
export function updateMediaPipeTracks(
  tracks: LiveTrackState[],
  mpDetections: MediaPipeDetectionBox[]
): void {
  const mpTracks = tracks.filter((t) => t.mode === 'mediapipe' && !t.dropped);
  if (mpTracks.length === 0) return;

  const pairs: { track: LiveTrackState; mpIdx: number; iou: number }[] = [];
  for (const track of mpTracks) {
    for (let m = 0; m < mpDetections.length; m++) {
      const iou = computeBoxIoU(track.box, mpDetections[m].box);
      if (iou > TRACKER_IOU_THRESHOLD) {
        pairs.push({ track, mpIdx: m, iou });
      }
    }
  }
  pairs.sort((a, b) => b.iou - a.iou);

  const matchedTrackIds = new Set<string>();
  const usedMp = new Set<number>();

  for (const p of pairs) {
    if (matchedTrackIds.has(p.track.trackId) || usedMp.has(p.mpIdx)) continue;
    matchedTrackIds.add(p.track.trackId);
    usedMp.add(p.mpIdx);

    p.track.box = smoothBox2D(p.track.box, mpDetections[p.mpIdx].box, TRACKER_EMA_ALPHA);
    p.track.missedFrames = 0;
    p.track.visible = true;
  }

  for (const track of mpTracks) {
    if (matchedTrackIds.has(track.trackId)) continue;
    track.missedFrames += 1;
    if (track.missedFrames > TRACKER_MAX_MISSES) {
      track.visible = false;
      track.dropped = true;
    }
  }
}

/**
 * Seeds up to 20 goodFeaturesToTrack (Shi-Tomasi minimum-eigenvalue corners) inside `box`
 * on a 320px grayscale OpenCV Mat. Every temporary Mat is deleted in `finally`.
 */
export function seedOpticalFlowPoints(
  cv: any,
  grayMat: any,
  box: Box2D,
  frameW: number,
  frameH: number
): Point[] {
  const [ymin, xmin, ymax, xmax] = box;
  const rx = Math.max(0, Math.min(frameW - 4, Math.floor((xmin / 1000) * frameW)));
  const ry = Math.max(0, Math.min(frameH - 4, Math.floor((ymin / 1000) * frameH)));
  const rw = Math.max(4, Math.min(frameW - rx, Math.ceil(((xmax - xmin) / 1000) * frameW)));
  const rh = Math.max(4, Math.min(frameH - ry, Math.ceil(((ymax - ymin) / 1000) * frameH)));

  let mask: any = null;
  let roi: any = null;
  let corners: any = null;
  let eig: any = null;

  try {
    if (typeof cv.goodFeaturesToTrack === 'function') {
      mask = cv.Mat.zeros(frameH, frameW, cv.CV_8UC1);
      roi = mask.roi(new cv.Rect(rx, ry, rw, rh));
      roi.setTo(new cv.Scalar(255));

      corners = new cv.Mat();
      cv.goodFeaturesToTrack(grayMat, corners, FLOW_MAX_CORNERS, 0.01, 5, mask, 3, false, 0.04);

      const pts: Point[] = [];
      const rows = corners.rows || 0;
      for (let i = 0; i < rows && pts.length < FLOW_MAX_CORNERS; i++) {
        const x = corners.data32F[i * 2];
        const y = corners.data32F[i * 2 + 1];
        if (Number.isFinite(x) && Number.isFinite(y)) {
          pts.push({ x, y });
        }
      }
      return pts;
    }

    // OpenCV.js 5.0 Shi-Tomasi goodFeaturesToTrack via cornerMinEigenVal on the box ROI
    roi = grayMat.roi(new cv.Rect(rx, ry, rw, rh));
    eig = new cv.Mat();
    cv.cornerMinEigenVal(roi, eig, 3, 3);

    const data = eig.data32F as Float32Array;
    let maxVal = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > maxVal) maxVal = data[i];
    }
    if (maxVal <= 1e-6) return [];

    const threshold = maxVal * 0.01;
    const candidates: { x: number; y: number; val: number }[] = [];

    for (let y = 1; y < rh - 1; y++) {
      for (let x = 1; x < rw - 1; x++) {
        const val = data[y * rw + x];
        if (val < threshold) continue;
        // 3x3 local maximum check
        if (
          val >= data[(y - 1) * rw + (x - 1)] &&
          val >= data[(y - 1) * rw + x] &&
          val >= data[(y - 1) * rw + (x + 1)] &&
          val >= data[y * rw + (x - 1)] &&
          val >= data[y * rw + (x + 1)] &&
          val >= data[(y + 1) * rw + (x - 1)] &&
          val >= data[(y + 1) * rw + x] &&
          val >= data[(y + 1) * rw + (x + 1)]
        ) {
          candidates.push({ x: rx + x, y: ry + y, val });
        }
      }
    }

    candidates.sort((a, b) => b.val - a.val);

    const minDistanceSq = 5 * 5;
    const selected: Point[] = [];
    for (const c of candidates) {
      if (selected.length >= FLOW_MAX_CORNERS) break;
      const tooClose = selected.some(
        (p) => (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y) < minDistanceSq
      );
      if (!tooClose) {
        selected.push({ x: c.x, y: c.y });
      }
    }
    return selected;
  } finally {
    roi?.delete();
    mask?.delete();
    corners?.delete();
    eig?.delete();
  }
}

/**
 * Runs one step of calcOpticalFlowPyrLK at 320px for an optical-flow track.
 * - Shifts box by median flow and smooths with EMA (alpha 0.5)
 * - Re-seeds points every 30 frames
 * - If fewer than 5 points survive, fades the label out (visible = false)
 * - Deletes every OpenCV Mat in `finally`
 */
export function stepOpticalFlowTrack(
  cv: any,
  prevGray: any,
  currGray: any,
  track: LiveTrackState,
  frameW: number,
  frameH: number
): void {
  if (track.dropped) return;

  if (track.flowPoints.length < FLOW_MIN_SURVIVING) {
    track.visible = false;
    return;
  }

  let prevPts: any = null;
  let nextPts: any = null;
  let status: any = null;
  let err: any = null;

  try {
    const n = track.flowPoints.length;
    const flat: number[] = [];
    for (const p of track.flowPoints) {
      flat.push(p.x, p.y);
    }

    prevPts = cv.matFromArray(n, 1, cv.CV_32FC2, flat);
    nextPts = new cv.Mat();
    status = new cv.Mat();
    err = new cv.Mat();

    const winSize = new cv.Size(15, 15);
    const criteria = new cv.TermCriteria(
      (cv.TermCriteria_EPS ?? 2) | (cv.TermCriteria_COUNT ?? 1),
      10,
      0.03
    );

    cv.calcOpticalFlowPyrLK(prevGray, currGray, prevPts, nextPts, status, err, winSize, 2, criteria);

    const surviving: Point[] = [];
    const deltas: { dx: number; dy: number }[] = [];

    for (let i = 0; i < n; i++) {
      if (status.data[i] === 1) {
        const nx = nextPts.data32F[i * 2];
        const ny = nextPts.data32F[i * 2 + 1];
        if (
          Number.isFinite(nx) &&
          Number.isFinite(ny) &&
          nx >= 0 &&
          nx <= frameW &&
          ny >= 0 &&
          ny <= frameH
        ) {
          surviving.push({ x: nx, y: ny });
          deltas.push({
            dx: nx - track.flowPoints[i].x,
            dy: ny - track.flowPoints[i].y,
          });
        }
      }
    }

    if (surviving.length < FLOW_MIN_SURVIVING) {
      track.flowPoints = surviving;
      track.visible = false;
      return;
    }

    const { dx, dy } = computeMedianFlow(deltas);
    const shifted = shiftBoxByFlow(track.box, dx, dy, frameW, frameH);
    track.box = smoothBox2D(track.box, shifted, TRACKER_EMA_ALPHA);
    track.flowPoints = surviving;
    track.visible = true;
    track.framesSinceSeed += 1;

    if (track.framesSinceSeed >= FLOW_RESEED_INTERVAL) {
      const reseeded = seedOpticalFlowPoints(cv, currGray, track.box, frameW, frameH);
      if (reseeded.length >= FLOW_MIN_SURVIVING) {
        track.flowPoints = reseeded;
        track.framesSinceSeed = 0;
      }
    }
  } finally {
    prevPts?.delete();
    nextPts?.delete();
    status?.delete();
    err?.delete();
  }
}

interface LoadedMediaPipeDetector {
  detector: any;
  delegate: DelegateType;
  fileset: any;
  ObjectDetectorClass: any;
}

let cachedDetectorPromise: Promise<LoadedMediaPipeDetector> | null = null;
let cachedDelegatePref: DelegatePreference | null = null;

/**
 * Lazy-loads @mediapipe/tasks-vision@1.1.1 and creates the EfficientDet-Lite0 VIDEO detector.
 * Tries GPU delegate (unless on iOS or CPU preference) and falls back to CPU on error.
 */
export async function loadMediaPipeDetector(
  forcePreference?: DelegatePreference
): Promise<LoadedMediaPipeDetector> {
  const pref = forcePreference ?? getDelegatePreference();
  if (cachedDetectorPromise && cachedDelegatePref === pref) {
    return cachedDetectorPromise;
  }

  cachedDelegatePref = pref;
  cachedDetectorPromise = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const FilesetResolver = vision.FilesetResolver;
    const ObjectDetector = vision.ObjectDetector;

    const fileset = await FilesetResolver.forVisionTasks(WASM_FILESET_URL);
    const initialDelegate = resolveInitialDelegate(pref);

    const createWithDelegate = async (delegate: DelegateType) =>
      ObjectDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_URL,
          delegate,
        },
        runningMode: 'VIDEO',
        scoreThreshold: 0.35,
        maxResults: 20,
      });

    if (initialDelegate === 'GPU') {
      try {
        const detector = await createWithDelegate('GPU');
        console.log('[liveTracker] MediaPipe EfficientDet-Lite0 initialized with GPU delegate');
        return { detector, delegate: 'GPU', fileset, ObjectDetectorClass: ObjectDetector };
      } catch (err) {
        console.warn('[liveTracker] GPU delegate failed, falling back to CPU:', err);
        const detector = await createWithDelegate('CPU');
        console.log('[liveTracker] MediaPipe EfficientDet-Lite0 initialized with CPU fallback');
        return { detector, delegate: 'CPU', fileset, ObjectDetectorClass: ObjectDetector };
      }
    } else {
      try {
        const detector = await createWithDelegate('CPU');
        console.log('[liveTracker] MediaPipe EfficientDet-Lite0 initialized with CPU delegate');
        return { detector, delegate: 'CPU', fileset, ObjectDetectorClass: ObjectDetector };
      } catch (err) {
        console.warn('[liveTracker] CPU delegate failed, trying GPU:', err);
        const detector = await createWithDelegate('GPU');
        return { detector, delegate: 'GPU', fileset, ObjectDetectorClass: ObjectDetector };
      }
    }
  })();

  try {
    return await cachedDetectorPromise;
  } catch (err) {
    cachedDetectorPromise = null;
    throw err;
  }
}

/**
 * Converts a MediaPipe DetectionResult into normalized 0..1000 MediaPipeDetectionBox[].
 */
export function convertMediaPipeDetections(
  result: any,
  frameW: number,
  frameH: number
): MediaPipeDetectionBox[] {
  if (!result?.detections || frameW <= 0 || frameH <= 0) return [];
  const out: MediaPipeDetectionBox[] = [];

  for (const det of result.detections) {
    const bb = det.boundingBox;
    if (!bb) continue;
    const xmin = Math.max(0, Math.min(1000, (bb.originX / frameW) * 1000));
    const ymin = Math.max(0, Math.min(1000, (bb.originY / frameH) * 1000));
    const xmax = Math.max(xmin + 1, Math.min(1000, ((bb.originX + bb.width) / frameW) * 1000));
    const ymax = Math.max(ymin + 1, Math.min(1000, ((bb.originY + bb.height) / frameH) * 1000));
    const cat = det.categories?.[0];
    out.push({
      box: [ymin, xmin, ymax, xmax],
      score: cat?.score ?? 0.5,
      categoryName: cat?.categoryName || 'object',
    });
  }
  return out;
}

export class LiveStallTrackerSession {
  private tracks: LiveTrackState[] = [];
  private prevGrayMat: any = null;
  private workCanvas: HTMLCanvasElement | null = null;
  private lastTimestampMs = 0;
  private loadedMp: LoadedMediaPipeDetector | null = null;
  private cv: any = null;
  private allLostSinceMs: number | null = null;
  private frameTimesMs: number[] = [];
  private activeDelegate: DelegateType = 'CPU';
  private disposed = false;

  async initialize(
    initialSource: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    sourceWidth: number,
    sourceHeight: number,
    evaluatedItems: EvaluatedItem[]
  ): Promise<{ delegate: DelegateType; tracks: LiveTrackState[] }> {
    const [mpRes, cvRes] = await Promise.allSettled([
      loadMediaPipeDetector(),
      loadOpenCv(),
    ]);

    if (mpRes.status === 'fulfilled') {
      this.loadedMp = mpRes.value;
      this.activeDelegate = mpRes.value.delegate;
    } else {
      console.warn('[liveTracker] MediaPipe load failed, using OpenCV optical flow for all tracks:', mpRes.reason);
      this.activeDelegate = 'CPU';
    }

    if (cvRes.status === 'fulfilled') {
      this.cv = cvRes.value;
    } else if (isOpenCvReady()) {
      this.cv = await loadOpenCv();
    }

    // Prepare 320px work canvas & initial grayscale Mat for optical flow
    const w = FLOW_WORK_WIDTH;
    const h = Math.max(1, Math.round((sourceHeight / Math.max(1, sourceWidth)) * w));
    if (typeof document !== 'undefined') {
      this.workCanvas = document.createElement('canvas');
      this.workCanvas.width = w;
      this.workCanvas.height = h;
      const ctx = this.workCanvas.getContext('2d', { willReadFrequently: true });
      ctx?.drawImage(initialSource, 0, 0, w, h);
    }

    // Run MediaPipe once on the captured frame
    const mpBoxes = await this.detectMediaPipeBoxes(
      this.workCanvas ?? initialSource,
      w,
      h,
      performance.now()
    );

    const validItems = evaluatedItems.filter(
      (item) => item.perceived.box_2d && item.perceived.box_2d.length === 4 && !item.perceived.is_addon
    );

    const geminiBoxes = validItems.map((item) => ({
      itemIndex: item.index,
      box: [...item.perceived.box_2d] as Box2D,
    }));

    const matches = matchGeminiToMediaPipe(geminiBoxes, mpBoxes);

    // Build initial prevGrayMat for optical flow tracks
    if (this.cv && this.workCanvas) {
      this.prevGrayMat?.delete();
      this.prevGrayMat = this.extractGrayMat(this.workCanvas);
    }

    this.tracks = matches.map((m) => {
      const item = validItems.find((it) => it.index === m.itemIndex)!;
      const initialBox: Box2D = [...item.perceived.box_2d] as Box2D;
      const parsedMask = parseStallMask(item.perceived.mask, initialBox);

      let flowPoints: Point[] = [];
      let mode = m.mode;

      if (mode === 'optical_flow' && this.cv && this.prevGrayMat) {
        flowPoints = seedOpticalFlowPoints(this.cv, this.prevGrayMat, m.box, w, h);
      }

      return {
        trackId: m.trackId,
        itemIndex: m.itemIndex,
        item,
        mode,
        initialBox,
        box: m.box,
        missedFrames: 0,
        visible: true,
        dropped: false,
        flowPoints,
        framesSinceSeed: 0,
        parsedMask,
      };
    });

    return { delegate: this.activeDelegate, tracks: this.getTracksSnapshot() };
  }

  private extractGrayMat(canvas: HTMLCanvasElement): any {
    if (!this.cv) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    let src: any = null;
    const gray = new this.cv.Mat();
    try {
      src = new this.cv.Mat(h, w, this.cv.CV_8UC4);
      src.data.set(imgData.data);
      this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY, 0);
      return gray;
    } finally {
      src?.delete();
    }
  }

  private async detectMediaPipeBoxes(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    w: number,
    h: number,
    nowMs: number
  ): Promise<MediaPipeDetectionBox[]> {
    if (!this.loadedMp?.detector) return [];
    const ts = Math.max(this.lastTimestampMs + 1, Math.round(nowMs));
    this.lastTimestampMs = ts;

    try {
      const res = this.loadedMp.detector.detectForVideo(source, ts);
      return convertMediaPipeDetections(res, w, h);
    } catch (err) {
      // If GPU delegate failed at first inference in WebKit/headless, switch to CPU fallback
      if (this.activeDelegate === 'GPU' && this.loadedMp.ObjectDetectorClass && this.loadedMp.fileset) {
        try {
          console.warn('[liveTracker] detectForVideo failed on GPU, switching to CPU:', err);
          const cpuDetector = await this.loadedMp.ObjectDetectorClass.createFromOptions(
            this.loadedMp.fileset,
            {
              baseOptions: {
                modelAssetPath: MODEL_ASSET_URL,
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              scoreThreshold: 0.35,
              maxResults: 20,
            }
          );
          this.loadedMp.detector = cpuDetector;
          this.loadedMp.delegate = 'CPU';
          this.activeDelegate = 'CPU';
          const retryTs = this.lastTimestampMs + 1;
          this.lastTimestampMs = retryTs;
          const res = cpuDetector.detectForVideo(source, retryTs);
          return convertMediaPipeDetections(res, w, h);
        } catch (cpuErr) {
          console.warn('[liveTracker] CPU fallback inference also failed:', cpuErr);
        }
      }
      return [];
    }
  }

  async processFrame(
    source: HTMLVideoElement | HTMLCanvasElement,
    sourceWidth: number,
    sourceHeight: number,
    nowMs: number
  ): Promise<{
    tracks: LiveTrackState[];
    fps: number;
    delegate: DelegateType;
    lostOver2s: boolean;
  }> {
    if (this.disposed) {
      return { tracks: [], fps: 0, delegate: this.activeDelegate, lostOver2s: false };
    }

    const t0 = performance.now();
    const w = FLOW_WORK_WIDTH;
    const h = Math.max(1, Math.round((sourceHeight / Math.max(1, sourceWidth)) * w));

    if (!this.workCanvas && typeof document !== 'undefined') {
      this.workCanvas = document.createElement('canvas');
    }

    if (this.workCanvas) {
      if (this.workCanvas.width !== w) this.workCanvas.width = w;
      if (this.workCanvas.height !== h) this.workCanvas.height = h;
      const ctx = this.workCanvas.getContext('2d', { willReadFrequently: true });
      ctx?.drawImage(source, 0, 0, w, h);
    }

    // 1. MediaPipe detection step
    const hasMpTracks = this.tracks.some((t) => t.mode === 'mediapipe' && !t.dropped);
    if (hasMpTracks && this.loadedMp?.detector) {
      const mpBoxes = await this.detectMediaPipeBoxes(this.workCanvas ?? source, w, h, nowMs);
      updateMediaPipeTracks(this.tracks, mpBoxes);
    }

    // 2. OpenCV optical flow step at 320px
    if (this.cv && this.workCanvas) {
      const currGray = this.extractGrayMat(this.workCanvas);
      if (currGray) {
        try {
          if (this.prevGrayMat && this.prevGrayMat.rows === currGray.rows && this.prevGrayMat.cols === currGray.cols) {
            for (const track of this.tracks) {
              if (track.mode === 'optical_flow' && !track.dropped) {
                stepOpticalFlowTrack(this.cv, this.prevGrayMat, currGray, track, w, h);
              }
            }
          }
        } finally {
          this.prevGrayMat?.delete();
          this.prevGrayMat = currGray;
        }
      }
    }

    // Measure rolling FPS
    const frameEnd = performance.now();
    this.frameTimesMs.push(frameEnd);
    while (this.frameTimesMs.length > 15) {
      this.frameTimesMs.shift();
    }
    let fps = 10;
    if (this.frameTimesMs.length >= 2) {
      const spanMs = this.frameTimesMs[this.frameTimesMs.length - 1] - this.frameTimesMs[0];
      const avgInterval = spanMs / (this.frameTimesMs.length - 1);
      // Convert processing & frame cadence into effective FPS (1..30)
      const stepElapsed = Math.max(1, frameEnd - t0);
      const rawFps = avgInterval > 0 ? 1000 / Math.min(avgInterval, Math.max(60, stepElapsed * 1.5)) : 10;
      fps = Math.max(1, Math.min(30, Math.round(rawFps)));
    }

    const anyVisible = this.tracks.some((t) => t.visible && !t.dropped);
    if (!anyVisible && this.tracks.length > 0) {
      if (this.allLostSinceMs === null) {
        this.allLostSinceMs = nowMs;
      }
    } else {
      this.allLostSinceMs = null;
    }

    const lostOver2s =
      this.allLostSinceMs !== null && nowMs - this.allLostSinceMs >= 2000;

    return {
      tracks: this.getTracksSnapshot(),
      fps,
      delegate: this.activeDelegate,
      lostOver2s,
    };
  }

  /**
   * Forces all tracks into lost state (used when testing or when camera points away from stall).
   */
  forceLoseTracking(nowMs = performance.now()): void {
    for (const t of this.tracks) {
      t.visible = false;
      t.flowPoints = [];
    }
    if (this.allLostSinceMs === null) {
      this.allLostSinceMs = nowMs - 2100;
    }
  }

  /**
   * Re-attaches tracks to their initial positions and re-seeds optical flow points on current frame.
   */
  reattachTracks(): void {
    if (!this.workCanvas) return;
    const w = this.workCanvas.width;
    const h = this.workCanvas.height;
    for (const t of this.tracks) {
      t.box = [...t.initialBox] as Box2D;
      t.missedFrames = 0;
      t.dropped = false;
      t.visible = true;
      t.framesSinceSeed = 0;
      if (t.mode === 'optical_flow' && this.cv && this.prevGrayMat) {
        t.flowPoints = seedOpticalFlowPoints(this.cv, this.prevGrayMat, t.box, w, h);
      }
    }
    this.allLostSinceMs = null;
  }

  getTracksSnapshot(): LiveTrackState[] {
    return this.tracks.map((t) => ({
      ...t,
      box: [...t.box] as Box2D,
      initialBox: [...t.initialBox] as Box2D,
      flowPoints: [...t.flowPoints],
    }));
  }

  dispose(): void {
    this.disposed = true;
    if (this.prevGrayMat) {
      try {
        this.prevGrayMat.delete();
      } catch {
        // ignore already deleted
      }
      this.prevGrayMat = null;
    }
  }
}
