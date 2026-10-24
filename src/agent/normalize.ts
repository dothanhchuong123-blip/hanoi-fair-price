import { parsePrice, convertUnitPrice } from '../lib/parsePrice';
import { getAllReferences } from './lookup';
import {
  ConfirmationQuestion,
  DisambiguationOption,
  NormalizedItem,
  NormalizeResult,
  PerceivedItem,
  PriceReference,
} from './types';

function stripAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

interface CandidateMatch {
  ref: PriceReference;
  score: number;
}

const HAS_DIACRITICS = /[^\u0000-\u007f]/;

function tokens(str: string, keepAccents: boolean): string[] {
  const base = keepAccents ? str.toLowerCase().normalize('NFC') : stripAccents(str);
  return base.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Whole-word containment: every query word must appear as a full word in the name.
 * Accents are compared when the query has them, so "nấm" (mushroom) never matches "Nam" in "Bún bò Nam Bộ".
 */
function containsAllWords(query: string, name: string): boolean {
  const queryHasAccents = HAS_DIACRITICS.test(query);
  // An accented word can only be confirmed against an accented name; plain aliases are for plain queries
  if (queryHasAccents && !HAS_DIACRITICS.test(name)) return false;
  const keepAccents = queryHasAccents;
  const q = tokens(query, keepAccents);
  const n = new Set(tokens(name, keepAccents));
  return q.length > 0 && q.every((t) => n.has(t));
}

function scoreCandidate(queryVi: string, queryEn: string, ref: PriceReference): number {
  const qViNorm = queryVi.toLowerCase().trim().normalize('NFC');
  const qViPlain = stripAccents(qViNorm);
  const qEnPlain = stripAccents(queryEn || '');
  const queryHasAccents = HAS_DIACRITICS.test(qViNorm);

  const refViNorm = ref.name_vi.toLowerCase().trim().normalize('NFC');
  const refViPlain = stripAccents(refViNorm);
  const refEnPlain = stripAccents(ref.name_en);

  if (qViNorm === refViNorm) return 0.94;
  // Accent-free comparison only when the query itself has no accents (typed or OCR'd without them)
  if (!queryHasAccents && qViPlain && qViPlain === refViPlain) return 0.92;

  for (const alias of ref.aliases) {
    const aliasNorm = alias.toLowerCase().trim().normalize('NFC');
    const aliasPlain = stripAccents(aliasNorm);
    const accentsMatter = queryHasAccents && HAS_DIACRITICS.test(aliasNorm);
    if (qViNorm === aliasNorm || (!accentsMatter && qViPlain === aliasPlain)) {
      // Generic one-word names ("xoài", "phở", "cà phê") could mean several catalog items
      if (qViPlain === 'xoai' || qViPlain === 'mango') return 0.62;
      if (qViPlain === 'pho') return 0.68;
      if (qViPlain === 'ca phe' || qViPlain === 'cafe') return 0.65;
      return 0.9;
    }
  }

  if (qEnPlain && qEnPlain === refEnPlain) return 0.88;

  // "Xoài" is contained in "Xoài cát" and "Xoài Đài Loan": a partial match worth asking about
  if (containsAllWords(qViNorm, refViNorm)) return 0.64;
  for (const alias of ref.aliases) {
    if (containsAllWords(qViNorm, alias)) return 0.58;
  }

  return 0;
}

function buildDisambiguationQuestion(
  itemIndex: number,
  perceived: PerceivedItem,
  candidates: CandidateMatch[]
): ConfirmationQuestion {
  // Curated copy for Mango ("Which mango is this?") matching Screenshot 09
  if (candidates.length >= 2 && candidates.slice(0, 2).every((c) => c.ref.id.startsWith('xoai'))) {
    const allRefs = getAllReferences();
    const xoaiCat = allRefs.find((r) => r.id === 'xoai_cat')!;
    const xoaiDl = allRefs.find((r) => r.id === 'xoai_dai_loan')!;

    return {
      item_index: itemIndex,
      perceived_name_vi: perceived.name_vi,
      prompt_en: 'Which mango is this?',
      prompt_vi: 'Đây là loại xoài nào?',
      subtitle_en: 'It helps us compare the right price. Mango types differ a lot.',
      subtitle_vi: 'Giúp so sánh đúng mức giá vì các loại xoài chênh nhau khá nhiều.',
      options: [
        {
          ref_id: xoaiCat.id,
          name_vi: 'Xoài cát',
          name_en: 'Cat Chu mango',
          description_en: 'sweet, small',
          description_vi: 'Xoài cát Chu · ngọt thơm, quả nhỏ',
          typical_range_text: 'Typical 60–90k/kg',
          emoji: '🥭',
          bg_tint: '#F9E5A7',
        },
        {
          ref_id: xoaiDl.id,
          name_vi: 'Xoài Đài Loan',
          name_en: 'Taiwan mango',
          description_en: 'large, green',
          description_vi: 'Xoài Đài Loan · quả to, vỏ xanh',
          typical_range_text: 'Typical 30–45k/kg',
          emoji: '🥭',
          bg_tint: '#D9EAD3',
        },
      ],
    };
  }

  const topTwo = candidates.slice(0, 2);
  const options: DisambiguationOption[] = topTwo.map((c, idx) => ({
    ref_id: c.ref.id,
    name_vi: c.ref.name_vi,
    name_en: c.ref.name_en,
    description_en: c.ref.description_en || c.ref.name_en,
    description_vi: c.ref.description_vi || c.ref.name_vi,
    typical_range_text: `Typical ${Math.round(c.ref.low_vnd / 1000)}–${Math.round(c.ref.high_vnd / 1000)}k/${c.ref.unit}`,
    emoji: c.ref.emoji || '🍽️',
    bg_tint: idx === 0 ? '#F9E5A7' : '#D9EAD3',
  }));

  const rawItemName = (perceived.name_en || perceived.name_vi || 'item').trim();
  const lowerItemName = rawItemName.toLowerCase();
  const capItemName = rawItemName.charAt(0).toUpperCase() + rawItemName.slice(1).toLowerCase();

  return {
    item_index: itemIndex,
    perceived_name_vi: perceived.name_vi,
    prompt_en: `Which ${lowerItemName} is this?`,
    prompt_vi: `Đây là loại ${perceived.name_vi.toLowerCase()} nào?`,
    subtitle_en: `It helps us compare the right price. ${capItemName} types differ a lot.`,
    subtitle_vi: 'Giúp chúng tôi so sánh đúng mức giá vì các loại này chênh nhau khá nhiều.',
    options,
  };
}

/**
 * Pure async normalization step:
 * Matches perceived items against the Hanoi reference catalog, normalizes units (lạng -> kg, cân -> kg),
 * and emits human-in-the-loop ConfirmationQuestions when match_score < 0.7 or multiple close candidates exist.
 */
export async function normalize(
  items: PerceivedItem[],
  userConfirmations: Record<number, string | 'none'> = {}
): Promise<NormalizeResult> {
  const catalog = getAllReferences();
  const normalizedItems: NormalizedItem[] = [];
  const questions: ConfirmationQuestion[] = [];

  items.forEach((item, index) => {
    const parsed = parsePrice(item.raw_price_text ?? item.price_vnd, item.unit);
    const basePrice = parsed.normalized_per_base_vnd ?? item.price_vnd;
    const baseUnit = parsed.base_unit || item.unit || 'phần';

    // Check if the user already answered a confirmation question for this item index
    const userChoice = userConfirmations[index];
    if (userChoice === 'none') {
      normalizedItems.push({
        index,
        perceived: item,
        matched_id: null,
        match_score: 0,
        normalized_price_vnd: basePrice,
        normalized_unit: baseUnit,
        needs_confirmation: false,
      });
      return;
    }

    if (userChoice) {
      const chosenRef = catalog.find((r) => r.id === userChoice);
      const conv = basePrice ? convertUnitPrice(item.price_vnd ?? basePrice, item.unit, chosenRef?.unit) : null;
      normalizedItems.push({
        index,
        perceived: chosenRef
          ? { ...item, name_vi: chosenRef.name_vi, name_en: chosenRef.name_en }
          : item,
        matched_id: chosenRef ? chosenRef.id : null,
        match_score: 1.0,
        normalized_price_vnd: conv ? conv.normalized_vnd : basePrice,
        normalized_unit: chosenRef?.unit || baseUnit,
        needs_confirmation: false,
      });
      return;
    }

    if (item.is_addon) {
      normalizedItems.push({
        index,
        perceived: item,
        matched_id: null,
        match_score: 0,
        normalized_price_vnd: basePrice,
        normalized_unit: baseUnit,
        needs_confirmation: false,
      });
      return;
    }

    // Gemini already matched the item against the catalog while reading the photo
    if (item.catalog_id !== undefined) {
      const alternatives = (item.alternatives || [])
        .map((id) => catalog.find((r) => r.id === id))
        .filter((r): r is PriceReference => Boolean(r));
      // Only ask between options of the same kind as the item (never "mango or mango?" for a mango snack)
      const uniqueAlternatives = alternatives.filter(
        (r, i) => alternatives.findIndex((a) => a.id === r.id) === i && r.category === item.category
      );

      if (uniqueAlternatives.length >= 2) {
        const question = buildDisambiguationQuestion(
          index,
          item,
          uniqueAlternatives.map((ref) => ({ ref, score: 0.6 }))
        );
        questions.push(question);
        normalizedItems.push({
          index,
          perceived: item,
          matched_id: uniqueAlternatives[0].id,
          match_score: 0.6,
          normalized_price_vnd: basePrice,
          normalized_unit: baseUnit,
          needs_confirmation: true,
          confirmation_question: question,
        });
        return;
      }

      const matched = catalog.find((r) => r.id === item.catalog_id);
      if (!matched || item.match === 'none') {
        normalizedItems.push({
          index,
          perceived: item,
          matched_id: null,
          match_score: 0,
          normalized_price_vnd: basePrice,
          normalized_unit: baseUnit,
          needs_confirmation: false,
        });
        return;
      }

      const conv =
        item.price_vnd !== null
          ? convertUnitPrice(item.price_vnd, item.unit, matched.unit)
          : { normalized_vnd: basePrice, base_unit: matched.unit };
      normalizedItems.push({
        index,
        perceived: item,
        matched_id: matched.id,
        match_score: item.match === 'exact' ? 0.95 : 0.75,
        normalized_price_vnd: conv.normalized_vnd,
        normalized_unit: conv.base_unit,
        needs_confirmation: false,
      });
      return;
    }

    // Fallback: local fuzzy matching (demo samples and older responses without catalog_id)
    const scored: CandidateMatch[] = catalog
      .map((ref) => ({ ref, score: scoreCandidate(item.name_vi, item.name_en, ref) }))
      .filter((c) => c.score > 0.3)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const second = scored[1];

    const isAmbiguous =
      !best ||
      best.score < 0.7 ||
      (second && best.score < 0.9 && Math.abs(best.score - second.score) <= 0.12);

    const askable =
      scored.length >= 2 && scored[1].score >= 0.55 && scored[0].ref.category === scored[1].ref.category;

    if (isAmbiguous && askable) {
      const question = buildDisambiguationQuestion(index, item, scored);
      questions.push(question);
      normalizedItems.push({
        index,
        perceived: item,
        matched_id: best.ref.id,
        match_score: best.score,
        normalized_price_vnd: basePrice,
        normalized_unit: baseUnit,
        needs_confirmation: true,
        confirmation_question: question,
      });
      return;
    }

    if (!best || best.score < 0.7) {
      // A weak, unconfirmed match is worse than none: it would be judged against the wrong dish
      normalizedItems.push({
        index,
        perceived: item,
        matched_id: null,
        match_score: best ? best.score : 0,
        normalized_price_vnd: basePrice,
        normalized_unit: baseUnit,
        needs_confirmation: false,
      });
      return;
    }

    const conv =
      item.price_vnd !== null
        ? convertUnitPrice(item.price_vnd, item.unit, best.ref.unit)
        : { normalized_vnd: basePrice, base_unit: best.ref.unit };

    normalizedItems.push({
      index,
      perceived: item,
      matched_id: best.ref.id,
      match_score: best.score,
      normalized_price_vnd: conv.normalized_vnd,
      normalized_unit: conv.base_unit,
      needs_confirmation: false,
    });
  });

  return { items: normalizedItems, questions };
}
