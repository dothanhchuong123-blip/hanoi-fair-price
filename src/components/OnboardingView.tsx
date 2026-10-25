import React, { useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { Button, Chip, ConfidenceMeter, RangeBar, VerdictBadge } from './ui';

interface OnboardingViewProps {
  lang: 'en' | 'vi';
  onChangeLang: (lang: 'en' | 'vi') => void;
  onGetStarted: () => void;
  onTrySampleMenu: () => void;
}

const SparkleIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M8 1.5 C8.5 5, 11 7.5, 14.5 8 C11 8.5, 8.5 11, 8 14.5 C7.5 11, 5 8.5, 1.5 8 C5 7.5, 7.5 5, 8 1.5 Z" />
  </svg>
);

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  lang,
  onChangeLang,
  onGetStarted,
  onTrySampleMenu,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerStartX = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const cards = [
    {
      title:
        lang === 'en'
          ? 'Know if a price is fair — before you pay'
          : 'Biết giá hợp lý — trước khi trả tiền',
      body:
        lang === 'en'
          ? 'Snap a menu, price board or market stall. We read it and compare with typical Hanoi prices.'
          : 'Chụp thực đơn, bảng giá hoặc quầy hàng. Chúng tôi đọc giá và so sánh với mức giá phổ biến tại Hà Nội.',
    },
    {
      title:
        lang === 'en'
          ? 'We explain, never accuse'
          : 'Giải thích rõ ràng, không quy chụp',
      body:
        lang === 'en'
          ? 'Prices vary by street, venue and season. We show the typical range, our sources and how sure we are.'
          : 'Giá cả thay đổi theo từng con phố, loại quán và mùa vụ. Chúng tôi hiển thị khoảng giá phổ biến, nguồn tham khảo và độ tin cậy.',
    },
    {
      title:
        lang === 'en'
          ? 'Ask politely, save a little'
          : 'Hỏi giá lịch sự, tiết kiệm dễ dàng',
      body:
        lang === 'en'
          ? 'Get a friendly Vietnamese phrase to ask for a better price, with pronunciation.'
          : 'Gợi ý câu tiếng Việt thân thiện để hỏi mức giá tốt hơn, kèm phát âm chuẩn.',
    },
  ];

  const handleTouchStart = (clientX: number) => {
    pointerStartX.current = clientX;
  };

  const handleTouchMove = (clientX: number) => {
    if (pointerStartX.current === null) return;
    setDragOffset(clientX - pointerStartX.current);
  };

  const handleTouchEnd = () => {
    if (pointerStartX.current === null) return;
    if (dragOffset < -40 && activeIndex < cards.length - 1) {
      setActiveIndex((i) => i + 1);
    } else if (dragOffset > 40 && activeIndex > 0) {
      setActiveIndex((i) => i - 1);
    }
    pointerStartX.current = null;
    setDragOffset(0);
  };

  return (
    <div
      data-testid="onboarding-screen"
      className="flex-1 flex flex-col justify-between bg-bg text-ink px-6 pt-5 pb-6 select-none overflow-hidden"
    >
      {/* Top Bar: EN / VI Toggle Top-Right matching Screenshot 01 */}
      <div className="flex items-center justify-end">
        <div
          role="group"
          aria-label="Language selector"
          className="bg-[#EAE6DD] p-1 rounded-full inline-flex items-center text-[13px] font-bold"
        >
          <button
            type="button"
            onClick={() => onChangeLang('en')}
            aria-pressed={lang === 'en'}
            className={`px-3.5 py-1 rounded-full transition-colors cursor-pointer ${
              lang === 'en' ? 'bg-surface text-ink shadow-xs' : 'text-ink-2 hover:text-ink'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => onChangeLang('vi')}
            aria-pressed={lang === 'vi'}
            className={`px-3.5 py-1 rounded-full transition-colors cursor-pointer ${
              lang === 'vi' ? 'bg-surface text-ink shadow-xs' : 'text-ink-2 hover:text-ink'
            }`}
          >
            VI
          </button>
        </div>
      </div>

      {/* Swipeable Cards Area */}
      <div
        className="flex-1 flex flex-col justify-center my-3 touch-pan-y"
        onTouchStart={(e) => handleTouchStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleTouchMove(e.touches[0].clientX)}
        onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => handleTouchStart(e.clientX)}
        onMouseMove={(e) => {
          if (pointerStartX.current !== null) handleTouchMove(e.clientX);
        }}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
      >
        {/* Illustration Stage */}
        <div className="bg-[#EBE7DE] rounded-[28px] px-5 pt-6 pb-4 flex flex-col items-center justify-between min-h-[332px]">
          {activeIndex === 0 && (
            <>
              {/* Live-rendered menu with 3 detection rows and pins matching Screenshot 01 */}
              <div
                className="w-full rounded-[16px] px-4 pt-5 pb-3.5 shadow-[0_16px_34px_rgba(21,19,15,0.14)] transition-transform duration-300"
                style={{
                  backgroundColor: '#EFE6CF',
                  transform: 'rotate(-1.5deg)',
                }}
              >
                <div className="text-center mb-3">
                  <div className="font-extrabold text-[19px] leading-tight tracking-tight text-[#7F1D1D] uppercase">
                    QUÁN NGON PHỐ CỔ
                  </div>
                  <div className="text-[12px] text-[#6B665C] font-medium mt-0.5">
                    Hàng Bạc · Hà Nội
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {/* Row 1: Phở bò 60k - Fair */}
                  <div
                    style={{
                      border: '2px solid #1F8A5B',
                      backgroundColor: 'rgba(22, 163, 106, 0.12)',
                    }}
                    className="relative flex items-center justify-between px-3.5 py-1.5 rounded-[10px]"
                  >
                    <span className="text-[16px] font-semibold text-ink">Phở bò</span>
                    <span className="absolute -top-3 right-14 bg-fair text-white text-[11.5px] font-bold px-2.5 py-0.5 rounded-full leading-tight shadow-xs">
                      {lang === 'en' ? 'Fair' : 'Hợp lý'}
                    </span>
                    <span className="text-[16px] font-semibold text-ink tabular-nums">60k</span>
                  </div>

                  {/* Row 2: Bún chả 120k - +71% */}
                  <div
                    style={{
                      border: '2px solid #C8361D',
                      backgroundColor: 'rgba(229, 72, 77, 0.12)',
                    }}
                    className="relative flex items-center justify-between px-3.5 py-1.5 rounded-[10px]"
                  >
                    <span className="text-[16px] font-semibold text-ink">Bún chả</span>
                    <span className="absolute -top-3 right-14 bg-bad text-white text-[11.5px] font-bold px-2.5 py-0.5 rounded-full leading-tight shadow-xs tabular-nums">
                      +71%
                    </span>
                    <span className="text-[16px] font-semibold text-ink tabular-nums">120k</span>
                  </div>

                  {/* Row 3: Bánh mì 30k - +17% */}
                  <div
                    style={{
                      border: '2px solid #D99A1E',
                      backgroundColor: 'rgba(224, 138, 0, 0.12)',
                    }}
                    className="relative flex items-center justify-between px-3.5 py-1.5 rounded-[10px]"
                  >
                    <span className="text-[16px] font-semibold text-ink">Bánh mì</span>
                    <span className="absolute -top-3 right-14 bg-warn text-white text-[11.5px] font-bold px-2.5 py-0.5 rounded-full leading-tight shadow-xs tabular-nums">
                      +17%
                    </span>
                    <span className="text-[16px] font-semibold text-ink tabular-nums">30k</span>
                  </div>

                  {/* Row 4: Trà đá 15k - Unchecked */}
                  <div className="flex items-center justify-between px-3.5 py-1">
                    <span className="text-[16px] font-semibold text-ink">Trà đá</span>
                    <span className="text-[16px] font-semibold text-ink tabular-nums">15k</span>
                  </div>
                </div>
              </div>

              <Chip
                variant="brand"
                className="mt-4 bg-[#EBF0FF] text-brand border-none shadow-xs px-4 py-1.5 text-[13px] font-bold"
              >
                <SparkleIcon className="w-3.5 h-3.5 text-brand" />
                <span>
                  {lang === 'en' ? 'Read 4 items · checked 3' : 'Đọc 4 món · đã kiểm 3'}
                </span>
              </Chip>
            </>
          )}

          {activeIndex === 1 && (
            <>
              {/* Card 2 live-rendered illustration: RangeBar, VerdictBadge & ConfidenceMeter */}
              <div className="w-full bg-surface rounded-[18px] p-4 shadow-[0_14px_30px_rgba(21,19,15,0.10)] border border-line flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-[17px] text-ink">Bún chả · 120k</div>
                    <div className="text-[12.5px] text-ink-2">
                      {lang === 'en'
                        ? 'Grilled pork & noodles · 1 portion'
                        : 'Bún chả Hà Nội · 1 suất'}
                    </div>
                  </div>
                  <VerdictBadge verdict="overpriced" lang={lang} />
                </div>

                <RangeBar
                  low={50000}
                  median={60000}
                  high={70000}
                  quoted={120000}
                  verdict="overpriced"
                  lang={lang}
                />

                <div className="pt-2 border-t border-line flex items-center justify-between">
                  <ConfidenceMeter confidence={0.92} lang={lang} />
                  <span className="text-[12px] font-semibold text-ink-2">
                    {lang === 'en' ? '3 Hanoi sources' : '3 nguồn Hà Nội'}
                  </span>
                </div>
              </div>

              <Chip
                variant="brand"
                className="mt-4 bg-[#EBF0FF] text-brand border-none shadow-xs px-4 py-1.5 text-[13px] font-bold"
              >
                <SparkleIcon className="w-3.5 h-3.5 text-brand" />
                <span>
                  {lang === 'en'
                    ? 'Typical range · sources · confidence'
                    : 'Khoảng giá chuẩn · nguồn · độ tin cậy'}
                </span>
              </Chip>
            </>
          )}

          {activeIndex === 2 && (
            <>
              {/* Card 3 live-rendered illustration: Polite Vietnamese phrase card */}
              <div className="w-full bg-surface rounded-[18px] p-4 shadow-[0_14px_30px_rgba(21,19,15,0.10)] border border-line flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3">
                    {lang === 'en' ? 'Polite Vietnamese' : 'Câu hỏi lịch sự'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[12px] font-bold text-brand bg-brand-soft px-2.5 py-0.5 rounded-full">
                    <Volume2 className="w-3.5 h-3.5" />
                    {lang === 'en' ? 'Speak' : 'Phát âm'}
                  </span>
                </div>

                <div className="font-display text-[21px] leading-snug text-ink">
                  “Chị ơi, 60k một suất được không ạ?”
                </div>

                <div className="text-[13.5px] font-medium text-brand bg-brand-soft/60 rounded-[10px] px-3 py-1.5">
                  Chee oi, sáu mươi nghìn một suất duoc khong ah?
                </div>

                <div className="text-[13px] text-ink-2 pt-1 border-t border-line">
                  {lang === 'en'
                    ? '“Sister, would 60k for a portion be okay?”'
                    : 'Hỏi nhẹ nhàng theo mức giá phổ biến tại Phố cổ'}
                </div>
              </div>

              <Chip
                variant="brand"
                className="mt-4 bg-[#EBF0FF] text-brand border-none shadow-xs px-4 py-1.5 text-[13px] font-bold"
              >
                <SparkleIcon className="w-3.5 h-3.5 text-brand" />
                <span>
                  {lang === 'en'
                    ? 'Friendly phrase · with pronunciation'
                    : 'Thân thiện · kèm hướng dẫn phát âm'}
                </span>
              </Chip>
            </>
          )}
        </div>

        {/* Copy Section */}
        <div className="mt-6 min-h-[140px]">
          <h1 className="font-display text-[30px] leading-[1.12] tracking-tight text-ink">
            {activeIndex === 0 && lang === 'en' ? (
              <>
                Know if a price is fair
                <br />— before you pay
              </>
            ) : (
              cards[activeIndex].title
            )}
          </h1>
          <p className="text-[15.5px] leading-[1.48] text-ink-2 mt-3">
            {cards[activeIndex].body}
          </p>
        </div>
      </div>

      {/* Bottom Controls: Pagination Dots + Buttons matching Screenshot 01 */}
      <div className="flex flex-col items-center pt-1">
        <div
          role="tablist"
          aria-label={lang === 'en' ? 'Onboarding slides' : 'Các trang giới thiệu'}
          className="flex items-center justify-center gap-2 mb-5"
        >
          {cards.map((card, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={idx === activeIndex}
              aria-label={`${lang === 'en' ? 'Slide' : 'Trang'} ${idx + 1}: ${card.title}`}
              onClick={() => setActiveIndex(idx)}
              className={`w-2 h-2 rounded-full transition-colors cursor-pointer ${
                idx === activeIndex ? 'bg-ink' : 'bg-[#D5D0C5] hover:bg-ink-3'
              }`}
            />
          ))}
        </div>

        <Button
          variant="primary"
          onClick={onGetStarted}
          className="w-full h-[54px] text-[16px] font-bold"
        >
          {lang === 'en' ? 'Get started' : 'Bắt đầu'}
        </Button>

        <button
          type="button"
          onClick={onTrySampleMenu}
          className="mt-3.5 py-1.5 text-[15.5px] font-bold text-brand hover:underline cursor-pointer"
        >
          {lang === 'en' ? 'Try a sample menu' : 'Thử với thực đơn mẫu'}
        </button>
      </div>
    </div>
  );
};
