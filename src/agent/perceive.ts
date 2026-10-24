import sampleMenuData from '../data/sample_perception.json';
import sampleStallData from '../data/sample_stall.json';
import { PerceptionResult } from './types';

export interface PerceiveOptions {
  demoMode?: boolean;
  demoSample?: 'menu' | 'stall';
  mode?: 'menu' | 'stall';
  imageBase64?: string;
  mimeType?: string;
  signal?: AbortSignal;
}

const MAX_LONG_EDGE = 2000;
const JPEG_QUALITY = 0.85;

/**
 * Downscales an image on the client so its long edge is <= 2000px and exports JPEG quality 0.85.
 * Keeps requests well under Cloud Vision's 10 MB JSON limit.
 */
async function downscaleForPerceive(
  imageBase64: string,
  mimeType = 'image/jpeg'
): Promise<{ dataUrl: string; mimeType: string; imageSize?: { w: number; h: number } }> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return { dataUrl: imageBase64, mimeType };
  }

  const srcUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:${mimeType};base64,${imageBase64}`;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;
      if (!origW || !origH) {
        resolve({ dataUrl: imageBase64, mimeType });
        return;
      }

      const longEdge = Math.max(origW, origH);
      const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
      const targetW = Math.max(1, Math.round(origW * scale));
      const targetH = Math.max(1, Math.round(origH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl: imageBase64, mimeType, imageSize: { w: origW, h: origH } });
        return;
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);
      const jpegDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      resolve({
        dataUrl: jpegDataUrl,
        mimeType: 'image/jpeg',
        imageSize: { w: targetW, h: targetH },
      });
    };
    img.onerror = () => {
      resolve({ dataUrl: imageBase64, mimeType });
    };
    img.src = srcUrl;
  });
}

/**
 * Step 1: Perceive items, prices, units, and normalized [ymin, xmin, ymax, xmax] bounding boxes from a photo.
 * In demo mode, returns the bundled sample_perception.json or sample_stall.json without network calls.
 */
export async function perceive(options: PerceiveOptions): Promise<PerceptionResult> {
  if (options.signal?.aborted) {
    throw new DOMException('Scan aborted', 'AbortError');
  }

  if (options.demoMode) {
    const rawSample = options.demoSample === 'stall' ? sampleStallData : sampleMenuData;
    return structuredClone(rawSample) as unknown as PerceptionResult;
  }
  if (!options.imageBase64) {
    throw new Error('No photo to analyze');
  }

  const prepared = await downscaleForPerceive(
    options.imageBase64,
    options.mimeType || 'image/jpeg'
  );

  if (options.signal?.aborted) {
    throw new DOMException('Scan aborted', 'AbortError');
  }

  // The server already falls back between models; this only stops the UI waiting forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const response = await fetch('/api/gemini/perceive', {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: prepared.dataUrl,
      mimeType: prepared.mimeType,
      imageSize: prepared.imageSize,
      ...(options.mode ? { mode: options.mode } : {}),
    }),
  }).finally(() => {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to analyze image with Gemini Vision');
  }

  const result = (await response.json()) as PerceptionResult;
  if (prepared.imageSize && !result.image_size) {
    result.image_size = prepared.imageSize;
  }
  return result;
}
