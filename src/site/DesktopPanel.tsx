import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { getAllReferences } from '../agent/lookup';
import { DishThumb } from '../components/ui';
import { formatShortVnd } from '../lib/parsePrice';
import { perUnit } from '../lib/units';
import { HistoryList } from './HistoryList';
import { PhoneQrCard } from './PhoneQr';

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

/** The column next to the app on laptops: hand-off to the phone, examples, the price guide and history */
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
      photo: 'bun_cha',
      title: en ? 'A street menu' : 'Thực đơn quán',
      body: en ? '7 dishes, read and judged' : '7 món, đọc và đánh giá',
      onClick: () => onTrySample('menu'),
    },
    {
      photo: 'xoai_cat',
      title: en ? 'A fruit stall' : 'Quầy hoa quả',
      body: en ? 'Mango at 80k per kg' : 'Xoài 80k một cân',
      onClick: () => onTrySample('stall'),
    },
  ];

  return (
    <aside className="hidden lg:flex flex-col flex-1 min-w-0 max-w-[600px] text-ink pt-2">
      <h1 className="font-serif text-[46px] leading-[1.02]">
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
      <p className="mt-3 text-[16.5px] leading-relaxed text-ink-2 max-w-[500px]">
        {en
          ? 'This works best on your phone, where the camera reads prices live. On a laptop, try an example or type a price.'
          : 'Dùng tốt nhất trên điện thoại, nơi camera đọc giá trực tiếp. Trên máy tính, hãy thử ví dụ hoặc nhập giá.'}
      </p>

      <PhoneQrCard lang={lang} className="mt-6" />

      <div className="mt-7 grid grid-cols-[1fr_1fr_0.8fr] gap-3">
        {examples.map((ex) => (
          <button
            key={ex.title}
            type="button"
            onClick={ex.onClick}
            className="group text-left bg-surface rounded-[20px] border border-line overflow-hidden hover:shadow-card transition-shadow cursor-pointer"
          >
            <DishThumb
              refId={ex.photo}
              name={ex.title}
              className="w-full h-[92px] text-[28px] group-hover:scale-[1.04] transition-transform duration-500"
            />
            <div className="p-3.5 pt-3">
              <div className="font-semibold text-[15px]">{ex.title}</div>
              <div className="text-[12.5px] text-ink-2 mt-0.5">{ex.body}</div>
            </div>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onQuickQuote()}
          className="text-left bg-ink text-white rounded-[20px] p-3.5 flex flex-col justify-between hover:bg-ink/90 transition-colors cursor-pointer"
        >
          <span className="font-serif text-[34px] leading-none tabular-nums">45k?</span>
          <span>
            <span className="block font-semibold text-[15px]">{en ? 'Type a price' : 'Nhập giá'}</span>
            <span className="block text-[12.5px] text-white/65 mt-0.5">{en ? 'No photo needed' : 'Không cần ảnh'}</span>
          </span>
        </button>
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
          {tab === 'guide' && <span className="text-[12.5px] text-ink-3">1 lạng = 100 g</span>}
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
            <ul className="mt-2 max-h-[380px] overflow-y-auto divide-y divide-line -mx-2">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onQuickQuote(r.id)}
                    className="w-full px-2 py-2.5 flex items-center gap-3 rounded-[12px] hover:bg-surface-2/70 transition-colors cursor-pointer text-left"
                  >
                    <DishThumb
                      refId={r.id}
                      name={r.name_vi}
                      category={r.category}
                      className="w-11 h-11 rounded-[12px] text-[18px]"
                    />
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
