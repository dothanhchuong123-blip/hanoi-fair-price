import React, { useMemo, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { getAllReferences } from '../agent/lookup';
import { ItemCategory, PriceReference } from '../agent/types';
import { formatShortVnd } from '../lib/parsePrice';
import { perUnit, unitLabel } from '../lib/units';
import { HistoryList } from './HistoryList';
import { navigate } from './router';

type Lang = 'en' | 'vi';

const CATEGORIES: Array<{ id: ItemCategory | 'all'; en: string; vi: string }> = [
  { id: 'all', en: 'All', vi: 'Tất cả' },
  { id: 'street_food', en: 'Street food', vi: 'Món ăn' },
  { id: 'drink', en: 'Drinks & coffee', vi: 'Đồ uống' },
  { id: 'fruit', en: 'Fruit', vi: 'Hoa quả' },
  { id: 'vegetable', en: 'Market produce', vi: 'Rau củ' },
];

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

export const DishCard: React.FC<{ r: PriceReference; lang: Lang }> = ({ r, lang }) => {
  const en = lang === 'en';
  return (
    <div className="bg-surface rounded-[22px] border border-line p-4 flex flex-col hover:shadow-card transition-shadow">
      <div className="flex items-start gap-3">
        <span className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-[24px] shrink-0">
          {r.emoji || '🍜'}
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-[15.5px] leading-tight text-ink">{en ? r.name_en : r.name_vi}</div>
          <div className="text-[13px] text-ink-3 mt-0.5">{en ? r.name_vi : r.name_en}</div>
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="font-serif text-[26px] leading-none text-fair tabular-nums">
          {formatShortVnd(r.low_vnd)}–{formatShortVnd(r.high_vnd)}
        </span>
        <span className="text-[13px] font-medium text-ink-2">{perUnit(r.unit, lang)}</span>
      </div>
      <div className="mt-1.5 text-[12.5px] text-ink-3">
        {en
          ? `Usually ${formatShortVnd(r.median_vnd)} · above ${formatShortVnd(r.high_vnd)} is high`
          : `Thường ${formatShortVnd(r.median_vnd)} · trên ${formatShortVnd(r.high_vnd)} là cao`}
      </div>
      <div className="mt-auto pt-4 flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-ink-2 bg-surface-2 rounded-full px-2.5 py-1">
          {unitLabel(r.unit, lang)}
        </span>
        <button
          type="button"
          onClick={() => navigate({ page: 'app', start: 'quote', dishId: r.id })}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:gap-2 transition-all cursor-pointer"
        >
          {en ? 'Check a price' : 'Kiểm tra'}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const Guide: React.FC<{ lang: Lang }> = ({ lang }) => {
  const catalog = useMemo(() => getAllReferences(), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ItemCategory | 'all'>('all');
  const en = lang === 'en';

  const shown = useMemo(() => {
    const fq = fold(q.trim());
    return catalog.filter(
      (r) =>
        (cat === 'all' || r.category === cat) &&
        (!fq ||
          fold(r.name_vi).includes(fq) ||
          fold(r.name_en).includes(fq) ||
          r.aliases.some((a) => fold(a).includes(fq)))
    );
  }, [catalog, q, cat]);

  return (
    <div className="bg-bg text-ink min-h-screen">
      <section className="paper-grain border-b border-line">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 pt-10 pb-8 md:pt-14">
          <h1 className="font-serif text-[40px] md:text-[56px] leading-[1.05]">
            {en ? 'Old Quarter price guide' : 'Bảng giá Phố cổ'}
          </h1>
          <p className="mt-3 text-[16px] md:text-[18px] text-ink-2 max-w-[620px]">
            {en
              ? `What ${catalog.length} dishes, drinks and fruits typically cost around Hoàn Kiếm. Updated October 2026.`
              : `Giá phổ biến của ${catalog.length} món ăn, đồ uống và hoa quả quanh Hoàn Kiếm. Cập nhật 10/2026.`}
          </p>
          <div className="mt-6 bg-surface rounded-[18px] px-4 h-[52px] flex items-center gap-3 border border-line max-w-[520px] focus-within:border-ink/40 transition-colors">
            <Search className="w-4 h-4 text-ink-3 shrink-0" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={en ? 'Search pho, coffee, mango…' : 'Tìm phở, cà phê, xoài…'}
              aria-label={en ? 'Search the price guide' : 'Tìm trong bảng giá'}
              className="w-full bg-transparent text-[15.5px] placeholder-ink-3 focus:outline-none"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Clear" className="text-ink-3 hover:text-ink cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                aria-pressed={cat === c.id}
                className={`px-4 py-2 rounded-full text-[13.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  cat === c.id ? 'bg-ink text-white' : 'bg-surface border border-line text-ink-2 hover:text-ink'
                }`}
              >
                {en ? c.en : c.vi}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-10 grid lg:grid-cols-[1fr_340px] gap-10">
        <div>
          {shown.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-line p-10 text-center text-ink-2">
              {en ? 'Nothing matches that search.' : 'Không có món nào khớp.'}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {shown.map((r) => (
                <DishCard key={r.id} r={r} lang={lang} />
              ))}
            </div>
          )}
        </div>
        <aside className="lg:sticky lg:top-[92px] self-start">
          <h2 className="font-serif text-[24px]">{en ? 'Your checks' : 'Lịch sử của bạn'}</h2>
          <div className="mt-4">
            <HistoryList lang={lang} />
          </div>
        </aside>
      </div>
    </div>
  );
};
