import React, { useEffect, useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import { VerdictBadge } from '../components/ui';
import { formatShortVnd, formatUsd } from '../lib/parsePrice';
import { clearHistory, getHistory, HistoryEntry, historySavings } from '../lib/storage';
import { perUnit } from '../lib/units';

export function useHistory(): HistoryEntry[] {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => getHistory());
  useEffect(() => {
    const refresh = () => setEntries(getHistory());
    window.addEventListener('cho-history', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('cho-history', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return entries;
}

function timeAgo(ts: number, lang: 'en' | 'vi'): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return lang === 'en' ? 'just now' : 'vừa xong';
  if (mins < 60) return lang === 'en' ? `${mins} min ago` : `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return lang === 'en' ? `${hours} h ago` : `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return lang === 'en' ? `${days} d ago` : `${days} ngày trước`;
}

export const HistoryList: React.FC<{ lang: 'en' | 'vi'; compact?: boolean }> = ({ lang, compact }) => {
  const entries = useHistory();
  const saved = historySavings(entries);
  const en = lang === 'en';

  if (entries.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-line p-6 text-center">
        <span className="mx-auto w-11 h-11 rounded-full bg-surface-2 flex items-center justify-center text-ink-2">
          <History className="w-5 h-5" />
        </span>
        <p className="mt-3 text-[15px] font-semibold text-ink">
          {en ? 'No checks yet' : 'Chưa có lượt kiểm tra'}
        </p>
        <p className="mt-1 text-[13.5px] text-ink-2">
          {en
            ? 'Every price you check is kept here, on this device only.'
            : 'Mọi giá bạn kiểm tra được lưu ở đây, chỉ trên thiết bị này.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-[20px] bg-ink text-white p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[12.5px] text-white/60 font-medium">
            {en ? `${entries.length} prices checked` : `Đã kiểm tra ${entries.length} giá`}
          </div>
          <div className="font-serif text-[24px] leading-tight mt-0.5">
            {saved > 0
              ? en
                ? `${formatShortVnd(saved)} flagged above typical`
                : `${formatShortVnd(saved)} cao hơn thường lệ`
              : en
              ? 'All fair so far'
              : 'Đều hợp lý'}
          </div>
        </div>
        {saved > 0 && (
          <span className="text-[13px] text-white/70 tabular-nums shrink-0">≈ {formatUsd(saved)}</span>
        )}
      </div>

      <ul className={`mt-3 divide-y divide-line ${compact ? 'max-h-[360px] overflow-y-auto' : ''}`}>
        {entries.map((e) => (
          <li key={e.id} className="py-3 flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center text-[20px] shrink-0">
              {e.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-ink truncate">
                {en ? e.name_en : e.name_vi}
              </div>
              <div className="text-[12.5px] text-ink-3">{timeAgo(e.timestamp, lang)}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[14.5px] font-semibold tabular-nums">
                {formatShortVnd(e.quoted_vnd)}
                <span className="text-ink-3 font-medium text-[12px]"> {perUnit(e.unit, lang)}</span>
              </div>
              <VerdictBadge verdict={e.verdict} lang={lang} shortLabel className="mt-1" />
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => {
          if (window.confirm(en ? 'Clear all your checks?' : 'Xóa toàn bộ lịch sử?')) clearHistory();
        }}
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-brand transition-colors cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
        {en ? 'Clear history' : 'Xóa lịch sử'}
      </button>
    </div>
  );
};
