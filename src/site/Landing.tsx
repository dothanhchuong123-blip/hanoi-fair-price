import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Camera, Keyboard, MapPin, ScanLine, ShieldCheck } from 'lucide-react';
import { getAllReferences } from '../agent/lookup';
import { PriceReference, VerdictLabel } from '../agent/types';
import { RangeBar, VerdictBadge } from '../components/ui';
import { formatShortVnd } from '../lib/parsePrice';
import { perUnit } from '../lib/units';
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
  { id: 'pho_bo', quoteFactor: 1.0 },
  { id: 'xoai_cat', quoteFactor: 1.25 },
];

const GUIDE_TEASER = [
  'pho_bo',
  'banh_mi',
  'bun_cha',
  'ca_phe_trung',
  'bia_hoi',
  'nuoc_dua',
  'xoai_cat',
  'kem_trang_tien',
];

const DemoCard: React.FC<{ lang: Lang }> = ({ lang }) => {
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
  const { ref, quoted, verdict } = cases[i];

  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[44px] bg-brand/10 blur-2xl" aria-hidden="true" />
      <div className="relative bg-surface rounded-[28px] border border-line shadow-pop p-5 sm:p-6 max-w-[440px] mx-auto">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
            <MapPin className="w-3.5 h-3.5" /> Hoàn Kiếm · Old Quarter
          </span>
          <span className="text-[11.5px] font-semibold text-ink-3 tabular-nums">
            {i + 1} / {cases.length}
          </span>
        </div>

        <div key={ref.id} className="animate-float-up">
          <div className="mt-4 flex items-center gap-3.5">
            <span className="w-14 h-14 rounded-full bg-surface-2 flex items-center justify-center text-[28px]">
              {ref.emoji}
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-[17px] text-ink leading-tight">
                {lang === 'en' ? ref.name_en : ref.name_vi}
              </div>
              <div className="text-[13px] text-ink-2">{lang === 'en' ? ref.name_vi : ref.name_en}</div>
            </div>
          </div>

          <div className="mt-5 text-[13px] font-medium text-ink-2">
            {lang === 'en' ? 'Seller said' : 'Người bán báo'}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[48px] leading-none text-ink tabular-nums">
              {formatShortVnd(quoted)}
            </span>
            <span className="text-[15px] font-semibold text-ink-2">{perUnit(ref.unit, lang)}</span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <VerdictBadge verdict={verdict} lang={lang} className="text-[13.5px] px-3 py-1.5" />
            <span className="text-[13.5px] text-ink-2">
              {lang === 'en' ? 'Locals pay' : 'Người địa phương trả'}{' '}
              <strong className="text-ink tabular-nums">
                {formatShortVnd(ref.low_vnd)}–{formatShortVnd(ref.high_vnd)}
              </strong>
            </span>
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
        </div>

        <div className="mt-5 pt-4 border-t border-line flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-ink-3">
            {lang === 'en' ? 'Example check · real reference prices' : 'Ví dụ · giá tham khảo thật'}
          </span>
          <div className="flex gap-1.5" aria-hidden="true">
            {cases.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-ink' : 'w-1.5 bg-line'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const Landing: React.FC<{ lang: Lang }> = ({ lang }) => {
  const catalog = useMemo(() => getAllReferences(), []);
  const teaser = GUIDE_TEASER.map((id) => catalog.find((r) => r.id === id)).filter(
    Boolean
  ) as PriceReference[];
  const en = lang === 'en';

  const steps = [
    {
      icon: <ScanLine className="w-5 h-5" />,
      title: en ? 'Point or type' : 'Chụp hoặc nhập',
      body: en
        ? 'Aim at a menu, price board or fruit stall. Or just type what the seller said.'
        : 'Hướng camera vào thực đơn, bảng giá, quầy hoa quả. Hoặc nhập giá người bán báo.',
    },
    {
      icon: <ShieldCheck className="w-5 h-5" />,
      title: en ? 'Get the verdict' : 'Nhận kết luận',
      body: en
        ? 'Fair, a bit high, or above typical, with the range locals pay and how sure we are.'
        : 'Hợp lý, hơi cao hay cao hơn thường lệ, kèm khoảng giá phổ biến và độ tin cậy.',
    },
    {
      icon: <MapPin className="w-5 h-5" />,
      title: en ? 'Pay fair, or walk 300 m' : 'Trả đúng giá, hoặc đi 300 m',
      body: en
        ? 'A polite phrase to ask for a better price, and nearby places that sell it for less.'
        : 'Câu nói lịch sự để mặc cả, và các quán gần đó bán rẻ hơn.',
    },
  ];

  const faqs = en
    ? [
        ['Where do the prices come from?', 'A hand-checked reference list of 56 Old Quarter dishes, drinks and fruits, adjusted for the area, the kind of venue and the season. Reports from people like you refine it over time.'],
        ['Is a high price a scam?', 'Not necessarily. A sit-down café with a lake view costs more than a plastic-stool stall. We show the typical range and the reasons, so you decide.'],
        ['Do you store my photos?', 'No. Photos are read in memory to find the prices and are never saved.'],
        ['Does it work outside the Old Quarter?', 'Yes, for the rest of Hanoi. We adjust the expected range when you are outside the tourist core.'],
        ['Is it free?', 'Yes. No account, no sign-up.'],
      ]
    : [
        ['Giá lấy từ đâu?', 'Danh sách tham khảo 56 món ăn, đồ uống, hoa quả ở Phố cổ, điều chỉnh theo khu vực, loại quán và mùa vụ. Báo giá của người dùng giúp cập nhật dần.'],
        ['Giá cao có phải là chặt chém?', 'Không hẳn. Quán cà phê view hồ đắt hơn quán vỉa hè. Chúng tôi cho thấy khoảng giá và lý do, bạn tự quyết định.'],
        ['Ảnh của tôi có bị lưu không?', 'Không. Ảnh chỉ được đọc tạm thời để tìm giá và không bao giờ lưu lại.'],
        ['Dùng ngoài Phố cổ được không?', 'Được, trong Hà Nội. Khoảng giá được điều chỉnh khi bạn ở ngoài khu du lịch.'],
        ['Có miễn phí không?', 'Có. Không cần tài khoản.'],
      ];

  return (
    <div className="bg-bg text-ink">
      {/* Hero */}
      <section className="paper-grain">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 pt-10 pb-16 md:pt-20 md:pb-24 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="animate-float-up">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-line text-[12.5px] font-semibold text-ink-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand" />
              {en
                ? `Hanoi Old Quarter · ${catalog.length} dishes & fruits`
                : `Phố cổ Hà Nội · ${catalog.length} món & hoa quả`}
            </span>
            <h1 className="font-serif mt-5 text-[44px] sm:text-[56px] lg:text-[68px] leading-[1.02] text-ink">
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
            <p className="mt-5 text-[17px] sm:text-[19px] leading-relaxed text-ink-2 max-w-[540px]">
              {en
                ? 'Point at a menu or type what the seller said. In seconds you see if it’s fair, what locals pay, and where it’s cheaper nearby.'
                : 'Chụp thực đơn hoặc nhập giá người bán báo. Trong vài giây, bạn biết giá có hợp lý không, người địa phương trả bao nhiêu và chỗ nào rẻ hơn.'}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => navigate({ page: 'app', start: 'camera' })}
                className="h-[56px] px-7 rounded-full bg-brand text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2.5 hover:bg-brand/90 active:scale-[0.99] transition-all cursor-pointer shadow-card"
              >
                <Camera className="w-5 h-5" />
                {en ? 'Scan a menu' : 'Chụp thực đơn'}
              </button>
              <button
                type="button"
                onClick={() => navigate({ page: 'app', start: 'quote' })}
                className="h-[56px] px-7 rounded-full bg-surface border border-line text-ink text-[16px] font-semibold inline-flex items-center justify-center gap-2.5 hover:bg-surface-2 active:scale-[0.99] transition-all cursor-pointer"
              >
                <Keyboard className="w-5 h-5" />
                {en ? 'Type a price' : 'Nhập giá'}
              </button>
            </div>
            <p className="mt-5 text-[13px] text-ink-3">
              {en
                ? 'Free · No sign-up · Photos are never stored'
                : 'Miễn phí · Không cần đăng ký · Không lưu ảnh'}
            </p>
          </div>
          <DemoCard lang={lang} />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-[1200px] mx-auto px-4 md:px-8 py-16 md:py-24">
        <h2 className="font-serif text-[34px] md:text-[44px] leading-tight max-w-[640px]">
          {en ? 'Three seconds at the stall. No awkward haggling.' : 'Ba giây tại quầy. Không ngại mặc cả.'}
        </h2>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {steps.map((s, n) => (
            <div key={s.title} className="bg-surface rounded-[24px] border border-line p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="w-11 h-11 rounded-full bg-brand-soft text-brand flex items-center justify-center">
                  {s.icon}
                </span>
                <span className="font-serif text-[40px] leading-none text-line">0{n + 1}</span>
              </div>
              <h3 className="mt-5 text-[19px] font-semibold">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Guide teaser */}
      <section className="bg-surface-2/60 border-y border-line">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-16 md:py-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-[34px] md:text-[44px] leading-tight">
                {en ? 'What things should cost' : 'Giá bao nhiêu là hợp lý'}
              </h2>
              <p className="mt-2 text-[16px] text-ink-2">
                {en ? 'Typical Old Quarter prices, October 2026.' : 'Giá phổ biến ở Phố cổ, tháng 10/2026.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ page: 'guide' })}
              className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink hover:text-brand transition-colors cursor-pointer"
            >
              {en ? `See all ${catalog.length}` : `Xem tất cả ${catalog.length}`}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
            {teaser.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate({ page: 'app', start: 'quote', dishId: r.id })}
                className="text-left bg-surface rounded-[20px] border border-line p-4 hover:shadow-card hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <span className="w-11 h-11 rounded-full bg-surface-2 flex items-center justify-center text-[22px]">
                  {r.emoji}
                </span>
                <div className="mt-3 font-semibold text-[15px] leading-tight">{en ? r.name_en : r.name_vi}</div>
                <div className="text-[12.5px] text-ink-3">{en ? r.name_vi : r.name_en}</div>
                <div className="mt-2.5 text-[15px] font-semibold text-fair tabular-nums">
                  {formatShortVnd(r.low_vnd)}–{formatShortVnd(r.high_vnd)}
                  <span className="text-ink-3 font-medium text-[12.5px]"> {perUnit(r.unit, lang)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="bg-ink text-white">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-16 md:py-24 grid lg:grid-cols-[1fr_1.3fr] gap-10">
          <h2 className="font-serif text-[34px] md:text-[44px] leading-tight">
            {en ? 'We explain. We never accuse.' : 'Giải thích rõ ràng. Không quy chụp.'}
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
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
            ).map(([t, b]) => (
              <div key={t}>
                <div className="w-8 h-[3px] bg-brand rounded-full" />
                <h3 className="mt-4 text-[17px] font-semibold">{t}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/65">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-[820px] mx-auto px-4 md:px-8 py-16 md:py-24">
        <h2 className="font-serif text-[34px] md:text-[44px] leading-tight text-center">
          {en ? 'Questions' : 'Câu hỏi thường gặp'}
        </h2>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {faqs.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[17px] font-semibold">
                {q}
                <span className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-[18px] text-ink-2 group-open:rotate-45 transition-transform shrink-0">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2 pr-10">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-8 pb-16">
        <div className="rounded-[32px] bg-brand text-white p-8 md:p-12 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative">
          <div className="relative">
            <h2 className="font-serif text-[30px] md:text-[40px] leading-tight">
              {en ? 'Heading out to eat?' : 'Sắp ra phố ăn?'}
            </h2>
            <p className="mt-2 text-white/80 text-[16px]">
              {en ? 'Open it on your phone. It works right in the browser.' : 'Mở trên điện thoại. Chạy ngay trên trình duyệt.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ page: 'app', start: 'camera' })}
            className="relative h-[56px] px-7 rounded-full bg-white text-ink text-[16px] font-semibold inline-flex items-center justify-center gap-2 hover:bg-white/90 transition-colors cursor-pointer shrink-0"
          >
            {en ? 'Start checking prices' : 'Bắt đầu kiểm tra giá'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-ink-3">
          <div className="flex items-center gap-2.5">
            <LogoMark className="w-7 h-7" />
            <span>Chợ Price Lens · Hà Nội</span>
          </div>
          <span>
            {en
              ? 'Prices are estimates for guidance only · updated Oct 2026'
              : 'Giá chỉ mang tính tham khảo · cập nhật 10/2026'}
          </span>
        </div>
      </footer>
    </div>
  );
};
