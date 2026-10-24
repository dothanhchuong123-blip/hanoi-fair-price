import { VISION_TIMEOUT_MS } from '../config';

export interface OcrWord {
  text: string;
  /** Normalized [ymin, xmin, ymax, xmax] in 0..1000 */
  box: [number, number, number, number];
  confidence: number;
}

interface VisionVertex {
  x?: number;
  y?: number;
}

interface VisionBoundingPoly {
  vertices?: VisionVertex[];
  normalizedVertices?: VisionVertex[];
}

interface VisionSymbol {
  text?: string;
  confidence?: number;
}

interface VisionWord {
  symbols?: VisionSymbol[];
  boundingBox?: VisionBoundingPoly;
  confidence?: number;
}

interface VisionParagraph {
  words?: VisionWord[];
}

interface VisionBlock {
  paragraphs?: VisionParagraph[];
}

interface VisionPage {
  width?: number;
  height?: number;
  blocks?: VisionBlock[];
}

interface VisionAnnotateResponse {
  responses?: Array<{
    fullTextAnnotation?: {
      pages?: VisionPage[];
    };
    error?: {
      code?: number;
      message?: string;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
  };
}

function clamp1000(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(1000, Math.round(val)));
}

function computeNormalizedBox(
  boundingBox: VisionBoundingPoly | undefined,
  pageWidth: number,
  pageHeight: number
): [number, number, number, number] | null {
  if (!boundingBox) return null;

  const verts = boundingBox.vertices;
  const normVerts = boundingBox.normalizedVertices;

  if (verts && verts.length > 0 && pageWidth > 0 && pageHeight > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const v of verts) {
      const x = v.x ?? 0;
      const y = v.y ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    return [
      clamp1000((minY / pageHeight) * 1000),
      clamp1000((minX / pageWidth) * 1000),
      clamp1000((maxY / pageHeight) * 1000),
      clamp1000((maxX / pageWidth) * 1000),
    ];
  }

  if (normVerts && normVerts.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const v of normVerts) {
      const x = v.x ?? 0;
      const y = v.y ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    return [
      clamp1000(minY * 1000),
      clamp1000(minX * 1000),
      clamp1000(maxY * 1000),
      clamp1000(maxX * 1000),
    ];
  }

  return null;
}

export function parseVisionResponse(data: VisionAnnotateResponse): OcrWord[] {
  const first = data?.responses?.[0];
  if (first?.error) {
    throw new Error(first.error.message || 'Cloud Vision response error');
  }
  const page = first?.fullTextAnnotation?.pages?.[0];
  if (!page) return [];

  const pageWidth = page.width ?? 0;
  const pageHeight = page.height ?? 0;
  const words: OcrWord[] = [];

  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const word of paragraph.words ?? []) {
        const symbols = word.symbols ?? [];
        const text = symbols.map((s) => s.text ?? '').join('').trim();
        if (!text) continue;

        const box = computeNormalizedBox(word.boundingBox, pageWidth, pageHeight);
        if (!box) continue;

        let confidence = word.confidence;
        if (confidence === undefined && symbols.length > 0) {
          const confs = symbols
            .map((s) => s.confidence)
            .filter((c): c is number => typeof c === 'number');
          if (confs.length > 0) {
            confidence = confs.reduce((a, b) => a + b, 0) / confs.length;
          }
        }

        words.push({
          text,
          box,
          confidence: confidence ?? 0.95,
        });
      }
    }
  }

  return words;
}

/**
 * Calls Google Cloud Vision DOCUMENT_TEXT_DETECTION and returns normalized 0-1000 word boxes.
 * If GOOGLE_CLOUD_VISION_API_KEY is missing, returns [] immediately.
 */
export async function visionWords(base64: string): Promise<OcrWord[]> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  if (!apiKey) {
    return [];
  }

  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: cleanBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Cloud Vision HTTP ${response.status}: ${errText.slice(0, 160)}`);
  }

  const data = (await response.json()) as VisionAnnotateResponse;
  return parseVisionResponse(data);
}
