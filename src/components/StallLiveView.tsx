import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { EvaluatedItem } from '../agent/types';
import {
  DelegateType,
  LiveStallTrackerSession,
  LiveTrackState,
  transformPolygonToBox,
} from '../lib/liveTracker';
import { VERDICT_STYLES } from './SamplePhotos';
import { Chip } from './ui';

interface StallLiveViewProps {
  lang: 'en' | 'vi';
  evaluatedItems: EvaluatedItem[];
  capturedImageDataUrl?: string | null;
  demoMode: boolean;
  facingMode: 'environment' | 'user';
  onSelectItem: (item: EvaluatedItem) => void;
  onRescan: () => void;
  onTelemetry?: (info: { delegate: DelegateType; fps: number }) => void;
}

/**
 * Draws the synthetic stall scene (or uploaded stall image) onto a 640x480 canvas
 * with realistic handheld camera drift (dx, dy) so MediaPipe detectForVideo and
 * OpenCV calcOpticalFlowPyrLK run on a real 30fps <video> stream when in Demo mode
 * or when a physical camera isn't available.
 */
function drawSyntheticStallFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dx: number,
  dy: number,
  uploadedImg: HTMLImageElement | null
) {
  ctx.save();
  ctx.fillStyle = '#1E1D1A';
  ctx.fillRect(0, 0, w, h);

  ctx.translate(dx, dy);

  if (uploadedImg && uploadedImg.complete && uploadedImg.naturalWidth > 0) {
    ctx.drawImage(uploadedImg, 0, 0, w, h);
    ctx.restore();
    return;
  }

  // Subtle woven stall table background texture
  ctx.fillStyle = '#2B2823';
  ctx.fillRect(0, 0, w, h);

  const drawBasket = (
    bx: number,
    by: number,
    bw: number,
    bh: number,
    fruits: { color1: string; color2: string; leaf: string; cols: number; rows: number },
    label: string
  ) => {
    // Basket rim
    ctx.fillStyle = '#D8D4CA';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 22);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#B7B1A3';
    ctx.stroke();

    // Textured weave lines inside basket (helps goodFeaturesToTrack find strong corners)
    ctx.strokeStyle = 'rgba(90, 78, 60, 0.18)';
    ctx.lineWidth = 1.5;
    for (let x = bx + 14; x < bx + bw - 10; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, by + 10);
      ctx.lineTo(x, by + bh - 12);
      ctx.stroke();
    }
    for (let y = by + 14; y < by + bh - 10; y += 18) {
      ctx.beginPath();
      ctx.moveTo(bx + 10, y);
      ctx.lineTo(bx + bw - 12, y);
      ctx.stroke();
    }

    // Draw individual fruits with stems & highlights (strong Shi-Tomasi corners)
    const padX = 24;
    const padY = 26;
    const availW = bw - padX * 2;
    const availH = bh - padY * 2 - 36;
    const cellW = availW / fruits.cols;
    const cellH = availH / fruits.rows;

    for (let r = 0; r < fruits.rows; r++) {
      for (let c = 0; c < fruits.cols; c++) {
        const cx = bx + padX + c * cellW + cellW * 0.5;
        const cy = by + padY + r * cellH + cellH * 0.5;
        const rx = Math.min(cellW, cellH) * 0.38;
        const ry = rx * 0.82;

        const grad = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
        grad.addColorStop(0, fruits.color1);
        grad.addColorStop(1, fruits.color2);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, -0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#4A3520';
        ctx.stroke();

        // Leaf & stem corner
        ctx.fillStyle = fruits.leaf;
        ctx.beginPath();
        ctx.ellipse(cx + rx * 0.35, cy - ry * 0.75, rx * 0.35, ry * 0.22, 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Specular highlight dot
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(cx - rx * 0.28, cy - ry * 0.2, Math.max(2.5, rx * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Price sign pill at bottom-left of basket
    const signX = bx + 16;
    const signY = by + bh - 42;
    const signW = Math.min(bw - 32, Math.max(118, label.length * 10.5));
    const signH = 30;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(signX, signY, signW, signH, 15);
    ctx.fill();
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#18181B';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(label, signX + 12, signY + 20);
  };

  // 1. Left mango pile ([140, 40, 880, 560] in 0..1000 coords)
  drawBasket(
    w * 0.04,
    h * 0.14,
    w * 0.52,
    h * 0.74,
    { color1: '#E04F33', color2: '#E8B228', leaf: '#3F8E2F', cols: 4, rows: 2 },
    'Xoài 80k/kg'
  );

  // 2. Top-right orange pile ([150, 600, 500, 950] in 0..1000 coords)
  drawBasket(
    w * 0.6,
    h * 0.15,
    w * 0.35,
    h * 0.35,
    { color1: '#F97316', color2: '#FACC15', leaf: '#2E7D32', cols: 3, rows: 2 },
    'Cam 40k/kg'
  );

  // 3. Bottom-right dragon fruit pile ([530, 600, 880, 950] in 0..1000 coords)
  drawBasket(
    w * 0.6,
    h * 0.53,
    w * 0.35,
    h * 0.35,
    { color1: '#E11D48', color2: '#FB7185', leaf: '#65A30D', cols: 3, rows: 2 },
    'Thanh long 35k/kg'
  );

  ctx.restore();
}

export const StallLiveView: React.FC<StallLiveViewProps> = ({
  lang,
  evaluatedItems,
  capturedImageDataUrl,
  demoMode,
  facingMode,
  onSelectItem,
  onRescan,
  onTelemetry,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<LiveStallTrackerSession | null>(null);
  const holdTimerRef = useRef<number | null>(null);

  const [tracks, setTracks] = useState<LiveTrackState[]>([]);
  const [lostOver2s, setLostOver2s] = useState(false);
  const [holdingToReattach, setHoldingToReattach] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let mediaStream: MediaStream | null = null;
    let synthAnimId: number | null = null;
    let rvfcHandle: number | null = null;
    let fallbackTimer: number | null = null;

    const session = new LiveStallTrackerSession();
    sessionRef.current = session;

    // Expose a test helper on window so automated E2E checks can verify lost-tracking >2s UI deterministically
    (window as any).__choForceLoseTracking = () => {
      session.forceLoseTracking(performance.now());
      setLostOver2s(true);
      setTracks(session.getTracksSnapshot());
    };

    const startLiveTracking = async () => {
      const video = videoRef.current;
      if (!video) return;

      let uploadedImg: HTMLImageElement | null = null;
      if (capturedImageDataUrl) {
        uploadedImg = new Image();
        uploadedImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          uploadedImg!.onload = () => resolve();
          uploadedImg!.onerror = () => resolve();
          uploadedImg!.src = capturedImageDataUrl;
        });
      }

      // 1. Acquire real camera stream or synthetic 30fps canvas stream
      let usingSyntheticStream = demoMode || Boolean(capturedImageDataUrl);
      if (!usingSyntheticStream && navigator.mediaDevices?.getUserMedia) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          });
        } catch {
          usingSyntheticStream = true;
        }
      } else {
        usingSyntheticStream = true;
      }

      if (cancelled) {
        mediaStream?.getTracks().forEach((t) => t.stop());
        return;
      }

      let synthCanvas: HTMLCanvasElement | null = null;
      if (usingSyntheticStream) {
        synthCanvas = document.createElement('canvas');
        synthCanvas.width = 640;
        synthCanvas.height = 480;
        const sctx = synthCanvas.getContext('2d');
        if (sctx) {
          drawSyntheticStallFrame(sctx, 640, 480, 0, 0, uploadedImg);
        }

        const startMs = performance.now();
        const renderLoop = (now: number) => {
          if (cancelled) return;
          if (sctx) {
            // Smooth figure-8 camera sway so AR labels visibly glide with the fruit piles
            const t = (now - startMs) / 1000;
            const dx = Math.sin(t * 1.35) * 18;
            const dy = Math.cos(t * 0.95) * 11;
            drawSyntheticStallFrame(sctx, 640, 480, dx, dy, uploadedImg);
          }
          synthAnimId = requestAnimationFrame(renderLoop);
        };
        synthAnimId = requestAnimationFrame(renderLoop);

        if (typeof synthCanvas.captureStream === 'function') {
          mediaStream = synthCanvas.captureStream(30);
        }
      }

      if (mediaStream) {
        video.srcObject = mediaStream;
        try {
          await video.play();
        } catch {
          // Autoplay muted is permitted, ignore transient interruption
        }
      }

      if (cancelled) return;

      const sourceEl = synthCanvas ?? video;
      const srcW = video.videoWidth || synthCanvas?.width || 640;
      const srcH = video.videoHeight || synthCanvas?.height || 480;

      const initRes = await session.initialize(sourceEl, srcW, srcH, evaluatedItems);
      if (cancelled) return;

      setTracks(initRes.tracks);
      onTelemetry?.({ delegate: initRes.delegate, fps: 12 });

      // 2. Run detectForVideo + optical flow at ~10 Hz (every ~100ms) from requestVideoFrameCallback
      let lastStepMs = 0;
      let busy = false;

      const onFrame = async (nowMs: number) => {
        if (cancelled) return;

        if (!busy && nowMs - lastStepMs >= 95) {
          busy = true;
          lastStepMs = nowMs;
          try {
            const activeSource = video.readyState >= 2 ? video : synthCanvas ?? video;
            const w = video.videoWidth || synthCanvas?.width || 640;
            const h = video.videoHeight || synthCanvas?.height || 480;
            const step = await session.processFrame(activeSource, w, h, nowMs);
            if (!cancelled) {
              setTracks(step.tracks);
              setLostOver2s((prev) => step.lostOver2s || prev);
              onTelemetry?.({ delegate: step.delegate, fps: step.fps });
            }
          } finally {
            busy = false;
          }
        }

        if (cancelled) return;
        if ('requestVideoFrameCallback' in video) {
          rvfcHandle = (video as any).requestVideoFrameCallback((nextNow: number) => {
            onFrame(nextNow);
          });
        } else {
          fallbackTimer = window.setTimeout(() => onFrame(performance.now()), 100);
        }
      };

      if ('requestVideoFrameCallback' in video) {
        rvfcHandle = (video as any).requestVideoFrameCallback((nextNow: number) => {
          onFrame(nextNow);
        });
      } else {
        fallbackTimer = window.setTimeout(() => onFrame(performance.now()), 100);
      }
    };

    startLiveTracking();

    return () => {
      cancelled = true;
      delete (window as any).__choForceLoseTracking;
      if (synthAnimId !== null) cancelAnimationFrame(synthAnimId);
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
      if (
        rvfcHandle !== null &&
        videoRef.current &&
        'cancelVideoFrameCallback' in videoRef.current
      ) {
        try {
          (videoRef.current as any).cancelVideoFrameCallback(rvfcHandle);
        } catch {
          // ignore
        }
      }
      mediaStream?.getTracks().forEach((t) => t.stop());
      session.dispose();
    };
  }, [capturedImageDataUrl, demoMode, evaluatedItems, facingMode]);

  const handlePointerDown = () => {
    if (!lostOver2s) return;
    setHoldingToReattach(true);
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      sessionRef.current?.reattachTracks();
      setLostOver2s(false);
      setHoldingToReattach(false);
      if (sessionRef.current) {
        setTracks(sessionRef.current.getTracksSnapshot());
      }
    }, 450);
  };

  const handlePointerUpOrLeave = () => {
    setHoldingToReattach(false);
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  return (
    <div
      data-testid="stall-live-view"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOrLeave}
      onPointerLeave={handlePointerUpOrLeave}
      className="relative w-full max-w-[335px] mx-auto select-none"
    >
      <div className="relative rounded-[20px] overflow-hidden shadow-2xl border border-white/20 bg-black aspect-[4/3]">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="w-full h-full object-cover block"
        />

        {/* SVG Polygon Mask Layer for tracks that have a polygon outline */}
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {tracks.map((track) => {
            if (track.parsedMask.kind !== 'polygon') return null;
            const verdict = track.item.judgment.verdict;
            const style = VERDICT_STYLES[verdict];
            const transformed = transformPolygonToBox(
              track.parsedMask.points,
              track.initialBox,
              track.box
            );
            const pointsAttr = transformed.map(([x, y]) => `${x},${y}`).join(' ');
            return (
              <polygon
                key={`poly-${track.trackId}`}
                points={pointsAttr}
                fill={style.fill}
                stroke={style.border}
                strokeWidth={8}
                strokeLinejoin="round"
                strokeDasharray={verdict === 'unknown' ? '18 10' : undefined}
                style={{
                  opacity: track.visible && !lostOver2s ? 1 : 0,
                  transition: 'opacity 180ms ease-out',
                }}
              />
            );
          })}
        </svg>

        {/* Tracked AR detection boxes & pins (120ms position easing) */}
        {tracks.map((track) => {
          const [ymin, xmin, ymax, xmax] = track.box;
          const verdict = track.item.judgment.verdict;
          const style = VERDICT_STYLES[verdict];
          const pctHigh = track.item.judgment.pct_above_high;
          const isUnsure = verdict === 'unknown';
          const hasPolygon = track.parsedMask.kind === 'polygon';
          const hasPng = track.parsedMask.kind === 'png';

          const nameLabel =
            track.item.reference?.name_vi || track.item.perceived.name_vi || 'Món';
          const priceShort = track.item.judgment.quoted_vnd
            ? `${Math.round(track.item.judgment.quoted_vnd / 1000)}k`
            : '';
          const badgeText =
            pctHigh !== null && pctHigh !== undefined && verdict !== 'fair'
              ? `+${pctHigh}%`
              : lang === 'en'
              ? style.labelEn
              : style.labelVi;

          return (
            <button
              key={track.trackId}
              type="button"
              data-testid={`live-ar-pin-${track.itemIndex}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem(track.item);
              }}
              aria-label={`${nameLabel} ${priceShort} - ${badgeText}`}
              style={{
                top: `${ymin / 10}%`,
                left: `${xmin / 10}%`,
                height: `${Math.max(6, (ymax - ymin) / 10)}%`,
                width: `${Math.max(10, (xmax - xmin) / 10)}%`,
                borderColor: hasPolygon ? 'transparent' : style.border,
                backgroundColor: hasPolygon || hasPng ? 'transparent' : style.fill,
                borderWidth: hasPolygon ? '0px' : '2px',
                borderStyle: isUnsure ? 'dashed' : 'solid',
                opacity: track.visible && !lostOver2s ? 1 : 0,
                pointerEvents: track.visible && !lostOver2s ? 'auto' : 'none',
                transition:
                  'top 120ms ease-out, left 120ms ease-out, width 120ms ease-out, height 120ms ease-out, opacity 180ms ease-out',
              }}
              className="absolute rounded-[16px] cursor-pointer active:scale-[0.98]"
            >
              {/* Base64 PNG mask scaled into box if returned by an older model */}
              {hasPng && track.parsedMask.kind === 'png' && (
                <img
                  src={track.parsedMask.dataUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-fill rounded-[14px] opacity-35 pointer-events-none"
                />
              )}

              {/* Floating AR Verdict Pin */}
              <span
                style={{ backgroundColor: style.dot }}
                className="absolute -top-3 right-2 px-2.5 py-1 rounded-full text-[11px] font-bold text-white shadow-md flex items-center gap-1.5 whitespace-nowrap tabular-nums"
              >
                <span>{nameLabel}</span>
                <span className="opacity-90">·</span>
                <span>{badgeText}</span>
              </span>
            </button>
          );
        })}

        {/* Lost tracking hint (>2s) with hold-to-reattach and re-scan action */}
        {lostOver2s && (
          <div
            data-testid="lost-tracking-banner"
            className="absolute inset-x-3 bottom-3 z-30 glass-surface rounded-[16px] p-3 flex items-center justify-between gap-2 text-white shadow-lg"
          >
            <span className="text-[13px] font-semibold leading-snug">
              {holdingToReattach
                ? lang === 'en'
                  ? 'Re-attaching labels…'
                  : 'Đang gắn lại nhãn…'
                : lang === 'en'
                ? 'Hold on the stall to re-attach'
                : 'Giữ vào quầy hàng để gắn lại nhãn'}
            </span>
            <Chip
              as="button"
              variant="glass"
              data-testid="rescan-stall-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRescan();
              }}
              className="shrink-0 bg-white/25 hover:bg-white/35 text-white font-bold px-3 py-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{lang === 'en' ? 'Re-scan' : 'Quét lại'}</span>
            </Chip>
          </div>
        )}
      </div>
    </div>
  );
};
