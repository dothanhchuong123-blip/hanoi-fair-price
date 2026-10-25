import React from 'react';
import { EvaluatedItem, PerceivedItem, VerdictLabel } from '../agent/types';
import { parseStallMask } from '../lib/liveTracker';
import { VERDICT_META } from './ui/VerdictBadge';

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
    border: VERDICT_META.fair.border,
    fill: VERDICT_META.fair.tint,
    dot: VERDICT_META.fair.dot,
    labelEn: VERDICT_META.fair.labelEn,
    labelVi: VERDICT_META.fair.labelVi,
    pillBg: VERDICT_META.fair.bg,
    pillText: VERDICT_META.fair.text,
  },
  slightly_high: {
    border: VERDICT_META.slightly_high.border,
    fill: VERDICT_META.slightly_high.tint,
    dot: VERDICT_META.slightly_high.dot,
    labelEn: VERDICT_META.slightly_high.labelEn,
    labelVi: VERDICT_META.slightly_high.labelVi,
    pillBg: VERDICT_META.slightly_high.bg,
    pillText: VERDICT_META.slightly_high.text,
  },
  overpriced: {
    border: VERDICT_META.overpriced.border,
    fill: VERDICT_META.overpriced.tint,
    dot: VERDICT_META.overpriced.dot,
    labelEn: VERDICT_META.overpriced.labelEn,
    labelVi: VERDICT_META.overpriced.labelVi,
    pillBg: VERDICT_META.overpriced.bg,
    pillText: VERDICT_META.overpriced.text,
  },
  unknown: {
    border: VERDICT_META.unknown.border,
    fill: VERDICT_META.unknown.tint,
    dot: VERDICT_META.unknown.dot,
    labelEn: VERDICT_META.unknown.labelEn,
    labelVi: VERDICT_META.unknown.labelVi,
    pillBg: VERDICT_META.unknown.bg,
    pillText: VERDICT_META.unknown.text,
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
  const isCompactMode = mode === 'scanning' || mode === 'results';

  return (
    <div className="relative w-full max-w-[304px] mx-auto select-none">
      {/* Cream menu card matching Screenshots 02, 04, 05 */}
      <div
        className={`relative rounded-[14px] px-4 ${
          isCompactMode ? 'pt-3.5 pb-3' : 'pt-5 pb-4'
        } shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-transform duration-300`}
        style={{
          backgroundColor: mode === 'scanning' ? '#CDC3AE' : '#EFE6D0',
          transform: isCompactMode ? 'rotate(0deg)' : 'rotate(-1.25deg)',
        }}
      >
        {/* Title & Street */}
        <div className={`text-center ${isCompactMode ? 'mb-2' : 'mb-3'}`}>
          <h2 className="font-extrabold text-[18px] leading-tight tracking-tight text-[#7F1D1D] uppercase">
            QUÁN NGON PHỐ CỔ
          </h2>
          <p className="text-[11.5px] text-[#6B665C] font-medium mt-0.5">
            Hàng Bạc · Hà Nội
          </p>
        </div>

        {/* 7 Menu Rows */}
        <div className="flex flex-col gap-1 relative">
          {MENU_ROWS.map((row, idx) => {
            const evalItem = evaluatedItems.find((e) => e.index === idx);
            const verdict = evalItem?.judgment.verdict || 'unknown';
            const style = VERDICT_STYLES[verdict];
            const pctHigh = evalItem?.judgment.pct_above_high;

            const isScanning = mode === 'scanning';
            const isResultRow = mode === 'results' && Boolean(evalItem);
            const isFair = isResultRow && verdict === 'fair';
            const isUnsure = isResultRow && verdict === 'unknown';
            const showPctPill =
              isResultRow &&
              (verdict === 'overpriced' || verdict === 'slightly_high') &&
              pctHigh !== null &&
              pctHigh !== undefined;

            const RowTag = isResultRow ? 'button' : 'div';

            let boxStyle: React.CSSProperties = {
              border: '2px solid transparent',
            };

            if (isScanning) {
              boxStyle = {
                border: '2px solid #C8361D',
                backgroundColor: 'rgba(200, 54, 29, 0.10)',
              };
            } else if (isResultRow) {
              if (isUnsure) {
                boxStyle = {
                  border: '2px dashed #7C7C86',
                  backgroundColor: 'rgba(124, 124, 134, 0.08)',
                };
              } else if (isFair) {
                boxStyle = {
                  border: '2px solid #1F8A5B',
                  backgroundColor: 'rgba(22, 163, 106, 0.10)',
                  opacity: 0.38,
                };
              } else {
                boxStyle = {
                  border: `2px solid ${style.border}`,
                  backgroundColor: style.fill,
                };
              }
            }

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
                style={boxStyle}
                className={`w-full relative flex items-center justify-between px-3 ${
                  isCompactMode ? 'py-1' : 'py-1.5'
                } rounded-[9px] transition-all text-left ${
                  isResultRow ? 'cursor-pointer hover:opacity-100 active:scale-[0.99]' : ''
                }`}
              >
                <span className="text-[15px] font-semibold leading-snug text-ink whitespace-nowrap shrink-0">
                  {row.name}
                </span>

                {/* Top-edge pill just left of the price so it never covers the printed price */}
                {showPctPill && (
                  <span
                    style={{ backgroundColor: style.dot }}
                    className="absolute -top-2.5 right-14 px-2 py-0.5 rounded-full text-[11px] font-bold text-white leading-none shadow-xs tabular-nums pointer-events-none"
                  >
                    +{pctHigh}%
                  </span>
                )}

                {isUnsure && (
                  <span
                    className="absolute -top-2.5 right-14 w-5 h-5 rounded-full bg-unsure text-white text-[11px] font-bold flex items-center justify-center leading-none shadow-xs pointer-events-none"
                  >
                    ?
                  </span>
                )}

                <span className="text-[15px] font-semibold leading-snug text-ink tabular-nums whitespace-nowrap">
                  {row.price}
                </span>
              </RowTag>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface SampleStallBasketProps {
  mode: 'preview' | 'scanning' | 'disambiguation' | 'results';
  lang: 'en' | 'vi';
  evaluatedItems?: EvaluatedItem[];
  activeQuestionItemIndex?: number;
  onSelectItem?: (item: EvaluatedItem) => void;
}

export const MangoSvg: React.FC<{ className?: string }> = ({ className = 'w-10 h-10' }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="mangoGrad" x1="15%" y1="15%" x2="85%" y2="85%">
        <stop offset="0%" stopColor="#D63A2F" />
        <stop offset="45%" stopColor="#E8A528" />
        <stop offset="100%" stopColor="#6A9928" />
      </linearGradient>
    </defs>
    <path d="M42 18 C40 12, 36 10, 34 12" stroke="#4A3520" strokeWidth="4" strokeLinecap="round" fill="none" />
    <path
      d="M36 22 C18 28, 16 56, 30 76 C44 94, 68 96, 78 82 C88 68, 78 52, 74 38 C70 24, 54 16, 36 22 Z"
      fill="url(#mangoGrad)"
      stroke="#5A3A18"
      strokeWidth="1.5"
    />
    <ellipse cx="42" cy="46" rx="8" ry="16" transform="rotate(-24 42 46)" fill="rgba(255,255,255,0.22)" />
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
  activeQuestionItemIndex = 0,
  onSelectItem,
}) => {
  const getPileProps = (pileIdx: number, fallbackLabel: string) => {
    const evalItem = evaluatedItems.find((e) => e.index === pileIdx);
    const verdict = evalItem?.judgment.verdict || 'unknown';
    const style = VERDICT_STYLES[verdict];
    const pctHigh = evalItem?.judgment.pct_above_high;
    const isResult = mode === 'results' && Boolean(evalItem);
    const isAskedPile =
      (mode === 'disambiguation' || mode === 'scanning') && activeQuestionItemIndex === pileIdx;
    const isDimmed = mode === 'disambiguation' && activeQuestionItemIndex !== pileIdx;

    let boxStyle: React.CSSProperties = {
      border: '2px solid transparent',
    };

    if (isResult) {
      boxStyle = {
        border: verdict === 'unknown' ? '2px dashed #7C7C86' : `2px solid ${style.border}`,
        backgroundColor: style.fill,
      };
    } else if (isAskedPile) {
      boxStyle = {
        border: '2px dashed #7C7C86',
        backgroundColor: 'rgba(124, 124, 134, 0.08)',
      };
    }

    const badgeText =
      pctHigh !== null && pctHigh !== undefined && verdict !== 'fair'
        ? `+${pctHigh}%`
        : lang === 'en'
        ? style.labelEn
        : style.labelVi;

    return {
      evalItem,
      verdict,
      style,
      isResult,
      isAskedPile,
      isDimmed,
      boxStyle,
      badgeText,
      ariaLabel: isResult
        ? `${evalItem?.reference?.name_vi || fallbackLabel} - ${badgeText}`
        : undefined,
    };
  };

  const mangoPile = getPileProps(0, 'Xoài 80k/kg');
  const camPile = getPileProps(1, 'Cam 40k/kg');
  const dragonPile = getPileProps(2, 'Thanh long 35k/kg');

  return (
    <div className="relative w-full max-w-[335px] mx-auto py-2 select-none">
      <div className="grid grid-cols-12 gap-2.5 items-start">
        {/* Left: Mango basket with detection box matching Screenshot 09 */}
        <div
          data-testid={mangoPile.isAskedPile ? 'disambiguation-target-box' : 'stall-pile-0'}
          onClick={() => {
            if (mangoPile.isResult && mangoPile.evalItem && onSelectItem) {
              onSelectItem(mangoPile.evalItem);
            }
          }}
          role={mangoPile.isResult ? 'button' : undefined}
          tabIndex={mangoPile.isResult ? 0 : undefined}
          aria-label={mangoPile.ariaLabel}
          style={mangoPile.boxStyle}
          className={`col-span-7 relative rounded-[24px] p-2 transition-all duration-200 ${
            mangoPile.isResult ? 'cursor-pointer hover:brightness-98' : ''
          } ${mangoPile.isDimmed ? 'opacity-40 brightness-75' : 'opacity-100'}`}
        >
          {/* Top-right "?" pin when asking user */}
          {mangoPile.isAskedPile && (
            <span
              data-testid="disambiguation-question-pin"
              className="absolute -top-2.5 right-3 w-6 h-6 rounded-full bg-unsure text-white text-[12px] font-bold flex items-center justify-center shadow-sm"
            >
              ?
            </span>
          )}

          {mangoPile.isResult && (
            <span
              style={{ backgroundColor: mangoPile.style.dot }}
              className="absolute -top-2.5 right-3 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-sm tabular-nums"
            >
              {mangoPile.badgeText}
            </span>
          )}

          <div className="bg-[#D8D4CA] rounded-[18px] p-3 pt-4 pb-5 relative">
            <div className="grid grid-cols-4 gap-1 place-items-center mb-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <MangoSvg key={i} className="w-8 h-8" />
              ))}
            </div>

            <div className="inline-flex items-center bg-surface text-ink font-bold text-[13.5px] px-3 py-1 rounded-full shadow-xs">
              Xoài 80k/kg
            </div>
          </div>
        </div>

        {/* Right: Secondary fruit baskets (Cam & Thanh long) matching Screenshot 09 */}
        <div className="col-span-5 flex flex-col gap-2.5 pt-1">
          {/* Top-right: Cam 40k/kg */}
          <div
            data-testid={camPile.isAskedPile ? 'disambiguation-target-box' : 'stall-pile-1'}
            onClick={() => {
              if (camPile.isResult && camPile.evalItem && onSelectItem) {
                onSelectItem(camPile.evalItem);
              }
            }}
            role={camPile.isResult ? 'button' : undefined}
            tabIndex={camPile.isResult ? 0 : undefined}
            aria-label={camPile.ariaLabel}
            style={camPile.boxStyle}
            className={`relative rounded-[20px] p-1 transition-all duration-200 ${
              camPile.isResult ? 'cursor-pointer hover:brightness-98' : ''
            } ${camPile.isDimmed ? 'opacity-45 brightness-75' : 'opacity-100'}`}
          >
            {camPile.isAskedPile && (
              <span
                data-testid="disambiguation-question-pin"
                className="absolute -top-2 right-2.5 w-5 h-5 rounded-full bg-unsure text-white text-[11px] font-bold flex items-center justify-center shadow-sm z-10"
              >
                ?
              </span>
            )}
            {camPile.isResult && (
              <span
                style={{ backgroundColor: camPile.style.dot }}
                className="absolute -top-2 right-2.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold text-white shadow-sm tabular-nums z-10"
              >
                {camPile.badgeText}
              </span>
            )}
            <div className="bg-[#D8D4CA] rounded-[16px] p-2.5 pb-3 relative">
              <div className="grid grid-cols-3 gap-1 place-items-center mb-2 text-[22px] leading-none">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} aria-hidden="true">
                    🍊
                  </span>
                ))}
              </div>
              <div className="inline-flex items-center bg-surface text-ink font-bold text-[12px] px-2.5 py-0.5 rounded-full shadow-xs whitespace-nowrap">
                Cam 40k/kg
              </div>
            </div>
          </div>

          {/* Bottom-right: Thanh long 35k/kg */}
          <div
            data-testid={dragonPile.isAskedPile ? 'disambiguation-target-box' : 'stall-pile-2'}
            onClick={() => {
              if (dragonPile.isResult && dragonPile.evalItem && onSelectItem) {
                onSelectItem(dragonPile.evalItem);
              }
            }}
            role={dragonPile.isResult ? 'button' : undefined}
            tabIndex={dragonPile.isResult ? 0 : undefined}
            aria-label={dragonPile.ariaLabel}
            style={dragonPile.boxStyle}
            className={`relative rounded-[20px] p-1 transition-all duration-200 ${
              dragonPile.isResult ? 'cursor-pointer hover:brightness-98' : ''
            } ${dragonPile.isDimmed ? 'opacity-45 brightness-75' : 'opacity-100'}`}
          >
            {dragonPile.isAskedPile && (
              <span
                data-testid="disambiguation-question-pin"
                className="absolute -top-2 right-2.5 w-5 h-5 rounded-full bg-unsure text-white text-[11px] font-bold flex items-center justify-center shadow-sm z-10"
              >
                ?
              </span>
            )}
            {dragonPile.isResult && (
              <span
                style={{ backgroundColor: dragonPile.style.dot }}
                className="absolute -top-2 right-2.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold text-white shadow-sm tabular-nums z-10"
              >
                {dragonPile.badgeText}
              </span>
            )}
            <div className="bg-[#D8D4CA] rounded-[16px] p-2 pb-2.5 relative">
              <div className="grid grid-cols-3 gap-1 place-items-center mb-2 text-[22px] leading-none">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} aria-hidden="true">
                    🌺
                  </span>
                ))}
              </div>
              <div className="inline-flex items-center bg-surface text-ink font-bold text-[11px] px-2 py-0.5 rounded-full shadow-xs whitespace-nowrap">
                Thanh long 35k/kg
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface UploadedPhotoCanvasProps {
  imageDataUrl: string;
  mode: 'preview' | 'scanning' | 'disambiguation' | 'results';
  lang: 'en' | 'vi';
  perceivedItems?: PerceivedItem[];
  evaluatedItems?: EvaluatedItem[];
  activeQuestionItemIndex?: number;
  onSelectItem?: (item: EvaluatedItem) => void;
}

export const UploadedPhotoCanvas: React.FC<UploadedPhotoCanvasProps> = ({
  imageDataUrl,
  mode,
  lang,
  perceivedItems = [],
  evaluatedItems = [],
  activeQuestionItemIndex = 0,
  onSelectItem,
}) => {
  const askedItem =
    mode === 'disambiguation' ? perceivedItems[activeQuestionItemIndex] : undefined;

  return (
    <div className="w-full max-w-[335px] mx-auto flex justify-center">
      {/* Shrink-wrap the image so box_2d percentages map onto the photo, not onto letterboxing. */}
      <div className="relative inline-block rounded-[18px] overflow-hidden shadow-2xl border border-white/15 bg-black/40">
        <img
          src={imageDataUrl}
          alt="Captured menu or market stall"
          referrerPolicy="no-referrer"
          className={`block max-w-full max-h-[min(420px,50vh)] w-auto h-auto transition-all ${
            mode === 'disambiguation' ? 'brightness-65' : ''
          }`}
        />

        {/* Brand-blue boxes while scanning */}
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
                  height: `${Math.max(1.2, (ymax - ymin) / 10)}%`,
                  width: `${Math.max(4, (xmax - xmin) / 10)}%`,
                }}
                className="absolute border-2 border-brand bg-brand/10 rounded-[6px] pointer-events-none"
              />
            );
          })}

        {/* Disambiguation mode: show ONLY the asked-about item in a dashed grey box with a "?" pin */}
        {mode === 'disambiguation' && askedItem?.box_2d && (
          <div
            data-testid="disambiguation-target-box"
            style={{
              top: `${askedItem.box_2d[0] / 10}%`,
              left: `${askedItem.box_2d[1] / 10}%`,
              height: `${Math.max(4, (askedItem.box_2d[2] - askedItem.box_2d[0]) / 10)}%`,
              width: `${Math.max(8, (askedItem.box_2d[3] - askedItem.box_2d[1]) / 10)}%`,
              border: '2px dashed #7C7C86',
              backgroundColor: 'rgba(255, 255, 255, 0.14)',
              boxShadow: '0 0 0 9999px rgba(14, 15, 18, 0.42)',
            }}
            className="absolute rounded-[14px] pointer-events-none z-10"
          >
            <span
              data-testid="disambiguation-question-pin"
              className="absolute -top-2.5 right-3 w-6 h-6 rounded-full bg-unsure text-white text-[12px] font-bold flex items-center justify-center shadow-sm"
            >
              ?
            </span>
          </div>
        )}

        {/* Polygon mask SVG overlay in results mode when item has an array-of-points mask */}
        {mode === 'results' && (
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {evaluatedItems
              .filter((e) => Array.isArray(e.perceived.mask) && e.perceived.mask.length >= 3)
              .map((evalItem) => {
                const verdict = evalItem.judgment.verdict;
                const style = VERDICT_STYLES[verdict];
                const pts = (evalItem.perceived.mask as [number, number][])
                  .map(([x, y]) => `${x},${y}`)
                  .join(' ');
                return (
                  <polygon
                    key={`mask-poly-${evalItem.index}`}
                    points={pts}
                    fill={style.fill}
                    stroke={style.border}
                    strokeWidth={6}
                    strokeLinejoin="round"
                  />
                );
              })}
          </svg>
        )}

        {/* Detection boxes in results mode */}
        {mode === 'results' &&
          (() => {
            const rowsWithBoxes = evaluatedItems.filter(
              (e) => e.perceived.box_2d && !e.perceived.is_addon
            );
            return rowsWithBoxes.map((evalItem) => {
              const [ymin, xmin, ymax, xmax] = evalItem.perceived.box_2d;
              const verdict = evalItem.judgment.verdict;
              const style = VERDICT_STYLES[verdict];
              const pctHigh = evalItem.judgment.pct_above_high;
              const isFair = verdict === 'fair';
              const isUnsure = verdict === 'unknown';
              const hasPolygonMask =
                Array.isArray(evalItem.perceived.mask) && evalItem.perceived.mask.length >= 3;
              const hasPngMask =
                typeof evalItem.perceived.mask === 'string' &&
                evalItem.perceived.mask.trim().length > 0;
              const showPctPill =
                (verdict === 'overpriced' || verdict === 'slightly_high') &&
                pctHigh !== null &&
                pctHigh !== undefined;

              const priceText = evalItem.judgment.quoted_vnd
                ? `${Math.round(evalItem.judgment.quoted_vnd / 1000)}k`
                : '?';

              return (
                <button
                  key={evalItem.index}
                  type="button"
                  onClick={() => onSelectItem?.(evalItem)}
                  aria-label={`${evalItem.perceived.name_vi} ${priceText}: ${
                    lang === 'en' ? style.labelEn : style.labelVi
                  }`}
                  style={{
                    top: `${ymin / 10}%`,
                    left: `${xmin / 10}%`,
                    height: `${Math.max(1.2, (ymax - ymin) / 10)}%`,
                    width: `${Math.max(4, (xmax - xmin) / 10)}%`,
                    borderColor: hasPolygonMask
                      ? 'transparent'
                      : isFair
                      ? 'rgba(22, 163, 106, 0.45)'
                      : style.border,
                    backgroundColor:
                      hasPolygonMask || hasPngMask
                        ? 'transparent'
                        : isFair
                        ? 'rgba(22, 163, 106, 0.08)'
                        : style.fill,
                    borderWidth: hasPolygonMask ? '0px' : '1.5px',
                    borderStyle: isUnsure ? 'dashed' : 'solid',
                  }}
                  className="absolute rounded-[6px] cursor-pointer active:scale-[0.98] transition-transform"
                >
                  {hasPngMask && typeof evalItem.perceived.mask === 'string' && (
                    <img
                      src={
                        evalItem.perceived.mask.startsWith('data:')
                          ? evalItem.perceived.mask
                          : `data:image/png;base64,${evalItem.perceived.mask}`
                      }
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-fill rounded-[6px] opacity-35 pointer-events-none"
                    />
                  )}
                  {showPctPill && (
                    <span
                      style={{ backgroundColor: style.dot }}
                      className="absolute -top-2.5 right-6 px-2 py-0.5 rounded-full text-[10.5px] font-bold text-white leading-none shadow-xs tabular-nums"
                    >
                      +{pctHigh}%
                    </span>
                  )}
                  {isUnsure && (
                    <span className="absolute -top-2.5 right-6 w-4 h-4 rounded-full bg-unsure text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-xs">
                      ?
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

