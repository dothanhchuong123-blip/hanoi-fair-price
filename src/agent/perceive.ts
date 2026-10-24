import sampleMenuData from '../data/sample_perception.json';
import sampleStallData from '../data/sample_stall.json';
import { PerceptionResult } from './types';

export interface PerceiveOptions {
  demoMode?: boolean;
  demoSample?: 'menu' | 'stall';
  imageBase64?: string;
  mimeType?: string;
}

/**
 * Step 1: Perceive items, prices, units, and normalized [ymin, xmin, ymax, xmax] bounding boxes from a photo.
 * In demo mode, returns the bundled sample_perception.json or sample_stall.json without network calls.
 */
export async function perceive(options: PerceiveOptions): Promise<PerceptionResult> {
  if (options.demoMode) {
    if (options.demoSample === 'stall') {
      return sampleStallData as PerceptionResult;
    }
    return sampleMenuData as PerceptionResult;
  }
  if (!options.imageBase64) {
    throw new Error('No photo to analyze');
  }

  // The server already falls back between models; this only stops the UI waiting forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  const response = await fetch('/api/gemini/perceive', {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: options.imageBase64,
      mimeType: options.mimeType || 'image/jpeg',
    }),
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to analyze image with Gemini Vision');
  }

  const result = (await response.json()) as PerceptionResult;
  return result;
}
