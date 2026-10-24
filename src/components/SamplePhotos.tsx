import React from 'react';
import { EvaluatedItem, PerceivedItem, VerdictLabel } from '../agent/types';

export const VERDICT_STYLES: Record<
  VerdictLabel,
  {
    border: string;
    fill: string;
    dot: string;
    labelEn: string;
    labelVi: string;
    pillBg: string;
    pillText: string;
  }
> = {
  fair: {
    border: '#3E9B5F',
    fill: 'rgba(62, 155, 95, 0.14)',
    dot: '#3E9B5F',
    labelEn: 'Fair',
    labelVi: 'Hợp lý',
    pillBg: '#DCEEE2',
    pillText: '#286E40',
  },
  slightly_high: {
    border: '#E8962C',
    fill: 'rgba(232, 150, 44, 0.14)',
    dot: '#E8962C',
    labelEn: 'A bit high',
    labelVi: 'Hơi cao',
    pillBg: '#F9EBCD',
    pillText: '#9E5F10',
  },
  overpriced: {
    border: '#D9483B',
    fill: 'rgba(217, 72, 59, 0.14)',
    dot: '#D9483B',
    labelEn: 'Above typical',
    labelVi: 'Cao hơn thường lệ',
    pillBg: '#F8E2DF',
    pillText: '#D9483B',
  },
  unknown: {
    border: '#8A8174',
    fill: 'rgba(138, 129, 116, 0.14)',
    dot: '#8A8174',
    labelEn: 'Not sure',
    labelVi: 'Chưa rõ',
    pillBg: '#E6E0D5',
    pillText: '#5C5346',
  },
};

const MENU_ROWS = [
  { name: 'Phở bò', price: '60k' },
  { name: 'Bún chả', price: '120k' },
  { name: 'Bánh mì', price: '30k' },
  { name: 'Nem rán', price: '70k' },
  { name: 'Cà phê trứng', price: '45k' },
  { name: 'Trà đá', price: '15k' },
  { name: 'Bia hơi', price: '25k' },
];

interface SampleMenuBoardProps {
  mode: 'preview' | 'scanning' | 'results';
  lang: 'en' | 'vi';
  evaluatedItems?: EvaluatedItem[];
  onSelectItem?: (item: EvaluatedItem) => void;
}

export const SampleMenuBoard: React.FC<SampleMenuBoardProps> = ({
  mode,
  lang,
  evaluatedItems = [],
  onSelectItem,
}) => {
  return (
    <div className="relative w-full max-w-[332px] mx-auto select-none">
      {/* Tilted cardboard sign matching Screen 1, 2, 3 */}
      <div
        className="relative rounded-[14px] px-5 pt-6 pb-5 shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-transform duration-300"
        style={{
          background: 'linear-gradient(160deg, #DAB97B 0%, #C79F5D 55%, #B48947 100%)',
          transform: 'rotate(-1.35deg)',
        }}
      >
        {/* Title & Street */}
        <div className="text-center mb-3">
          <h2 className="font-hand text-[27px] leading-tight tracking-wide text-[#7B1818] drop-shadow-[0_1px_0_rgba(255,255,255,0.2)]">
            QUÁN NGON PHỐ CỔ
          </h2>
          <p className="font-hand text-[14px] text-[#2A2118]/85 mt-0.5">
            ~ Hàng Bạc · Hà Nội ~
          </p>
        </div>

        {/* 7 Menu Rows */}
        <div className="flex flex-col gap-1.5 relative">
          {MENU_ROWS.map((row, idx) => {
            const evalItem = evaluatedItems.find((e) => e.index === idx);
            const verdict = evalItem?.judgment.verdict || 'unknown';
            const style = VERDICT_STYLES[verdict];

            const isScanDashed = mode === 'scanning' && idx < 3;
            const isResultRow = mode === 'results' && evalItem;

            const RowTag = isResultRow ? 'button' : 'div';

            return (
              <RowTag
                key={row.name}
                type={isResultRow ? 'button' : undefined}
                onClick={() => {
                  if (isResultRow && evalItem && onSelectItem) {
                    onSelectItem(evalItem);
                  }
                }}
                aria-label={
                  isResultRow
                    ? `${row.name} ${row.price} - ${lang === 'en' ? style.labelEn : style.labelVi}`
                    : undefined
                }
                style={
                  isResultRow
                    ? {
                        borderColor: style.border,
                        backgroundColor: style.fill,
                        borderWidth: '2.5px',
                        borderStyle: 'solid',
                      }
                    : isScanDashed
                    ? {
                        border: '2px dashed rgba(246, 239, 225, 0.72)',
                      }
                    : {
                        border: '2.5px solid transparent',
                      }
                }
                className={`w-full relative flex items-center justify-between px-3 py-2 rounded-[12px] transition-all text-left ${
                  isResultRow ? 'cursor-pointer hover:brightness-105 active:scale-[0.99]' : ''
                }`}
              >
                <span className="font-hand text-[21px] leading-none text-[#231B12] whitespace-nowrap shrink-0">
                  {row.name}
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Sticker tag in results mode */}
                  {isResultRow && (
                    <span
                      style={{ animationDelay: `${idx * 90}ms` }}
                      className="sticker-tag animate-tag-pop inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-bold text-[#2A2118] whitespace-nowrap"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: style.dot }}
                      />
                      <span>{lang === 'en' ? style.labelEn : style.labelVi}</span>
                    </span>
                  )}

                  <span className="font-hand text-[22px] leading-none text-[#231B12] tabular-nums whitespace-nowrap">
                    {row.price}
                  </span>
                </div>
              </RowTag>
            );
          })}
        </div>

        {/* Sweeping golden scan beam in scanning mode (Screen 2) */}
        {mode === 'scanning' && (
          <div className="scan-beam pointer-events-none absolute rounded-xl" />
        )}
      </div>
    </div>
  );
};

interface SampleStallBasketProps {
  mode: 'preview' | 'scanning' | 'results';
  lang: 'en' | 'vi';
  evaluatedItems?: EvaluatedItem[];
  onSelectItem?: (item: EvaluatedItem) => void;
}

export const MangoSvg: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="mangoGrad" x1="15%" y1="15%" x2="85%" y2="85%">
        <stop offset="0%" stopColor="#D63A2F" />
        <stop offset="45%" stopColor="#E8A528" />
        <stop offset="100%" stopColor="#6A9928" />
      </linearGradient>
    </defs>
    {/* Stem */}
    <path d="M42 18 C40 12, 36 10, 34 12" stroke="#4A3520" strokeWidth="4" strokeLinecap="round" fill="none" />
    {/* Mango body */}
    <path
      d="M36 22 C18 28, 16 56, 30 76 C44 94, 68 96, 78 82 C88 68, 78 52, 74 38 C70 24, 54 16, 36 22 Z"
      fill="url(#mangoGrad)"
      stroke="#5A3A18"
      strokeWidth="1.5"
    />
    {/* Highlight */}
    <ellipse cx="42" cy="46" rx="8" ry="16" transform="rotate(-24 42 46)" fill="rgba(255,255,255,0.22)" />
    {/* Green Leaf */}
    <path
      d="M41 18 C56 10, 76 16, 82 30 C66 32, 50 26, 41 18 Z"
      fill="#4D9B36"
      stroke="#2E6B1E"
      strokeWidth="1.5"
    />
  </svg>
);

export const SampleStallBasket: React.FC<SampleStallBasketProps> = ({
  mode,
  lang,
  evaluatedItems = [],
  onSelectItem,
}) => {
  const evalItem = evaluatedItems[0];
  const verdict = evalItem?.judgment.verdict || 'unknown';
  const style = VERDICT_STYLES[verdict];
  const isResult = mode === 'results' && evalItem;

  return (
    <div className="relative w-full max-w-[310px] mx-auto pt-6 pb-4 select-none">
      {/* Woven Bamboo Basket (Screen 6) */}
      <div
        onClick={() => {
          if (isResult && evalItem && onSelectItem) {
            onSelectItem(evalItem);
          }
        }}
        role={isResult ? 'button' : undefined}
        tabIndex={isResult ? 0 : undefined}
        aria-label={isResult ? `${evalItem.reference?.name_vi || 'Xoài'} 80k/kg` : undefined}
        className={`relative w-[285px] h-[275px] mx-auto rounded-b-full rounded-t-[16px] shadow-[0_18px_40px_rgba(0,0,0,0.45)] overflow-visible transition-all ${
          isResult ? 'cursor-pointer hover:brightness-105' : ''
        }`}
        style={{
          background:
            'repeating-linear-gradient(45deg, #8F6836 0px, #8F6836 12px, #7A5628 12px, #7A5628 24px)',
          border: isResult ? `3px solid ${style.border}` : '3px solid rgba(199, 159, 93, 0.35)',
        }}
      >
        {/* Cardboard Sign "Xoài 80k/kg" at top-left */}
        <div
          className="absolute -top-5 -left-3 z-20 bg-[#FCF6E8] px-4 py-2 rounded-[12px] shadow-md border-2 border-white"
          style={{ transform: 'rotate(-6deg)' }}
        >
          <span className="font-hand text-[24px] text-[#2A2118] tracking-tight">
            Xoài 80k/kg
          </span>
        </div>

        {/* 5 Mangoes arranged inside the basket */}
        <div className="relative w-full h-full">
          <div className="absolute top-[18%] left-[12%]"><MangoSvg className="w-[74px] h-[74px]" /></div>
          <div className="absolute top-[10%] left-[41%]"><MangoSvg className="w-[74px] h-[74px]" /></div>
          <div className="absolute top-[20%] right-[10%]"><MangoSvg className="w-[74px] h-[74px]" /></div>
          <div className="absolute top-[48%] left-[25%]"><MangoSvg className="w-[74px] h-[74px]" /></div>
          <div className="absolute top-[49%] right-[22%]"><MangoSvg className="w-[74px] h-[74px]" /></div>
        </div>

        {/* Sticker Verdict Tag when in Results mode */}
        {isResult && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
            <span className="sticker-tag animate-tag-pop inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[15px] font-bold text-[#2A2118] whitespace-nowrap">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: style.dot }}
              />
              <span>
                {evalItem.reference?.name_vi || 'Xoài'} · {lang === 'en' ? style.labelEn : style.labelVi}
              </span>
            </span>
          </div>
        )}

        {/* Scan beam in scanning mode */}
        {mode === 'scanning' && (
          <div className="scan-beam pointer-events-none absolute rounded-xl z-30" />
        )}
      </div>
    </div>
  );
};

interface UploadedPhotoCanvasProps {
  imageDataUrl: string;
  mode: 'preview' | 'scanning' | 'results';
  lang: 'en' | 'vi';
  perceivedItems?: PerceivedItem[];
  evaluatedItems?: EvaluatedItem[];
  onSelectItem?: (item: EvaluatedItem) => void;
}

export const UploadedPhotoCanvas: React.FC<UploadedPhotoCanvasProps> = ({
  imageDataUrl,
  mode,
  lang,
  perceivedItems = [],
  evaluatedItems = [],
  onSelectItem,
}) => {
  return (
    <div className="w-full max-w-[335px] mx-auto flex justify-center">
    {/* Shrink-wrap the image so box_2d percentages map onto the photo, not onto letterboxing. */}
    <div className="relative inline-block rounded-[18px] overflow-hidden shadow-2xl border border-white/15 bg-black/40">
      <img
        src={imageDataUrl}
        alt="Captured menu or market stall"
        referrerPolicy="no-referrer"
        className="block max-w-full max-h-[min(440px,52vh)] w-auto h-auto"
      />

      {/* Dashed boxes while scanning */}
      {mode === 'scanning' &&
        perceivedItems.map((item, idx) => {
          if (!item.box_2d) return null;
          const [ymin, xmin, ymax, xmax] = item.box_2d;
          return (
            <div
              key={idx}
              style={{
                top: `${ymin / 10}%`,
                left: `${xmin / 10}%`,
                height: `${Math.max(6, (ymax - ymin) / 10)}%`,
                width: `${Math.max(15, (xmax - xmin) / 10)}%`,
              }}
              className="absolute border-2 border-dashed border-[#F6EFE1]/75 rounded-[10px] pointer-events-none"
            />
          );
        })}

      {/* Colored outlines + tags in results mode. Items we can't compare stay unmarked to keep the photo readable. */}
      {mode === 'results' &&
        (() => {
          const judged = evaluatedItems.filter((e) => e.reference && e.perceived.box_2d);
          // Dense menus get compact dot tags; sparse ones get full sticker labels
          const compact = judged.length > 8;
          return judged.map((evalItem, idx) => {
            const [ymin, xmin, ymax, xmax] = evalItem.perceived.box_2d;
            const style = VERDICT_STYLES[evalItem.judgment.verdict];
            const priceText = evalItem.judgment.quoted_vnd
              ? `${Math.round(evalItem.judgment.quoted_vnd / 1000)}k`
              : '?';

            return (
              <button
                key={evalItem.index}
                type="button"
                onClick={() => onSelectItem?.(evalItem)}
                aria-label={`${evalItem.perceived.name_vi} ${priceText}: ${style.labelEn}`}
                style={{
                  top: `${ymin / 10}%`,
                  left: `${xmin / 10}%`,
                  height: `${Math.max(compact ? 3 : 6, (ymax - ymin) / 10)}%`,
                  width: `${Math.max(12, (xmax - xmin) / 10)}%`,
                  borderColor: style.border,
                  // Dense menus: underline only, so names and prices stay readable
                  backgroundColor: compact ? 'transparent' : style.fill,
                  borderWidth: compact ? '0 0 3px 0' : '2.5px',
                }}
                className={`absolute flex items-center cursor-pointer active:scale-[0.98] transition-transform ${
                  compact ? 'justify-start rounded-[2px]' : 'justify-end rounded-[10px] pr-2'
                }`}
              >
                {compact ? (
                  <span
                    style={{ animationDelay: `${Math.min(idx, 12) * 50}ms`, backgroundColor: style.dot }}
                    className="animate-tag-pop -translate-x-[calc(100%+3px)] w-3 h-3 rounded-full border-2 border-white shadow shrink-0"
                  />
                ) : (
                  <span
                    style={{ animationDelay: `${idx * 110}ms` }}
                    className="sticker-tag animate-tag-pop inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-bold text-[#2A2118] whitespace-nowrap"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: style.dot }} />
                    <span>
                      {priceText} · {lang === 'en' ? style.labelEn : style.labelVi}
                    </span>
                  </span>
                )}
              </button>
            );
          });
        })()}

      {mode === 'scanning' && <div className="scan-beam pointer-events-none absolute" />}
    </div>
    </div>
  );
};
