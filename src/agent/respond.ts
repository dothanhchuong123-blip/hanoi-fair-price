import { formatShortVnd } from '../lib/parsePrice';
import { JudgeVerdict, NormalizedItem, PriceFactor, PriceReference, RespondOutput } from './types';

const PRONUNCIATION_MAP: Record<string, { pron: string; unitVi: string; unitPron: string; unitEn: string }> = {
  bun_cha: {
    pron: 'boon chah · bow nyew · moht swuht · ah?',
    unitVi: 'một suất',
    unitPron: 'moht swuht',
    unitEn: 'one serving of bún chả',
  },
  pho_bo: {
    pron: 'fuh baw · bow nyew · moht baht · ah?',
    unitVi: 'một bát',
    unitPron: 'moht baht',
    unitEn: 'one bowl of beef phở',
  },
  pho_ga: {
    pron: 'fuh gah · bow nyew · moht baht · ah?',
    unitVi: 'một bát',
    unitPron: 'moht baht',
    unitEn: 'one bowl of chicken phở',
  },
  banh_mi: {
    pron: 'banh mee · bow nyew · moht chyek · ah?',
    unitVi: 'một chiếc',
    unitPron: 'moht chyek',
    unitEn: 'one bánh mì sandwich',
  },
  nem_ran: {
    pron: 'nem rahn · bow nyew · moht dee-ah · ah?',
    unitVi: 'một đĩa',
    unitPron: 'moht dee-ah',
    unitEn: 'one plate of spring rolls',
  },
  ca_phe_trung: {
    pron: 'kah feh choong · bow nyew · moht kohk · ah?',
    unitVi: 'một cốc',
    unitPron: 'moht kohk',
    unitEn: 'one cup of egg coffee',
  },
  tra_da: {
    pron: 'chah dah · bow nyew · moht kohk · ah?',
    unitVi: 'một cốc',
    unitPron: 'moht kohk',
    unitEn: 'one glass of iced tea',
  },
  bia_hoi: {
    pron: 'bee-ah hoy · bow nyew · moht kohk · ah?',
    unitVi: 'một cốc',
    unitPron: 'moht kohk',
    unitEn: 'one glass of fresh beer',
  },
  xoai_cat: {
    pron: 'swai kaht · bow nyew · moht kuhn · ah?',
    unitVi: 'một cân',
    unitPron: 'moht kuhn',
    unitEn: 'one kilo of golden mango',
  },
  xoai_dai_loan: {
    pron: 'buht chaw em · hai mwer-ee ngeen · dwerk khong ah?',
    unitVi: 'một cân',
    unitPron: 'moht kuhn',
    unitEn: 'one kilo of green mango',
  },
};

export function buildTemplateResponse(
  normalized: NormalizedItem,
  reference: PriceReference | null,
  judgment: JudgeVerdict,
  factors: PriceFactor[] = []
): RespondOutput {
  const nameVi = reference?.name_vi || normalized.perceived.name_vi;
  const nameLower = nameVi.toLowerCase();
  const unit = reference?.unit || normalized.normalized_unit || 'phần';
  const category = reference?.category || normalized.perceived.category;
  const isMarketBargaining = category === 'fruit' || category === 'vegetable';

  const lowStr = reference ? formatShortVnd(reference.low_vnd) : '';
  const highStr = reference ? formatShortVnd(reference.high_vnd) : '';
  const medStr = reference ? formatShortVnd(reference.median_vnd) : '';

  const pronInfo = (reference && PRONUNCIATION_MAP[reference.id]) || {
    pron: `${nameLower} · bow nyew · moht ${unit} · ah?`,
    unitVi: `một ${unit}`,
    unitPron: `moht ${unit}`,
    unitEn: `one ${unit} of ${nameLower}`,
  };

  // Explanation copy (neutral, never accuses seller)
  const where_en = factors.length
    ? `for ${nameLower} (${factors.map((f) => f.label_en.toLowerCase()).join(', ')})`
    : `for ${nameLower} at Old Quarter street stalls`;
  const where_vi = factors.length
    ? `cho ${nameLower} (${factors.map((f) => f.label_vi.toLowerCase()).join(', ')})`
    : `cho ${nameLower} ở hàng quán vỉa hè Phố cổ`;

  let explanation_en = '';
  let explanation_vi = '';

  if (judgment.verdict === 'overpriced' && reference && judgment.pct_above_high !== null) {
    const roundedPct = Math.round(judgment.pct_above_high / 5) * 5 || judgment.pct_above_high;
    explanation_en = `About ${roundedPct}% above the top of the usual ${lowStr}–${highStr} range ${where_en}. A famous name, a view or bigger portions can explain some of it, so ask before you order.`;
    explanation_vi = `Cao hơn khoảng ${roundedPct}% so với mức cao của khoảng giá thường gặp ${lowStr}–${highStr} ${where_vi}. Quán nổi tiếng, có view hoặc suất to có thể đắt hơn, bạn nên hỏi trước khi gọi.`;
  } else if (judgment.verdict === 'slightly_high' && reference && judgment.pct_above_high !== null) {
    explanation_en = `A little above the usual ${lowStr}–${highStr} range ${where_en}. Air-con, a prime corner or extra toppings often add a small premium.`;
    explanation_vi = `Nhỉnh hơn một chút so với khoảng giá thường gặp ${lowStr}–${highStr} ${where_vi}. Quán có điều hoà, vị trí đẹp hoặc thêm topping thường tính thêm chút ít.`;
  } else if (judgment.verdict === 'fair' && reference) {
    explanation_en = `Inside the usual ${lowStr}–${highStr} range (around ${medStr} typical) ${where_en}. A normal local price — enjoy!`;
    explanation_vi = `Nằm trong khoảng giá thường gặp ${lowStr}–${highStr} (phổ biến khoảng ${medStr}) ${where_vi}. Mức giá bình thường — chúc bạn ngon miệng!`;
  } else if (normalized.perceived.is_addon) {
    explanation_en = `This looks like a topping or side add-on, so we don't judge it as a full dish.`;
    explanation_vi = `Đây có vẻ là món ăn kèm / topping, nên chúng tôi không so sánh như một món chính.`;
  } else if (!reference) {
    explanation_en = `“${normalized.perceived.name_vi}” isn't in our Hanoi price list yet, so we can't compare it. Prices vary by place, portion and quality.`;
    explanation_vi = `“${normalized.perceived.name_vi}” chưa có trong bảng giá Hà Nội của chúng tôi nên chưa so sánh được. Giá có thể khác tùy quán, suất và chất lượng.`;
  } else {
    explanation_en = `We couldn't read this price clearly enough to judge it. Prices vary by place, portion size, quality and season.`;
    explanation_vi = `Chưa đọc rõ giá món này để đánh giá. Giá thực tế có thể thay đổi tùy vị trí, chất lượng và mùa vụ.`;
  }

  // Phrase selection by category & verdict
  if (judgment.verdict === 'fair') {
    return {
      explanation_en,
      explanation_vi,
      phrase_header_en: 'SAY THANK YOU',
      phrase_header_vi: 'CẢM ƠN NGƯỜI BÁN',
      phrase_vi: `Cho em một ${unit} ${nameLower}, cảm ơn chị ạ!`,
      pronunciation: `chaw em moht ${unit} · kahm uhn chee ah!`,
      phrase_en: `“One ${unit} of ${nameLower} please, thank you!”`,
      tip_en:
        'This price is right in the normal Hanoi range. A warm “cảm ơn ạ” always brings a smile.',
      tip_vi: 'Giá này rất hợp lý ở Hà Nội. Bạn có thể gọi món ngay một cách yên tâm.',
      more_phrases: [
        {
          icon: '📋',
          vi: `${nameVi} bao nhiêu ${pronInfo.unitVi} ạ?`,
          en: `How much is ${pronInfo.unitEn}?`,
        },
        {
          icon: '🙏',
          vi: 'Ngon lắm, cảm ơn chị ạ!',
          en: 'Very delicious, thank you!',
        },
      ],
    };
  }

  if (isMarketBargaining) {
    const targetDiscount =
      reference && judgment.quoted_vnd
        ? Math.max(10000, Math.round((judgment.quoted_vnd - reference.median_vnd) / 10000) * 10000)
        : 20000;
    const discountK = Math.round(targetDiscount / 1000);
    return {
      explanation_en,
      explanation_vi,
      phrase_header_en: 'POLITE BARGAINING',
      phrase_header_vi: 'MẶC CẢ LỊCH SỰ',
      phrase_vi: `Bớt cho em ${discountK} nghìn được không ạ?`,
      pronunciation: `buht chaw em · ${discountK} ngeen · dwerk khong ah?`,
      phrase_en: `“Could you take ${discountK},000đ off for me, please?”`,
      tip_en:
        'At fruit stalls and street baskets, friendly bargaining is normal. Smile and ask lightly before buying.',
      tip_vi:
        'Với hàng hoa quả và nông sản ở chợ, việc hỏi bớt nhẹ nhàng với nụ cười là hoàn toàn bình thường.',
      more_phrases: [
        {
          icon: '🥭',
          vi: `${nameVi} bao nhiêu một cân ạ?`,
          en: `How much is one kilo of ${nameLower}?`,
        },
        {
          icon: '🙏',
          vi: 'Dạ thôi, cảm ơn chị ạ.',
          en: 'No thanks, thank you (polite).',
        },
      ],
    };
  }

  // Street food / drinks (fixed prices: ask politely before ordering, matching Screen 5)
  return {
    explanation_en,
    explanation_vi,
    phrase_header_en: 'ASK THE PRICE',
    phrase_header_vi: 'HỎI GIÁ TRƯỚC KHI GỌI',
    phrase_vi: `${nameVi} bao nhiêu ${pronInfo.unitVi} ạ?`,
    pronunciation: pronInfo.pron,
    phrase_en: `“How much is ${pronInfo.unitEn}?”`,
    tip_en:
      'Street food usually has fixed prices. Asking before you order is normal and polite — haggling isn’t.',
    tip_vi:
      'Đồ ăn đường phố thường bán đúng giá. Hỏi giá lịch sự trước khi gọi món là bình thường — không nên mặc cả.',
    more_phrases: [
      {
        icon: '📋',
        vi: 'Có thực đơn ghi giá không ạ?',
        en: 'Do you have a menu with prices?',
      },
      {
        icon: '🙏',
        vi: 'Dạ thôi, cảm ơn chị ạ.',
        en: 'No thanks, thank you (polite).',
      },
    ],
  };
}

/**
 * Step 5: Generate plain-language explanation and polite Vietnamese phrase.
 * Uses template fallback in demo mode or when offline so demo mode works 100% offline.
 */
export async function respond(
  normalized: NormalizedItem,
  reference: PriceReference | null,
  judgment: JudgeVerdict,
  options?: { demoMode?: boolean }
): Promise<RespondOutput> {
  const fallback = buildTemplateResponse(normalized, reference, judgment);

  if (options?.demoMode) {
    return fallback;
  }

  try {
    const res = await fetch('/api/gemini/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: normalized.perceived,
        reference,
        judgment,
      }),
    });

    if (!res.ok) {
      return fallback;
    }

    const data = (await res.json()) as Partial<RespondOutput>;
    return {
      explanation_en: data.explanation_en || fallback.explanation_en,
      explanation_vi: data.explanation_vi || fallback.explanation_vi,
      phrase_header_en: data.phrase_header_en || fallback.phrase_header_en,
      phrase_header_vi: data.phrase_header_vi || fallback.phrase_header_vi,
      phrase_vi: data.phrase_vi || fallback.phrase_vi,
      pronunciation: data.pronunciation || fallback.pronunciation,
      phrase_en: data.phrase_en || fallback.phrase_en,
      tip_en: data.tip_en || fallback.tip_en,
      tip_vi: data.tip_vi || fallback.tip_vi,
      more_phrases: data.more_phrases && data.more_phrases.length > 0 ? data.more_phrases : fallback.more_phrases,
    };
  } catch {
    return fallback;
  }
}
