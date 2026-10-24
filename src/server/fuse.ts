import { BoxSource, PerceivedItem } from '../agent/types';
import { OcrWord } from './ocr';

interface IndexedWord extends OcrWord {
  idx: number;
  normText: string;
  yc: number;
  xc: number;
  height: number;
}

export interface OcrLine {
  lineIdx: number;
  words: IndexedWord[];
  ymin: number;
  ymax: number;
  yc: number;
}

/**
 * Normalizes Vietnamese text for OCR matching:
 * NFD decomposition, strip combining marks, đ/Đ -> d, lowercase, alphanumerics only.
 */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Turns Vietnamese price strings ("120k", "120K", "120.000", "120,000", "120 k",
 * "120.000đ", or a split "120" + "k") into an integer VND amount (120000).
 */
export function priceKey(
  input: string | string[] | number | null | undefined,
  nextToken?: string
): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    return input < 1000 ? Math.round(input * 1000) : Math.round(input);
  }

  const combined = Array.isArray(input)
    ? input.join(' ')
    : nextToken !== undefined
    ? `${input} ${nextToken}`
    : input;

  let text = combined.trim().toLowerCase();
  if (!text) return null;

  // Strip trailing unit such as "/suất", "/bát", "/kg"
  text = text.replace(/\s*\/\s*[a-zA-ZÀ-ỹ0-9]+$/i, '').trim();

  // If multi-size price like "50k-70k-90k" or "50k - 70k", take the first part
  const rangeParts = text.split(/\s*[-–~]\s*/);
  if (rangeParts.length > 1 && /\d/.test(rangeParts[0])) {
    const first = priceKey(rangeParts[0]);
    if (first !== null) return first;
    // Also handle "50-70k" where the suffix 'k' is at the end
    const suffixMatch = text.match(/([kK]|(?:\.000|,000))\s*(?:đ|d|đồng|vnd|vnđ)?$/);
    if (suffixMatch && /^\d+$/.test(rangeParts[0])) {
      const withSuffix = priceKey(`${rangeParts[0]}${suffixMatch[1]}`);
      if (withSuffix !== null) return withSuffix;
    }
  }

  // Strip trailing currency markers (đ, d, đồng, vnd, vnđ)
  text = text.replace(/\s*(?:đồng|vnđ|vnd|đ|d)\s*$/i, '').trim();

  // 1. "1tr2", "1.2tr", "1,2 triệu"
  const trShorthand = text.match(/^(\d+)\s*tr(?:iệu|ieu)?\s*(\d+)?$/i);
  if (trShorthand) {
    const millions = parseInt(trShorthand[1], 10);
    const fracStr = trShorthand[2] || '';
    const frac = fracStr ? parseInt(fracStr, 10) * Math.pow(10, 6 - fracStr.length) : 0;
    return millions * 1_000_000 + frac;
  }

  // 2. "35k5" -> 35500
  const kShorthand = text.match(/^(\d+)\s*k\s*(\d+)$/i);
  if (kShorthand) {
    const thousands = parseInt(kShorthand[1], 10);
    const fracStr = kShorthand[2];
    const frac = parseInt(fracStr, 10) * Math.pow(10, 3 - fracStr.length);
    return thousands * 1000 + frac;
  }

  // 3. "120k", "120K", "120 k", "35.5k", "35,5k", "120 nghìn", "120 ngàn"
  const kMatch = text.match(/^(\d+(?:[.,]\d{1,2})?)\s*(?:k|nghìn|nghin|ngàn|ngan)\b$/i);
  if (kMatch) {
    const val = parseFloat(kMatch[1].replace(',', '.'));
    return Math.round(val * 1000);
  }

  // 4. Thousands with separators: "120.000", "120,000", "120 000", "1.200.000"
  if (/^\d{1,3}(?:[.,\s]\d{3})+$/.test(text)) {
    return parseInt(text.replace(/[.,\s]/g, ''), 10);
  }

  // 5. Full integer VND >= 1000: "120000", "60000"
  if (/^\d{4,9}$/.test(text)) {
    return parseInt(text, 10);
  }

  return null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

export function levSim(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export function groupWordsIntoLines(words: OcrWord[]): OcrLine[] {
  if (words.length === 0) return [];

  const indexed: IndexedWord[] = words.map((w, idx) => {
    const [ymin, xmin, ymax, xmax] = w.box;
    return {
      ...w,
      idx,
      normText: norm(w.text),
      yc: (ymin + ymax) / 2,
      xc: (xmin + xmax) / 2,
      height: Math.max(1, ymax - ymin),
    };
  });

  const sortedHeights = indexed.map((w) => w.height).sort((a, b) => a - b);
  const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)] || 20;
  const maxGap = 0.6 * medianHeight;

  const byY = [...indexed].sort((a, b) => a.yc - b.yc || a.box[1] - b.box[1]);

  const rawLines: IndexedWord[][] = [];
  for (const w of byY) {
    if (rawLines.length === 0) {
      rawLines.push([w]);
      continue;
    }
    const currentLine = rawLines[rawLines.length - 1];
    const prevYc = currentLine[currentLine.length - 1].yc;
    if (w.yc - prevYc > maxGap) {
      rawLines.push([w]);
    } else {
      currentLine.push(w);
    }
  }

  return rawLines.map((lineWords, lineIdx) => {
    const sortedByX = [...lineWords].sort((a, b) => a.box[1] - b.box[1]);
    const ymin = Math.min(...sortedByX.map((w) => w.box[0]));
    const ymax = Math.max(...sortedByX.map((w) => w.box[2]));
    const yc = (ymin + ymax) / 2;
    return {
      lineIdx,
      words: sortedByX,
      ymin,
      ymax,
      yc,
    };
  });
}

function scoreNameWindow(nameTokens: string[], windowWords: IndexedWord[]): number {
  if (nameTokens.length === 0 || windowWords.length === 0) return 0;
  const winTokens = windowWords.map((w) => w.normText);
  if (winTokens.some((t) => !t)) return 0;

  // Mean best Levenshtein similarity per name token
  let sumNameSim = 0;
  for (const nt of nameTokens) {
    let best = 0;
    for (const wt of winTokens) {
      const s = levSim(nt, wt);
      if (s > best) best = s;
    }
    sumNameSim += best;
  }
  const meanNameSim = sumNameSim / nameTokens.length;

  // Mean best similarity per window word (prevents K+1 window from swallowing trailing price token)
  let sumWinSim = 0;
  let minWinSim = 1;
  for (const wt of winTokens) {
    let best = 0;
    for (const nt of nameTokens) {
      const s = levSim(wt, nt);
      if (s > best) best = s;
    }
    if (best < minWinSim) minWinSim = best;
    sumWinSim += best;
  }
  const meanWinSim = sumWinSim / winTokens.length;

  // Joined string similarity handles split ("Cà"+"phê" vs "Càphê") or merged ("Phởbò" vs "Phở bò") OCR words
  const joinedSim = levSim(nameTokens.join(''), winTokens.join(''));

  // If the window is longer than nameTokens and contains a word that neither matches any token (>=0.5)
  // nor forms a strong joined string match, penalize so the tighter window wins.
  if (winTokens.length > nameTokens.length && minWinSim < 0.5 && joinedSim < 0.85) {
    return (meanNameSim + meanWinSim) / 2;
  }

  const tokenScore = winTokens.length <= nameTokens.length ? meanNameSim : (meanNameSim + meanWinSim) / 2;
  return Math.max(tokenScore, joinedSim);
}

interface NameMatchCandidate {
  words: IndexedWord[];
  score: number;
  startLineIdx: number;
  endLineIdx: number;
}

function findPriceWordsOnLine(
  line: OcrLine,
  targetPrice: number,
  rawPriceText: string | undefined,
  usedWordIds: Set<number>,
  excludeWordIds: Set<number>
): IndexedWord[] | null {
  const available = line.words.filter((w) => !usedWordIds.has(w.idx) && !excludeWordIds.has(w.idx));
  if (available.length === 0) return null;

  // 1. Check 2-word split price (e.g. "120" + "k", "120" + "000")
  for (let i = 0; i < available.length - 1; i++) {
    const w1 = available[i];
    const w2 = available[i + 1];
    // Only combine if neither token is already the full price on its own
    if (priceKey(w1.text) === targetPrice || priceKey(w2.text) === targetPrice) continue;
    if (priceKey(w1.text, w2.text) === targetPrice) {
      return [w1, w2];
    }
  }

  // 2. Check single word price (e.g. "120k", "120.000", "120.000đ")
  for (const w of available) {
    if (priceKey(w.text) === targetPrice) {
      return [w];
    }
    if (rawPriceText && norm(w.text) && norm(w.text) === norm(rawPriceText)) {
      return [w];
    }
  }

  // 3. Fallback: bare number in thousands on a menu row (e.g. "60" for 60000)
  if (targetPrice >= 1000 && targetPrice % 1000 === 0) {
    const bareThousands = String(targetPrice / 1000);
    for (const w of available) {
      if (w.text.trim() === bareThousands) {
        return [w];
      }
    }
  }

  return null;
}

function unionBox(words: IndexedWord[]): [number, number, number, number] {
  let ymin = Infinity;
  let xmin = Infinity;
  let ymax = -Infinity;
  let xmax = -Infinity;
  for (const w of words) {
    if (w.box[0] < ymin) ymin = w.box[0];
    if (w.box[1] < xmin) xmin = w.box[1];
    if (w.box[2] > ymax) ymax = w.box[2];
    if (w.box[3] > xmax) xmax = w.box[3];
  }
  return [ymin, xmin, ymax, xmax];
}

function passesSanityCheck(
  ocrBox: [number, number, number, number],
  geminiBox: [number, number, number, number]
): boolean {
  const [oymin, oxmin, oymax, oxmax] = ocrBox;
  const [gymin, gxmin, gymax, gxmax] = geminiBox;

  const ocrArea = Math.max(0, oymax - oymin) * Math.max(0, oxmax - oxmin);
  const geminiArea = Math.max(1, (gymax - gymin) * (gxmax - gxmin));

  if (ocrArea > 4 * geminiArea) {
    return false;
  }

  const ocrCx = (oxmin + oxmax) / 2;
  const ocrCy = (oymin + oymax) / 2;
  const gemCx = (gxmin + gxmax) / 2;
  const gemCy = (gymin + gymax) / 2;

  const centerDist = Math.hypot(ocrCx - gemCx, ocrCy - gemCy);
  if (centerDist > 100) {
    return false;
  }

  return true;
}

/**
 * Snaps each Gemini PerceivedItem to the Cloud Vision OCR words that spell its name and price.
 * Pure function; returns a new array of PerceivedItem with updated box_2d and box_source.
 */
export function snapItems(items: PerceivedItem[], words: OcrWord[]): PerceivedItem[] {
  if (!words || words.length === 0) {
    return items.map((item) => ({
      ...item,
      box_source: 'gemini' as BoxSource,
    }));
  }

  const lines = groupWordsIntoLines(words);
  const usedWordIds = new Set<number>();

  return items.map((item) => {
    const geminiBox = item.box_2d;
    if (!geminiBox || geminiBox.length !== 4) {
      return { ...item, box_source: 'gemini' as BoxSource };
    }

    const [gymin, , gymax] = geminiBox;
    const gemCy = (gymin + gymax) / 2;

    // Candidate lines overlapping Gemini's box_2d vertically, expanded by 30 units
    const candidateLines = lines.filter(
      (line) => line.ymax >= gymin - 30 && line.ymin <= gymax + 30
    );

    if (candidateLines.length === 0) {
      return { ...item, box_source: 'gemini' as BoxSource };
    }

    const nameTokens = item.name_vi
      .split(/\s+/)
      .map(norm)
      .filter(Boolean);

    const targetPrice =
      item.price_vnd ?? (item.raw_price_text ? priceKey(item.raw_price_text) : null);

    const k = nameTokens.length;
    const minWin = Math.max(1, k - 1);
    const maxWin = k + 1;

    const candidates: NameMatchCandidate[] = [];

    if (k > 0) {
      // Single-line sliding windows
      for (const line of candidateLines) {
        const unusedLineWords = line.words.filter((w) => !usedWordIds.has(w.idx) && w.normText);
        for (let winLen = minWin; winLen <= maxWin; winLen++) {
          for (let start = 0; start + winLen <= unusedLineWords.length; start++) {
            const slice = unusedLineWords.slice(start, start + winLen);
            const rawScore = scoreNameWindow(nameTokens, slice);
            if (rawScore >= 0.75) {
              // Slight preference for exact token count when scores tie
              const lenPenalty = Math.abs(winLen - k) * 0.005;
              candidates.push({
                words: slice,
                score: rawScore - lenPenalty,
                startLineIdx: line.lineIdx,
                endLineIdx: line.lineIdx,
              });
            }
          }
        }
      }

      // Wrapped-line sliding windows (line i + line i+1)
      for (let c = 0; c < candidateLines.length - 1; c++) {
        const lineA = candidateLines[c];
        const lineB = candidateLines[c + 1];
        if (lineB.lineIdx !== lineA.lineIdx + 1) continue;

        const wordsA = lineA.words.filter((w) => !usedWordIds.has(w.idx) && w.normText);
        const wordsB = lineB.words.filter((w) => !usedWordIds.has(w.idx) && w.normText);
        if (wordsA.length === 0 || wordsB.length === 0) continue;

        const combined = [...wordsA, ...wordsB];
        const splitBoundary = wordsA.length;

        for (let winLen = Math.max(2, minWin); winLen <= maxWin; winLen++) {
          for (let start = 0; start + winLen <= combined.length; start++) {
            // Ensure the window actually spans across both lines
            if (start >= splitBoundary || start + winLen <= splitBoundary) continue;
            const slice = combined.slice(start, start + winLen);
            const rawScore = scoreNameWindow(nameTokens, slice);
            if (rawScore >= 0.75) {
              const lenPenalty = Math.abs(winLen - k) * 0.005;
              candidates.push({
                words: slice,
                score: rawScore - lenPenalty,
                startLineIdx: lineA.lineIdx,
                endLineIdx: lineB.lineIdx,
              });
            }
          }
        }
      }
    }

    // Sort name candidates: prefer highest score; when scores are close, prefer lines with a matching price and closest to Gemini box y-center
    let bestNameMatch: NameMatchCandidate | null = null;
    let bestPriceWords: IndexedWord[] | null = null;

    if (candidates.length > 0) {
      const evaluated = candidates.map((cand) => {
        const nameWordSet = new Set(cand.words.map((w) => w.idx));
        let priceWords: IndexedWord[] | null = null;

        if (targetPrice !== null) {
          const searchLineOrder = [
            cand.startLineIdx,
            cand.endLineIdx,
            cand.startLineIdx - 1,
            cand.endLineIdx + 1,
          ];
          const seenLines = new Set<number>();
          for (const lIdx of searchLineOrder) {
            if (seenLines.has(lIdx)) continue;
            seenLines.add(lIdx);
            const lineObj = lines[lIdx];
            if (!lineObj) continue;
            const found = findPriceWordsOnLine(
              lineObj,
              targetPrice,
              item.raw_price_text,
              usedWordIds,
              nameWordSet
            );
            if (found) {
              priceWords = found;
              break;
            }
          }
        }

        const candBox = unionBox(priceWords ? [...cand.words, ...priceWords] : cand.words);
        const candCy = (candBox[0] + candBox[2]) / 2;
        const yDist = Math.abs(candCy - gemCy);
        const validBox = passesSanityCheck(candBox, geminiBox);

        return {
          cand,
          priceWords,
          hasPrice: Boolean(priceWords),
          yDist,
          validBox,
        };
      });

      const validOnes = evaluated.filter((e) => e.validBox);
      if (validOnes.length > 0) {
        validOnes.sort((a, b) => {
          // If one has a price match and comparable name score, prefer the one with price
          if (Math.abs(a.cand.score - b.cand.score) < 0.08 && a.hasPrice !== b.hasPrice) {
            return a.hasPrice ? -1 : 1;
          }
          if (Math.abs(a.cand.score - b.cand.score) > 0.02) {
            return b.cand.score - a.cand.score;
          }
          return a.yDist - b.yDist;
        });

        bestNameMatch = validOnes[0].cand;
        bestPriceWords = validOnes[0].priceWords;
      }
    }

    // If name did not match, try matching price alone on candidate lines
    if (!bestNameMatch && targetPrice !== null) {
      const sortedLines = [...candidateLines].sort(
        (a, b) => Math.abs(a.yc - gemCy) - Math.abs(b.yc - gemCy)
      );
      for (const line of sortedLines) {
        const foundPrice = findPriceWordsOnLine(
          line,
          targetPrice,
          item.raw_price_text,
          usedWordIds,
          new Set()
        );
        if (foundPrice) {
          const pBox = unionBox(foundPrice);
          if (passesSanityCheck(pBox, geminiBox)) {
            bestPriceWords = foundPrice;
            break;
          }
        }
      }
    }

    const matchedWords: IndexedWord[] = [
      ...(bestNameMatch ? bestNameMatch.words : []),
      ...(bestPriceWords ?? []),
    ];

    if (matchedWords.length === 0) {
      return { ...item, box_source: 'gemini' as BoxSource };
    }

    const finalBox = unionBox(matchedWords);
    if (!passesSanityCheck(finalBox, geminiBox)) {
      return { ...item, box_source: 'gemini' as BoxSource };
    }

    for (const w of matchedWords) {
      usedWordIds.add(w.idx);
    }

    const boxSource: BoxSource =
      bestNameMatch && bestPriceWords ? 'ocr' : 'ocr_partial';

    return {
      ...item,
      box_2d: finalBox,
      box_source: boxSource,
    };
  });
}
