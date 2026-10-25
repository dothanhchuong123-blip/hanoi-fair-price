import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  detectDocumentFallback,
  DocBox,
  padBox,
  renderCrop,
} from '../lib/detectDocument';
import {
  detectQuad,
  isOpenCvReady,
  loadOpenCv,
  maxCornerMovement,
  QuadCorners,
  smoothQuad,
  warpFlat,
} from '../lib/menuQuad';
import { Button } from './ui';

export interface CapturedFrame {
  dataUrl: string;
  mimeType: string;
  /** True when the frame was perspective-warped or cropped to a detected menu / sheet */
  cropped: boolean;
}

export interface CameraViewfinderHandle {
  /** Grabs what's on screen as a JPEG, perspective-warped to the detected quad if present. */
  capture: () => CapturedFrame | null;
}

interface CameraViewfinderProps {
  lang: 'en' | 'vi';
  facingMode: 'environment' | 'user';
  onUploadInstead: () => void;
  /** Called when a menu quad is locked or lost */
  onLockChange?: (locked: boolean) => void;
  /** Called when auto-capture 1s countdown starts or cancels */
  onAutoCaptureChange?: (countingDown: boolean) => void;
  /** Called after 1s of stable quad lock to trigger capture */
  onAutoCapture?: () => void;
}

type CameraStatus = 'starting' | 'live' | 'denied' | 'unavailable';

const BASE_INTERVAL_MS = 166; // ~6 Hz
const EMA_ALPHA = 0.5;
const STABLE_REQUIRED = 5;
const MOVEMENT_THRESHOLD = 0.02; // 2% of frame width
const MISS_FRAMES = 3;

function boxDistance(a: DocBox, b: DocBox): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.w - b.w),
    Math.abs(a.h - b.h)
  );
}

export const CameraViewfinder = forwardRef<CameraViewfinderHandle, CameraViewfinderProps>(
  (
    {
      lang,
      facingMode,
      onUploadInstead,
      onLockChange,
      onAutoCaptureChange,
      onAutoCapture,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvas320Ref = useRef<HTMLCanvasElement | null>(null);

    const [status, setStatus] = useState<CameraStatus>('starting');
    const [cvReady, setCvReady] = useState<boolean>(() => isOpenCvReady());

    // Normalized [0..1] quad corners [TL, TR, BR, BL] when OpenCV is active
    const [quad, setQuad] = useState<QuadCorners | null>(null);
    const quadRef = useRef<QuadCorners | null>(null);

    // Fallback DocBox while OpenCV is still loading
    const [fallbackBox, setFallbackBox] = useState<DocBox | null>(null);
    const fallbackBoxRef = useRef<DocBox | null>(null);

    const [locked, setLocked] = useState(false);
    const lockedRef = useRef(false);

    // Keep latest callbacks in refs so detection loop never restarts when parent re-renders
    const onLockChangeRef = useRef(onLockChange);
    const onAutoCaptureChangeRef = useRef(onAutoCaptureChange);
    const onAutoCaptureRef = useRef(onAutoCapture);
    useEffect(() => {
      onLockChangeRef.current = onLockChange;
      onAutoCaptureChangeRef.current = onAutoCaptureChange;
      onAutoCaptureRef.current = onAutoCapture;
    }, [onLockChange, onAutoCaptureChange, onAutoCapture]);

    // 1. Start camera stream, then lazy-load @techstark/opencv-js
    useEffect(() => {
      let stream: MediaStream | null = null;
      let cancelled = false;

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable');
        return;
      }

      setStatus('starting');
      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(() => {});
          }
          setStatus('live');

          // Lazy-load OpenCV.js only after the camera starts
          loadOpenCv()
            .then(() => {
              if (!cancelled) setCvReady(true);
            })
            .catch((err) => {
              console.warn('OpenCV lazy load failed, using fallback detector', err);
            });
        })
        .catch((err: DOMException) => {
          if (cancelled) return;
          setStatus(err?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
        });

      return () => {
        cancelled = true;
        stream?.getTracks().forEach((t) => t.stop());
      };
    }, [facingMode]);

    const visibleRect = () => {
      const video = videoRef.current;
      const container = containerRef.current;
      if (!video || !container || !video.videoWidth || !video.videoHeight) return null;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = container.clientWidth || 320;
      const ch = container.clientHeight || 426;
      const scale = Math.max(cw / vw, ch / vh);
      const sw = cw / scale;
      const sh = ch / scale;
      return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
    };

    // 2. Run detection loop at ~6 Hz using requestVideoFrameCallback (fallback to requestAnimationFrame)
    useEffect(() => {
      if (status !== 'live') return;

      let cancelled = false;
      let rafId: number | null = null;
      let rvfcId: number | null = null;
      let fallbackTimerId: number | null = null;
      let autoCaptureTimer: number | null = null;

      let lastDetectTime = 0;
      let dynamicIntervalMs = BASE_INTERVAL_MS;
      let stableCount = 0;
      let misses = 0;
      let prevRawQuad: QuadCorners | null = null;
      let isCountingDown = false;

      const updateLock = (next: boolean) => {
        if (lockedRef.current === next) return;
        lockedRef.current = next;
        setLocked(next);
        onLockChangeRef.current?.(next);
        if (next) navigator.vibrate?.(12);
      };

      const updateCountdown = (next: boolean) => {
        if (isCountingDown === next) return;
        isCountingDown = next;
        onAutoCaptureChangeRef.current?.(next);
      };

      const cancelAutoCapture = () => {
        if (autoCaptureTimer !== null) {
          window.clearTimeout(autoCaptureTimer);
          autoCaptureTimer = null;
        }
        updateCountdown(false);
      };

      const runDetectionStep = (now: number) => {
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;

        if (now - lastDetectTime >= dynamicIntervalMs && !document.hidden) {
          lastDetectTime = now;
          const rect = visibleRect();
          if (rect && rect.sw > 0 && rect.sh > 0) {
            if (isOpenCvReady()) {
              // Reuse 320px canvas
              const w = 320;
              const h = Math.max(1, Math.round((rect.sh / rect.sw) * w));
              if (!canvas320Ref.current) {
                canvas320Ref.current = document.createElement('canvas');
              }
              const c320 = canvas320Ref.current;
              if (c320.width !== w) c320.width = w;
              if (c320.height !== h) c320.height = h;

              const ctx = c320.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, w, h);
                const t0 = performance.now();
                const detected = detectQuad(c320);
                const elapsed = performance.now() - t0;

                // Do not block the main thread for more than ~20ms; lower rate if slower
                if (elapsed > 20) {
                  dynamicIntervalMs = Math.min(600, Math.round(elapsed * 8));
                } else {
                  dynamicIntervalMs = BASE_INTERVAL_MS;
                }

                if (detected) {
                  misses = 0;
                  const rawNorm: QuadCorners = detected.map((p) => ({
                    x: p.x / w,
                    y: p.y / h,
                  })) as QuadCorners;

                  const movement = prevRawQuad
                    ? maxCornerMovement(prevRawQuad, rawNorm, 1)
                    : 1;
                  prevRawQuad = rawNorm;

                  const smoothed = smoothQuad(quadRef.current, rawNorm, EMA_ALPHA);
                  quadRef.current = smoothed;
                  setQuad(smoothed);
                  setFallbackBox(null);

                  if (movement < MOVEMENT_THRESHOLD) {
                    stableCount += 1;
                  } else {
                    stableCount = 1;
                    cancelAutoCapture();
                  }

                  updateLock(true);

                  if (stableCount >= STABLE_REQUIRED) {
                    updateCountdown(true);
                    if (autoCaptureTimer === null) {
                      autoCaptureTimer = window.setTimeout(() => {
                        autoCaptureTimer = null;
                        if (!cancelled && lockedRef.current) {
                          updateCountdown(false);
                          onAutoCaptureRef.current?.();
                        }
                      }, 1000);
                    }
                  }
                } else {
                  misses += 1;
                  stableCount = 0;
                  prevRawQuad = null;
                  cancelAutoCapture();
                  if (misses >= MISS_FRAMES) {
                    quadRef.current = null;
                    setQuad(null);
                    updateLock(false);
                  }
                }
              }
            } else {
              // Fallback brightness heuristic while OpenCV is still loading
              const found = detectDocumentFallback(video, rect);
              if (!found) {
                misses += 1;
                stableCount = 0;
                if (misses >= MISS_FRAMES) {
                  fallbackBoxRef.current = null;
                  setFallbackBox(null);
                  updateLock(false);
                }
              } else {
                misses = 0;
                const prev = fallbackBoxRef.current;
                const next = prev
                  ? {
                      x: prev.x + (found.x - prev.x) * 0.4,
                      y: prev.y + (found.y - prev.y) * 0.4,
                      w: prev.w + (found.w - prev.w) * 0.4,
                      h: prev.h + (found.h - prev.h) * 0.4,
                    }
                  : found;
                stableCount = prev && boxDistance(prev, found) < 0.06 ? stableCount + 1 : 1;
                fallbackBoxRef.current = next;
                setFallbackBox(next);
                updateLock(stableCount >= 3);
              }
            }
          }
        }

        scheduleNextFrame();
      };

      const scheduleNextFrame = () => {
        if (cancelled) return;
        const video = videoRef.current as any;
        if (video && typeof video.requestVideoFrameCallback === 'function') {
          rvfcId = video.requestVideoFrameCallback((now: number) => {
            if (fallbackTimerId !== null) {
              window.clearTimeout(fallbackTimerId);
              fallbackTimerId = null;
            }
            runDetectionStep(now);
          });
          // Fallback in case synthetic/paused video stream does not fire rVFC promptly
          fallbackTimerId = window.setTimeout(() => {
            fallbackTimerId = null;
            if (rvfcId !== null && typeof video.cancelVideoFrameCallback === 'function') {
              video.cancelVideoFrameCallback(rvfcId);
              rvfcId = null;
            }
            rafId = window.requestAnimationFrame(runDetectionStep);
          }, 240);
        } else {
          rafId = window.requestAnimationFrame(runDetectionStep);
        }
      };

      scheduleNextFrame();

      return () => {
        cancelled = true;
        if (rafId !== null) window.cancelAnimationFrame(rafId);
        const video = videoRef.current as any;
        if (rvfcId !== null && video && typeof video.cancelVideoFrameCallback === 'function') {
          video.cancelVideoFrameCallback(rvfcId);
        }
        if (fallbackTimerId !== null) window.clearTimeout(fallbackTimerId);
        cancelAutoCapture();
        updateLock(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, cvReady]);

    // 3. Full-resolution capture + perspective warpFlat
    useImperativeHandle(ref, () => ({
      capture: () => {
        const video = videoRef.current;
        const rect = visibleRect();
        if (status !== 'live' || !video || !rect) return null;

        if (isOpenCvReady() && quadRef.current) {
          const fullCanvas = document.createElement('canvas');
          fullCanvas.width = Math.max(1, Math.round(rect.sw));
          fullCanvas.height = Math.max(1, Math.round(rect.sh));
          const fullCtx = fullCanvas.getContext('2d');
          if (fullCtx) {
            fullCtx.drawImage(
              video,
              rect.sx,
              rect.sy,
              rect.sw,
              rect.sh,
              0,
              0,
              fullCanvas.width,
              fullCanvas.height
            );
            const fullCorners: QuadCorners = quadRef.current.map((p) => ({
              x: p.x * fullCanvas.width,
              y: p.y * fullCanvas.height,
            })) as QuadCorners;
            const flattened = warpFlat(fullCanvas, fullCorners);
            const dataUrl = flattened.toDataURL('image/jpeg', 0.88);
            return { dataUrl, mimeType: 'image/jpeg', cropped: true };
          }
        }

        const cropBox =
          lockedRef.current && fallbackBoxRef.current ? padBox(fallbackBoxRef.current) : null;
        const dataUrl = renderCrop(video, rect, cropBox);
        return dataUrl ? { dataUrl, mimeType: 'image/jpeg', cropped: Boolean(cropBox) } : null;
      },
    }));

    const blocked = status === 'denied' || status === 'unavailable';
    const mirror = facingMode === 'user';

    // Mirror X coordinate if front-facing camera
    const displayQuad: QuadCorners | null = quad
      ? (quad.map((p) => ({
          x: (mirror ? 1 - p.x : p.x) * 100,
          y: p.y * 100,
        })) as QuadCorners)
      : null;

    const polyPoints = displayQuad
      ? displayQuad.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
      : '';

    const maskPath = displayQuad
      ? `M 0 0 H 100 V 100 H 0 Z M ${displayQuad[0].x.toFixed(2)} ${displayQuad[0].y.toFixed(
          2
        )} L ${displayQuad[1].x.toFixed(2)} ${displayQuad[1].y.toFixed(
          2
        )} L ${displayQuad[2].x.toFixed(2)} ${displayQuad[2].y.toFixed(
          2
        )} L ${displayQuad[3].x.toFixed(2)} ${displayQuad[3].y.toFixed(2)} Z`
      : '';

    return (
      <div
        ref={containerRef}
        data-testid="camera-viewfinder"
        data-quad-locked={locked ? 'true' : 'false'}
        className="relative w-full aspect-[3/4] max-h-[min(430px,54vh)] rounded-[20px] overflow-hidden bg-camera"
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            status === 'live' ? 'opacity-100' : 'opacity-0'
          } ${mirror ? '-scale-x-100' : ''}`}
        />

        {/* OpenCV Live Quad Overlay matching Screenshot 03 */}
        {status === 'live' && displayQuad && (
          <svg
            data-testid="menu-quad-overlay"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          >
            <defs>
              <clipPath id="menu-quad-clip">
                <polygon points={polyPoints} />
              </clipPath>
              <filter id="brand-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.8" result="blur" />
              </filter>
            </defs>

            {/* Dim everything outside the detected quad */}
            <path d={maskPath} fillRule="evenodd" fill="rgba(8, 8, 10, 0.58)" />

            {/* Soft brand-blue outer glow behind the white outline */}
            <polygon
              points={polyPoints}
              fill="none"
              stroke="#C8361D"
              strokeWidth="2.8"
              strokeLinejoin="round"
              filter="url(#brand-glow)"
              opacity="0.75"
            />

            {/* Animated brand-blue scan line inside the quad */}
            {locked && (
              <g clipPath="url(#menu-quad-clip)">
                <rect
                  x="0"
                  y="0"
                  width="100"
                  height="0.9"
                  fill="#C8361D"
                  style={{
                    filter: 'drop-shadow(0 0 6px #C8361D)',
                  }}
                >
                  <animate
                    attributeName="y"
                    values={`${Math.min(displayQuad[0].y, displayQuad[1].y)};${Math.max(
                      displayQuad[2].y,
                      displayQuad[3].y
                    )};${Math.min(displayQuad[0].y, displayQuad[1].y)}`}
                    dur="2.2s"
                    repeatCount="indefinite"
                  />
                </rect>
              </g>
            )}

            {/* Crisp white quad outline matching Screenshot 03 */}
            <polygon
              points={polyPoints}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.0"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Fallback DocBox while OpenCV is still loading */}
        {status === 'live' && !displayQuad && fallbackBox && (
          <div
            aria-hidden="true"
            className="absolute pointer-events-none rounded-[14px] transition-all duration-200 ease-out z-10"
            style={{
              left: `${(mirror ? 1 - fallbackBox.x - fallbackBox.w : fallbackBox.x) * 100}%`,
              top: `${fallbackBox.y * 100}%`,
              width: `${fallbackBox.w * 100}%`,
              height: `${fallbackBox.h * 100}%`,
              boxShadow: locked
                ? '0 0 0 2000px rgba(8,8,10,0.45)'
                : '0 0 0 2000px rgba(8,8,10,0.12)',
              border: locked ? '2px solid #C8361D' : '2px solid rgba(255,255,255,0.85)',
            }}
          />
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/75 text-[14px] font-medium">
            {lang === 'en' ? 'Starting camera…' : 'Đang mở camera…'}
          </div>
        )}

        {blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-7 text-center">
            <div className="text-white font-display text-[20px] leading-tight">
              {status === 'denied'
                ? lang === 'en'
                  ? 'Camera access is off'
                  : 'Camera đang bị chặn'
                : lang === 'en'
                ? 'No camera found'
                : 'Không tìm thấy camera'}
            </div>
            <p className="text-white/70 text-[13.5px] leading-snug">
              {status === 'denied'
                ? lang === 'en'
                  ? 'Allow camera access in your browser settings, or pick a photo from your gallery.'
                  : 'Hãy cho phép camera trong cài đặt trình duyệt, hoặc chọn ảnh từ thư viện.'
                : lang === 'en'
                ? 'You can still pick a photo from your gallery or turn on Demo.'
                : 'Bạn vẫn có thể chọn ảnh từ thư viện hoặc bật chế độ Demo.'}
            </p>
            <Button variant="brand" size="sm" onClick={onUploadInstead} className="mt-1">
              {lang === 'en' ? 'Choose a photo' : 'Chọn ảnh'}
            </Button>
          </div>
        )}
      </div>
    );
  }
);

CameraViewfinder.displayName = 'CameraViewfinder';
