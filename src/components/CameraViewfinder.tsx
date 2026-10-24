import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { detectDocument, DocBox, padBox, renderCrop } from '../lib/detectDocument';

export interface CapturedFrame {
  dataUrl: string;
  mimeType: string;
  /** True when the frame was cropped to a detected menu / sheet */
  cropped: boolean;
}

export interface CameraViewfinderHandle {
  /** Grabs what's on screen as a JPEG, cropped to the detected sheet. Null if the camera isn't live. */
  capture: () => CapturedFrame | null;
}

interface CameraViewfinderProps {
  lang: 'en' | 'vi';
  facingMode: 'environment' | 'user';
  onUploadInstead: () => void;
  /** Called when a sheet is found or lost, so the shutter can invite a tap */
  onLockChange?: (locked: boolean) => void;
}

type CameraStatus = 'starting' | 'live' | 'denied' | 'unavailable';

const DETECT_INTERVAL_MS = 160;
const SMOOTHING = 0.4; // share of the new detection blended into the shown box
const LOCK_FRAMES = 3; // consecutive steady detections before we call it found
const MISS_FRAMES = 4; // consecutive misses before we let it go
const DEFAULT_BOX: DocBox = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };

function boxDistance(a: DocBox, b: DocBox): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));
}

export const CameraViewfinder = forwardRef<CameraViewfinderHandle, CameraViewfinderProps>(
  ({ lang, facingMode, onUploadInstead, onLockChange }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [status, setStatus] = useState<CameraStatus>('starting');
    const [box, setBox] = useState<DocBox | null>(null);
    const [locked, setLocked] = useState(false);
    const boxRef = useRef<DocBox | null>(null);
    const lockedRef = useRef(false);

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
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
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

    /** The part of the video frame actually visible in the object-cover container. */
    const visibleRect = () => {
      const video = videoRef.current;
      const container = containerRef.current;
      if (!video || !container || !video.videoWidth) return null;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const scale = Math.max(cw / vw, ch / vh);
      const sw = cw / scale;
      const sh = ch / scale;
      return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
    };

    // Detection loop: look for the sheet a few times a second and ease the brackets onto it.
    useEffect(() => {
      if (status !== 'live') return;
      let hits = 0;
      let misses = 0;

      const setLock = (next: boolean) => {
        if (lockedRef.current === next) return;
        lockedRef.current = next;
        setLocked(next);
        onLockChange?.(next);
        if (next) navigator.vibrate?.(12);
      };

      const timer = window.setInterval(() => {
        const video = videoRef.current;
        const rect = visibleRect();
        if (!video || !rect || document.hidden) return;
        const found = detectDocument(video, rect);

        if (!found) {
          misses++;
          hits = 0;
          if (misses >= MISS_FRAMES) {
            boxRef.current = null;
            setBox(null);
            setLock(false);
          }
          return;
        }

        misses = 0;
        const prev = boxRef.current;
        const next = prev
          ? {
              x: prev.x + (found.x - prev.x) * SMOOTHING,
              y: prev.y + (found.y - prev.y) * SMOOTHING,
              w: prev.w + (found.w - prev.w) * SMOOTHING,
              h: prev.h + (found.h - prev.h) * SMOOTHING,
            }
          : found;
        hits = prev && boxDistance(prev, found) < 0.06 ? hits + 1 : 1;
        boxRef.current = next;
        setBox(next);
        setLock(hits >= LOCK_FRAMES);
      }, DETECT_INTERVAL_MS);

      return () => {
        window.clearInterval(timer);
        setLock(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    useImperativeHandle(ref, () => ({
      capture: () => {
        const video = videoRef.current;
        const rect = visibleRect();
        if (status !== 'live' || !video || !rect) return null;
        const cropBox = lockedRef.current && boxRef.current ? padBox(boxRef.current) : null;
        const dataUrl = renderCrop(video, rect, cropBox);
        return dataUrl ? { dataUrl, mimeType: 'image/jpeg', cropped: Boolean(cropBox) } : null;
      },
    }));

    const blocked = status === 'denied' || status === 'unavailable';
    const shown = status === 'live' && box ? box : DEFAULT_BOX;
    const mirror = facingMode === 'user';
    const left = mirror ? 1 - shown.x - shown.w : shown.x;

    return (
      <div
        ref={containerRef}
        className="relative w-full aspect-[3/4] max-h-[min(460px,58vh)] rounded-[22px] overflow-hidden bg-black/50"
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

        {status === 'live' && (
          <>
            {/* Dim everything outside the detected sheet */}
            <div
              aria-hidden
              className="absolute pointer-events-none rounded-[14px] transition-all duration-200 ease-out"
              style={{
                left: `${left * 100}%`,
                top: `${shown.y * 100}%`,
                width: `${shown.w * 100}%`,
                height: `${shown.h * 100}%`,
                boxShadow: locked ? '0 0 0 2000px rgba(12,9,6,0.42)' : '0 0 0 2000px rgba(12,9,6,0.12)',
              }}
            >
              {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                <span
                  key={corner}
                  className={`absolute w-9 h-9 transition-colors duration-200 ${
                    locked ? 'border-[#E3A82B]' : 'border-white/90'
                  } ${corner === 'tl' ? '-top-1 -left-1 border-t-[4px] border-l-[4px] rounded-tl-[14px]' : ''} ${
                    corner === 'tr' ? '-top-1 -right-1 border-t-[4px] border-r-[4px] rounded-tr-[14px]' : ''
                  } ${corner === 'bl' ? '-bottom-1 -left-1 border-b-[4px] border-l-[4px] rounded-bl-[14px]' : ''} ${
                    corner === 'br' ? '-bottom-1 -right-1 border-b-[4px] border-r-[4px] rounded-br-[14px]' : ''
                  }`}
                />
              ))}
            </div>

            <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
              <span
                className={`px-3.5 py-1.5 rounded-full text-[13px] font-bold transition-all duration-200 ${
                  locked ? 'bg-[#E3A82B] text-[#2A2118] scale-100' : 'bg-black/55 text-white/90 backdrop-blur-md scale-95'
                }`}
              >
                {locked
                  ? lang === 'en'
                    ? '✓ Menu found · tap the shutter'
                    : '✓ Đã thấy thực đơn · bấm chụp'
                  : lang === 'en'
                  ? 'Looking for a menu…'
                  : 'Đang tìm thực đơn…'}
              </span>
            </div>
          </>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-[14px] font-medium">
            {lang === 'en' ? 'Starting camera…' : 'Đang mở camera…'}
          </div>
        )}

        {blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="text-white font-display text-[22px] leading-tight">
              {status === 'denied'
                ? lang === 'en'
                  ? 'Camera access is off'
                  : 'Camera đang bị chặn'
                : lang === 'en'
                ? 'No camera found'
                : 'Không tìm thấy camera'}
            </div>
            <p className="text-white/75 text-[14px] leading-snug">
              {status === 'denied'
                ? lang === 'en'
                  ? 'Allow camera access in your browser settings, or pick a photo from your gallery.'
                  : 'Hãy cho phép camera trong cài đặt trình duyệt, hoặc chọn ảnh từ thư viện.'
                : lang === 'en'
                ? 'You can still pick a photo from your gallery.'
                : 'Bạn vẫn có thể chọn ảnh từ thư viện.'}
            </p>
            <button
              type="button"
              onClick={onUploadInstead}
              className="btn-mustard mt-1 px-5 h-[46px] rounded-[16px] font-bold text-[15px] cursor-pointer"
            >
              {lang === 'en' ? 'Choose a photo' : 'Chọn ảnh'}
            </button>
          </div>
        )}
      </div>
    );
  }
);

CameraViewfinder.displayName = 'CameraViewfinder';
