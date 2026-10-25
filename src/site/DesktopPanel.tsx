import React, { useMemo, useState } from 'react';
import { Keyboard, Search, ShoppingBasket, UtensilsCrossed } from 'lucide-react';
import { getAllReferences } from '../agent/lookup';
import { formatShortVnd } from '../lib/parsePrice';
import { perUnit } from '../lib/units';
import { HistoryList } from './HistoryList';

interface DesktopPanelProps {
  lang: 'en' | 'vi';
  onTrySample: (kind: 'menu' | 'stall') => void;
  onQuickQuote: (refId?: string) => void;
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** The right-hand column next to the app on laptops: examples, the price guide and history */
export const DesktopPanel: React.FC<DesktopPanelProps> = ({ lang, onTrySample, onQuickQuote }) => {
  const en = lang === 'en';
  const catalog = useMemo(() => getAllReferences(), []);
  const [tab, setTab] = useState<'guide' | 'history'>('guide');
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const fq = fold(q.trim());
    if (!fq) return catalog;
    return catalog.filter(
      (r) =>
        fold(r.name_vi).includes(fq) ||
        fold(r.name_en).includes(fq) ||
        r.aliases.some((a) => fold(a).includes(fq))
    );
  }, [catalog, q]);

  const examples = [
    {
      icon: <UtensilsCrossed className="w-5 h-5" />,
      title: en ? 'A street menu' : 'Thực đơn quán',
      body: en ? '7 dishes, read and judged' : '7 món, đọc và đánh giá',
      onClick: () => onTrySample('menu'),
    },
    {
      icon: <ShoppingBasket className="w-5 h-5" />,
      title: en ? 'A fruit stall' : 'Quầy hoa quả',
      body: en ? 'Mango at 80k per kg' : 'Xoài 80k một cân',
      onClick: () => onTrySample('stall'),
    },
    {
      icon: <Keyboard className="w-5 h-5" />,
      title: en ? 'Type a price' : 'Nhập giá',
      body: en ? 'No photo needed' : 'Không cần ảnh',
      onClick: () => onQuickQuote(),
    },
  ];

  return (
    <aside className="hidden lg:flex flex-col flex-1 min-w-0 max-w-[620px] text-ink pt-2">
      <h1 className="font-serif text-[44px] leading-[1.05]">
        {en ? (
          <>
            Is that price <em className="text-brand">fair?</em>
          </>
        ) : (
          <>
            Giá đó có <em className="text-brand">hợp lý?</em>
          </>
        )}
      </h1>
      <p className="mt-3 text-[16.5px] leading-relaxed text-ink-2 max-w-[520px]">
        {en
          ? 'Drop in a menu photo or type what the seller said. On your phone, the camera reads prices live.'
          : 'Tải ảnh thực đơn hoặc nhập giá người bán báo. Trên điện thoại, camera đọc giá trực tiếp.'}
      </p>

      <div className="mt-7">
        <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-3 mb-3">
          {en ? 'Try an example' : 'Thử ví dụ'}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {examples.map((ex) => (
            <button
              key={ex.title}
              type="button"
              onClick={ex.onClick}
              className="text-left bg-surface rounded-[20px] border border-line p-4 hover:shadow-card hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span className="w-10 h-10 rounded-full bg-brand-soft text-brand flex items-center justify-center">
                {ex.icon}
              </span>
              <div className="mt-3 font-semibold text-[15px]">{ex.title}</div>
              <div className="text-[13px] text-ink-2 mt-0.5">{ex.body}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 bg-surface rounded-[24px] border border-line shadow-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <div role="tablist" className="flex gap-1 p-1 rounded-full bg-surface-2">
            {(
              [
                ['guide', en ? 'Price guide' : 'Bảng giá'],
                ['history', en ? 'Your checks' : 'Lịch sử'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-4 py-1.5 rounded-full text-[13.5px] font-semibold transition-colors cursor-pointer ${
                  tab === id ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'guide' && (
            <span className="text-[12.5px] text-ink-3">1 lạng = 100 g</span>
          )}
        </div>

        {tab === 'guide' ? (
          <div className="p-5 pt-3">
            <div className="bg-surface-2 rounded-[14px] px-3.5 h-[42px] flex items-center gap-2.5">
              <Search className="w-4 h-4 text-ink-3" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={en ? `Search ${catalog.length} dishes & fruits` : `Tìm trong ${catalog.length} món`}
                aria-label={en ? 'Search the price guide' : 'Tìm trong bảng giá'}
                className="w-full bg-transparent text-[14.5px] placeholder-ink-3 focus:outline-none"
              />
            </div>
            <ul className="mt-2 max-h-[400px] overflow-y-auto divide-y divide-line -mx-2">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onQuickQuote(r.id)}
                    className="w-full px-2 py-2.5 flex items-center gap-3 rounded-[12px] hover:bg-surface-2/70 transition-colors cursor-pointer text-left"
                  >
                    <span className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-[18px] shrink-0">
                      {r.emoji || '🍜'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold truncate">
                        {en ? r.name_en : r.name_vi}
                      </span>
                      <span className="block text-[12.5px] text-ink-3 truncate">
                        {en ? r.name_vi : r.name_en}
                      </span>
                    </span>
                    <span className="text-right shrink-0 tabular-nums">
                      <span className="block text-[14.5px] font-semibold text-fair">
                        {formatShortVnd(r.low_vnd)}–{formatShortVnd(r.high_vnd)}
                      </span>
                      <span className="block text-[12px] text-ink-3">{perUnit(r.unit, lang)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="py-8 text-center text-[14px] text-ink-2">
                  {en ? 'Nothing matches that search.' : 'Không có món nào khớp.'}
                </li>
              )}
            </ul>
          </div>
        ) : (
          <div className="p-5 pt-4">
            <HistoryList lang={lang} compact />
          </div>
        )}
      </div>

      <p className="text-[12.5px] text-ink-3 mt-4">
        {en
          ? 'Prices are estimates for guidance only. Photos are processed in memory and never stored.'
          : 'Giá chỉ mang tính tham khảo. Ảnh chỉ xử lý tức thời và không bao giờ lưu trữ.'}
      </p>
    </aside>
  );
};
