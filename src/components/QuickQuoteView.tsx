import React, { useMemo, useState } from 'react';
import { getAllReferences } from '../agent/lookup';
import { PriceReference } from '../agent/types';
import { convertUnitPrice, formatDotVnd, formatShortVnd, formatUsd } from '../lib/parsePrice';

interface QuickQuoteViewProps {
  lang: 'en' | 'vi';
  initialRefId?: string;
  initialPriceK?: string;
  onToggleLang: () => void;
  onBack: () => void;
  onCheckPrice: (ref: PriceReference, quotedVnd: number, selectedUnit: string) => void;
}

const FEATURED_IDS = [
  'pho_bo',
  'banh_mi',
  'bun_cha',
  'ca_phe_trung',
  'tra_da',
  'bia_hoi',
  'xoai_cat',
  'nuoc_dua',
];

const QUICK_UNITS = ['bát', 'cốc', 'đĩa', 'kg', 'lạng'];

export const QuickQuoteView: React.FC<QuickQuoteViewProps> = ({
  lang,
  initialRefId = 'pho_bo',
  initialPriceK = '80k',
  onToggleLang,
  onBack,
  onCheckPrice,
}) => {
  const catalog = useMemo(() => getAllReferences(), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState(initialRefId);
  const [priceStr, setPriceStr] = useState(initialPriceK);
  const [selectedUnit, setSelectedUnit] = useState<string>('bát');

  const selectedRef = useMemo(
    () => catalog.find((r) => r.id === selectedId) || catalog[0],
    [catalog, selectedId]
  );

  // Filter items by search or show the 8 featured icons from Screen 7
  const displayedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return FEATURED_IDS.map((id) => catalog.find((r) => r.id === id)).filter(
        Boolean
      ) as PriceReference[];
    }
    return catalog
      .filter(
        (r) =>
          r.name_vi.toLowerCase().includes(q) ||
          r.name_en.toLowerCase().includes(q) ||
          r.aliases.some((a) => a.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [catalog, searchQuery]);

  // Parse current numpad string into VND
  const numericVnd = useMemo(() => {
    const clean = priceStr.trim().toLowerCase();
    if (!clean) return 0;
    if (clean.endsWith('k')) {
      const num = parseInt(clean.replace(/k/g, ''), 10);
      return Number.isNaN(num) ? 0 : num * 1000;
    }
    const raw = parseInt(clean, 10);
    if (Number.isNaN(raw)) return 0;
    return raw < 1000 ? raw * 1000 : raw;
  }, [priceStr]);

  const handleSelectDish = (ref: PriceReference) => {
    setSelectedId(ref.id);
    if (QUICK_UNITS.includes(ref.unit)) {
      setSelectedUnit(ref.unit);
    } else if (ref.category === 'fruit' || ref.category === 'vegetable') {
      setSelectedUnit('kg');
    } else if (ref.category === 'drink') {
      setSelectedUnit('cốc');
    } else {
      setSelectedUnit('bát');
    }
  };

  const handleDigitPress = (digit: string) => {
    setPriceStr((prev) => {
      // If it currently ends with 'k', replace or append before 'k'
      const withoutK = prev.endsWith('k') ? prev.slice(0, -1) : prev;
      if (withoutK.length >= 6) return prev;
      const nextDigits = withoutK === '0' ? digit : withoutK + digit;
      return `${nextDigits}k`;
    });
  };

  const handleKPress = () => {
    setPriceStr((prev) => {
      if (!prev) return '10k';
      if (!prev.endsWith('k')) return `${prev}k`;
      return prev;
    });
  };

  const handleBackspace = () => {
    setPriceStr((prev) => {
      const withoutK = prev.endsWith('k') ? prev.slice(0, -1) : prev;
      if (withoutK.length <= 1) return '0k';
      return `${withoutK.slice(0, -1)}k`;
    });
  };

  const handleSubmit = () => {
    const rawVnd = numericVnd > 0 ? numericVnd : selectedRef.median_vnd;
    const converted = convertUnitPrice(rawVnd, selectedUnit, selectedRef.unit);
    onCheckPrice(selectedRef, converted.normalized_vnd, selectedUnit);
  };

  return (
    <div
      data-testid="quick-quote-view"
      className="w-full min-h-full bg-[#F6EFE1] text-[#2A2118] flex flex-col px-4 pt-3.5 pb-5"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to camera"
          className="w-11 h-11 rounded-full bg-white border border-[#E4D9C5] shadow-xs flex items-center justify-center text-[19px] text-[#2A2118] cursor-pointer"
        >
          ←
        </button>

        <h1 className="font-display text-[23px] text-[#2A2118]">
          {lang === 'en' ? 'Quick quote' : 'Nhập giá nhanh'}
        </h1>

        <button
          type="button"
          onClick={onToggleLang}
          aria-label="Toggle language"
          className="w-11 h-11 rounded-full bg-white border border-[#E4D9C5] shadow-xs flex items-center justify-center font-bold text-[14px] text-[#2A2118] cursor-pointer"
        >
          {lang.toUpperCase()}
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-[#FCF9F2] rounded-[16px] px-3.5 h-[46px] flex items-center gap-2.5 border border-[#EBE1CE] mb-3">
        <span className="text-[16px]" aria-hidden="true">🔍</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            lang === 'en' ? 'Search phở, cà phê, xoài...' : 'Tìm phở, cà phê, xoài...'
          }
          aria-label="Search Hanoi items"
          className="w-full bg-transparent text-[15px] text-[#2A2118] placeholder-[#6B5E4E] focus:outline-none"
        />
      </div>

      {/* 4x2 Item Grid matching Screen 7 */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {displayedItems.map((ref) => {
          const isSelected = ref.id === selectedRef.id;
          const displayLabel = ref.id === 'xoai_cat' && !searchQuery ? 'Xoài' : ref.name_vi;
          return (
            <button
              key={ref.id}
              type="button"
              onClick={() => handleSelectDish(ref)}
              className={`rounded-[18px] py-2.5 px-1.5 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#FBF0D4] border-2 border-[#E3A82B] shadow-xs'
                  : 'bg-[#FCF9F2] border border-[#EBE1CE]'
              }`}
            >
              <span className="text-[26px] leading-none mb-1.5">{ref.emoji || '🍜'}</span>
              <span className="font-bold text-[11.5px] leading-tight text-[#2A2118] whitespace-nowrap">
                {displayLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Seller Said Card */}
      <div className="bg-[#FCF9F2] rounded-[20px] p-3.5 border border-[#EBE1CE] mb-3">
        <div className="text-[14px] text-[#6B5E4E] font-medium">
          {lang === 'en' ? 'Seller said for ' : 'Người bán báo giá '}
          <strong className="text-[#2A2118] font-bold">
            {selectedRef.id === 'xoai_cat' && !searchQuery ? 'Xoài' : selectedRef.name_vi}
          </strong>
        </div>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="font-display text-[36px] leading-none text-[#2A2118] tabular-nums">
            {formatShortVnd(numericVnd)}
          </span>
          <span className="text-[16px] text-[#6B5E4E] tabular-nums">
            = {formatDotVnd(numericVnd)} ≈ {formatUsd(numericVnd)}
          </span>
        </div>

        {/* Unit Picker Pills */}
        <div className="flex items-center gap-2 mt-2.5 overflow-x-auto">
          {QUICK_UNITS.map((u) => {
            const active = selectedUnit === u;
            return (
              <button
                key={u}
                type="button"
                onClick={() => setSelectedUnit(u)}
                className={`px-3.5 py-1 rounded-full text-[13.5px] font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#2A2118] text-white'
                    : 'bg-[#EFE4CE] text-[#2A2118] hover:bg-[#E4D6B8]'
                }`}
              >
                {u}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4x3 Numpad matching Screen 7 */}
      <div className="grid grid-cols-3 gap-2.5 mb-3.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigitPress(digit)}
            className="numpad-key h-[48px] font-display text-[23px] flex items-center justify-center cursor-pointer"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          onClick={handleKPress}
          className="h-[48px] rounded-[16px] bg-[#E3A82B] text-[#2A2118] font-display text-[22px] shadow-[0_2px_0_#B9831A] active:translate-y-0.5 flex items-center justify-center cursor-pointer"
        >
          k
        </button>

        <button
          type="button"
          onClick={() => handleDigitPress('0')}
          className="numpad-key h-[48px] font-display text-[23px] flex items-center justify-center cursor-pointer"
        >
          0
        </button>

        <button
          type="button"
          onClick={handleBackspace}
          aria-label="Backspace"
          className="numpad-key h-[48px] text-[#2A2118] flex items-center justify-center cursor-pointer"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <line x1="18" y1="9" x2="12" y2="15" />
            <line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </button>
      </div>

      {/* Primary Action: Check this price */}
      <button
        type="button"
        onClick={handleSubmit}
        className="btn-mustard w-full h-[54px] rounded-[18px] font-bold text-[18px] mt-auto cursor-pointer"
      >
        {lang === 'en' ? 'Check this price' : 'Kiểm tra mức giá này'}
      </button>
    </div>
  );
};
