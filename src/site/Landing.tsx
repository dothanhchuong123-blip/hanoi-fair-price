import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getAllReferences } from '../agent/lookup';
import { PriceReference, VerdictLabel } from '../agent/types';
import { DishThumb, RangeBar } from '../components/ui';
import { VERDICT_META } from '../components/ui/VerdictBadge';
import { formatShortVnd } from '../lib/parsePrice';
import { photoFor } from '../lib/photos';
import { perUnit } from '../lib/units';
import { PhoneQrCard } from './PhoneQr';
import { navigate } from './router';
import { LogoMark } from './SiteHeader';

type Lang = 'en' | 'vi';

function quickVerdict(ref: PriceReference, quoted: number): VerdictLabel {
  if (quoted <= ref.high_vnd) return 'fair';
  if (quoted <= ref.high_vnd * 1.3) return 'slightly_high';
  return 'overpriced';
}

const DEMO_CASES: Array<{ id: string; quoteFactor: number }> = [
  { id: 'banh_mi', quoteFactor: 2.4 },
  { id: 'bun_cha', quoteFactor: 0.9 },
  { id: 'ca_phe_trung', quoteFactor: 1.25 },
];

const GUIDE_TEASER = [
  'pho_bo',
  'banh_mi',
  'bun_cha',
  'ca_phe_trung',
  'bia_hoi',
  'nuoc_mia',
  'banh_cuon',
  'xoai_cat',
];

/** One coloured dot and a word: the whole verdict at a glance */
export const VerdictDot: React.FC<{ verdict: VerdictLabel; lang: Lang; className?: string }> = ({
  verdict,
  lang,
  className = '',
}) => {
  const meta = VERDICT_META[verdict];
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${className}`} style={{ color: meta.text }}>
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.dot }} />
      {lang === 'en' ? meta.labelEn : meta.labelVi}
    </span>
  );
};

function useDemoCases() {
  const catalog = useMemo(() => getAllReferences(), []);
  const cases = useMemo(
    () =>
      DEMO_CASES.map((c) => {
        const ref = catalog.find((r) => r.id === c.id)!;
        const quoted = Math.round((ref.high_vnd * c.quoteFactor) / 5000) * 5000;
        return { ref, quoted, verdict: quickVerdict(ref, quoted) };
      }),
    [catalog]
  );
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % cases.length), 4200);
    return () => window.clearInterval(t);
  }, [cases.length]);
  return { ...cases[i], i, total: cases.length };
}

type DemoCase = ReturnType<typeof useDemoCases>;

/** The result sheet on its own, cycling through the demo cases */
const DemoSheet: React.FC<{ lang: Lang }> = ({ lang }) => <DemoSheetView lang={lang} demo={useDemoCases()} />;

/** The result sheet as it slides up over the camera */
const DemoSheetView: React.FC<{ lang: Lang; demo: DemoCase; framed?: boolean }> = ({ lang, demo, framed }) => {
  const { ref, quoted, verdict, i, total } = demo;
  return (
    <div
      className={`bg-surface text-ink ${
        framed ? 'rounded-t-[26px] px-4 pt-2.5 pb-5' : 'rounded-[26px] border border-line shadow-pop p-5'
      }`}
    >
      {framed && <div className="w-9 h-1.5 rounded-full bg-grabber mx-auto mb-3" aria-hidden="true" />}
      <div key={ref.id} className="animate-float-up">
        <div className="flex items-center gap-3">
          <DishThumb
            refId={ref.id}
            name={ref.name_vi}
            category={ref.category}
            className="w-14 h-14 rounded-[14px] text-[22px]"
          />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[16.5px] leading-tight truncate">{ref.name_vi}</div>
            <div className="text-[12.5px] text-ink-2 truncate">{ref.name_en}</div>
            <VerdictDot verdict={verdict} lang={lang} className="text-[13px] mt-1" />
          </div>
          <div className="text-right shrink-0">
            <div className="font-serif text-[30px] leading-none tabular-nums">{formatShortVnd(quoted)}</div>
            <div className="text-[11.5px] text-ink-3 mt-1">{perUnit(ref.unit, lang)}</div>
          </div>
        </div>
        <RangeBar
          low={ref.low_vnd}
          median={ref.median_vnd}
          high={ref.high_vnd}
          quoted={quoted}
          verdict={verdict}
          lang={lang}
          className="mt-4"
        />
        <p className="mt-3 text-[13px] text-ink-2">
          {lang === 'en' ? 'Locals usually pay ' : 'Người địa phương thường trả '}
          <strong className="text-ink tabular-nums">
            {formatShortVnd(ref.low_vnd)}–{formatShortVnd(ref.high_vnd)}
          </strong>
        </p>
      </div>
      <div className="mt-4 flex gap-1.5 justify-center" aria-hidden="true">
        {Array.from({ length: total }).map((_, n) => (
          <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-ink' : 'w-1.5 bg-line'}`} />
        ))}
      </div>
    </div>
  );
};

/** A phone running the app: camera on a real dish, the verdict sheet on top */
const PhoneMock: React.FC<{ lang: Lang }> = ({ lang }) => {
  const demo = useDemoCases();
  const photo = photoFor(demo.ref.id);
  return (
    <button
      type="button"
      onClick={() => navigate({ page: 'app', start: 'sample' })}
      aria-label={lang === 'en' ? 'Try the demo' : 'Thử bản demo'}
      className="group relative block w-[340px] rounded-[54px] bg-[#14110F] p-[11px] shadow-pop cursor-pointer transition-transform hover:-translate-y-1"
    >
      <div className="relative h-[min(690px,calc(100vh-190px))] min-h-[560px] rounded-[44px] overflow-hidden bg-[#0E0C0A] text-left">
        {/* The camera: a soft fill of the scene, with the whole dish sharp and framed above the sheet */}
        {photo && (
          <div key={demo.ref.id} className="absolute inset-0 animate-[fadeIn_0.5s_ease-out]">
            <img src={photo.src} alt="" className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-70" />
            <img
              src={photo.src}
              alt=""
              className="absolute left-0 right-0 top-[96px] w-full aspect-[4/3] object-cover"
              style={{ maskImage: 'linear-gradient(to bottom, transparent, #000 14%, #000 86%, transparent)' }}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/50" />
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[96px] h-[28px] rounded-full bg-black" />
        <div className="absolute top-14 left-0 right-0 flex justify-center">
          <span className="glass-surface rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white">
            Hoàn Kiếm · {lang === 'en' ? 'Old Quarter' : 'Phố cổ'}
          </span>
        </div>
        <div className="absolute left-5 right-5 top-[112px] aspect-[4/3] scale-[0.9]" aria-hidden="true">
          <span className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl-[14px]" />
          <span className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr-[14px]" />
          <span className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl-[14px]" />
          <span className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br-[14px]" />
        </div>
        <div className="absolute bottom-0 left-0 right-0">
          <DemoSheetView lang={lang} demo={demo} framed />
        </div>
      </div>
      <span className="absolute -right-4 top-24 bg-ink text-white text-[12.5px] font-semibold rounded-full px-3.5 py-2 shadow-pop opacity-0 group-hover:opacity-100 transition-opacity">
        {lang === 'en' ? 'Try the demo →' : 'Thử demo →'}
      </span>
    </button>
  );
};

const FoodCard: React.FC<{ r: PriceReference; lang: Lang }> = ({ r, lang }) => (
  <button
    type="button"
    onClick={() => navigate({ page: 'app', start: 'quote', dishId: r.id })}
    className="group text-left cursor-pointer"
  >
    <div className="overflow-hidden rounded-[20px] bg-surface-2">
      <DishThumb
        refId={r.id}
        name={r.name_vi}
        category={r.category}
        className="w-full aspect-[4/3] text-[44px] group-hover:scale-[1.04] transition-transform duration-500"
      />
    </div>
    <div className="mt-3 font-semibold text-[16px] leading-tight truncate">{r.name_vi}</div>
    <div className="text-[13px] text-ink-3 truncate">{r.name_en}</div>
    <div className="mt-1.5 text-[15px] font-semibold text-fair tabular-nums">
      {formatShortVnd(r.low_vnd)}–{formatShortVnd(r.high_vnd)}
      <span className="text-[12.5px] font-medium text-ink-3"> {perUnit(r.unit, lang)}</span>
    </div>
  </button>
);

export const Landing: React.FC<{ lang: Lang }> = ({ lang }) => {
  const catalog = useMemo(() => getAllReferences(), []);
  const teaser = GUIDE_TEASER.map((id) => catalog.find((r) => r.id === id)).filter(
    Boolean
  ) as PriceReference[];
  const en = lang === 'en';

  return (
    <div className="bg-bg text-ink">
      {/* Hero: on a phone, start straight away; on a laptop, hand off to the phone */}
      <section className="paper-grain">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 pt-10 pb-14 lg:pt-14 lg:pb-20 grid lg:grid-cols-[1fr_auto] gap-12 lg:gap-20 items-center">
          <div className="animate-float-up">
            <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-3">
              {en ? `Hà Nội · Old Quarter · ${catalog.length} dishes & fruits` : `Hà Nội · Phố cổ · ${catalog.length} món & hoa quả`}
            </div>
            <h1 className="font-serif mt-4 text-[46px] sm:text-[60px] lg:text-[76px] leading-[0.98] tracking-[-0.01em]">
              {en ? (
                <>
                  Know the <em className="text-brand">fair price</em> before you pay.
                </>
              ) : (
                <>
                  Biết <em className="text-brand">giá hợp lý</em> trước khi trả tiền.
                </>
              )}
            </h1>
            <p className="mt-5 text-[17px] sm:text-[19px] leading-relaxed text-ink-2 max-w-[520px]">
              {en
                ? 'Point your phone at a menu or a fruit stall. In seconds you see what locals pay, and whether the price in front of you is fair.'
                : 'Hướng điện thoại vào thực đơn hay quầy hoa quả. Vài giây sau bạn biết người địa phương trả bao nhiêu và giá trước mặt có hợp lý không.'}
            </p>

            {/* Phones: open the camera right here */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3 lg:hidden">
              <button
                type="button"
                onClick={() => navigate({ page: 'app', start: 'camera' })}
                className="h-[56px] px-7 rounded-full bg-brand text-white text-[16px] font-semibold inline-flex items-center justify-center hover:bg-brand/90 active:scale-[0.99] transition-all cursor-pointer"
              >
                {en ? 'Open the camera' : 'Mở camera'}
              </button>
              <button
                type="button"
                onClick={() => navigate({ page: 'app', start: 'quote' })}
                className="h-[56px] px-7 rounded-full bg-surface border border-line text-ink text-[16px] font-semibold inline-flex items-center justify-center hover:bg-surface-2 transition-all cursor-pointer"
              >
                {en ? 'Type a price instead' : 'Hoặc nhập giá'}
              </button>
            </div>

            {/* Laptops: this is a phone app, so hand over the QR code */}
            <div className="hidden lg:block mt-9">
              <PhoneQrCard lang={lang} className="max-w-[480px]" />
              <div className="mt-5 flex items-center gap-5 text-[15px] font-semibold">
                <button
                  type="button"
                  onClick={() => navigate({ page: 'app', start: 'sample' })}
                  className="inline-flex items-center gap-1.5 text-ink hover:text-brand transition-colors cursor-pointer"
                >
                  {en ? 'Or try the demo here' : 'Hoặc thử demo tại đây'}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <span className="w-px h-4 bg-line" />
                <button
                  type="button"
                  onClick={() => navigate({ page: 'app', start: 'quote' })}
                  className="text-ink-2 hover:text-ink transition-colors cursor-pointer"
                >
                  {en ? 'Type a price' : 'Nhập giá'}
                </button>
              </div>
            </div>
          </div>

          <div className="hidden lg:block">
            <PhoneMock lang={lang} />
          </div>
          <div className="lg:hidden max-w-[440px] w-full">
            <DemoSheet lang={lang} />
          </div>
        </div>
      </section>

      {/* What things cost, with the food itself doing the decorating */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-8 py-14 md:py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-[34px] md:text-[48px] leading-[1.05]">
              {en ? 'What things should cost' : 'Giá bao nhiêu là hợp lý'}
            </h2>
            <p className="mt-2 text-[16px] text-ink-2">
              {en ? 'Typical Old Quarter prices, October 2026.' : 'Giá phổ biến ở Phố cổ, tháng 10/2026.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ page: 'guide' })}
            className="hidden sm:inline-flex items-center gap-2 text-[15px] font-semibold text-ink hover:text-brand transition-colors cursor-pointer shrink-0"
          >
            {en ? `All ${catalog.length} prices` : `Tất cả ${catalog.length} giá`}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
          {teaser.map((r) => (
            <FoodCard key={r.id} r={r} lang={lang} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => navigate({ page: 'guide' })}
          className="sm:hidden mt-8 w-full h-[52px] rounded-full border border-line bg-surface text-[15px] font-semibold cursor-pointer"
        >
          {en ? `See all ${catalog.length} prices` : `Xem tất cả ${catalog.length} giá`}
        </button>
      </section>

      {/* Principles */}
      <section className="bg-ink text-white">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-16 md:py-24 grid lg:grid-cols-[1fr_1.3fr] gap-10">
          <h2 className="font-serif text-[34px] md:text-[48px] leading-[1.05]">
            {en ? 'We explain. We never accuse.' : 'Giải thích rõ ràng. Không quy chụp.'}
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {(en
              ? [
                  ['Where you are', 'Prices around the lake run higher than two streets back. We adjust for it.'],
                  ['What kind of place', 'A plastic stool, a café or a restaurant each have their own fair range.'],
                  ['When it is', 'Fruit in season is cheaper. Tết pushes everything up. We know the calendar.'],
                ]
              : [
                  ['Ở đâu', 'Quanh hồ giá cao hơn vài con phố phía sau. Chúng tôi điều chỉnh theo đó.'],
                  ['Loại quán', 'Ghế nhựa vỉa hè, quán cà phê hay nhà hàng đều có mức giá riêng.'],
                  ['Khi nào', 'Hoa quả đúng mùa rẻ hơn. Tết giá tăng. Chúng tôi tính cả điều đó.'],
                ]
            ).map(([t, b], n) => (
              <div key={t}>
                <div className="font-serif text-[15px] text-white/40 tabular-nums">0{n + 1}</div>
                <h3 className="mt-2 text-[17px] font-semibold">{t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/65">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-ink-3 text-center sm:text-left">
          <div className="flex items-center gap-2.5">
            <LogoMark className="w-7 h-7" />
            <span>Chợ Price Lens · Hà Nội</span>
          </div>
          <span>
            {en ? 'Free · No sign-up · Photos are never stored · ' : 'Miễn phí · Không cần đăng ký · Không lưu ảnh · '}
            <button
              type="button"
              onClick={() => navigate({ page: 'guide' })}
              className="underline underline-offset-2 hover:text-ink cursor-pointer"
            >
              {en ? 'Photo credits' : 'Nguồn ảnh'}
            </button>
          </span>
        </div>
      </footer>
    </div>
  );
};
