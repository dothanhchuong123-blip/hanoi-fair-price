import React, { useMemo, useState } from 'react';
import { ChevronLeft, Delete, Search } from 'lucide-react';
import { getAllReferences } from '../agent/lookup';
import { PriceReference } from '../agent/types';
import { convertUnitPrice, formatDotVnd, formatShortVnd, formatUsd } from '../lib/parsePrice';
import { Button, Chip, IconButton } from './ui';

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
      className="w-full min-h-full bg-bg text-ink flex flex-col px-4 pt-3.5 pb-5"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-3">
        <IconButton
          variant="default"
          onClick={onBack}
          aria-label="Back to camera"
        >
          <ChevronLeft className="w-5 h-5 text-ink" />
        </IconButton>

        <h1 className="font-display text-[21px] text-ink">
          {lang === 'en' ? 'Quick quote' : 'Nhập giá nhanh'}
        </h1>

        <IconButton
          variant="default"
          onClick={onToggleLang}
          aria-label="Toggle language"
          className="font-bold text-[13px]"
        >
          {lang.toUpperCase()}
        </IconButton>
      </div>

      {/* Search Bar */}
      <div className="bg-surface rounded-[14px] px-3.5 h-[44px] flex items-center gap-2.5 border border-line mb-3">
        <Search className="w-4 h-4 text-ink-3 shrink-0" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            lang === 'en' ? 'Search phở, cà phê, xoài...' : 'Tìm phở, cà phê, xoài...'
          }
          aria-label="Search Hanoi items"
          className="w-full bg-transparent text-[15px] text-ink placeholder-ink-3 focus:outline-none"
        />
      </div>

      {/* 4x2 Item Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {displayedItems.map((ref) => {
          const isSelected = ref.id === selectedRef.id;
          const displayLabel = ref.id === 'xoai_cat' && !searchQuery ? 'Xoài' : ref.name_vi;
          return (
            <button
              key={ref.id}
              type="button"
              onClick={() => handleSelectDish(ref)}
              className={`rounded-[16px] py-2.5 px-1.5 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                isSelected
                  ? 'bg-brand-soft border-2 border-brand shadow-2xs'
                  : 'bg-surface border border-line hover:bg-surface-2'
              }`}
            >
              <span className="text-[24px] leading-none mb-1.5">{ref.emoji || '🍜'}</span>
              <span className="font-bold text-[11.5px] leading-tight text-ink whitespace-nowrap">
                {displayLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Seller Said Card */}
      <div className="bg-surface rounded-[20px] p-3.5 border border-line mb-3">
        <div className="text-[13.5px] text-ink-2 font-medium">
          {lang === 'en' ? 'Seller said for ' : 'Người bán báo giá '}
          <strong className="text-ink font-bold">
            {selectedRef.id === 'xoai_cat' && !searchQuery ? 'Xoài' : selectedRef.name_vi}
          </strong>
        </div>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="font-display text-[34px] leading-none text-ink tabular-nums">
            {formatShortVnd(numericVnd)}
          </span>
          <span className="text-[15px] text-ink-2 tabular-nums">
            = {formatDotVnd(numericVnd)} ≈ {formatUsd(numericVnd)}
          </span>
        </div>

        {/* Unit Picker Pills */}
        <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
          {QUICK_UNITS.map((u) => {
            const active = selectedUnit === u;
            return (
              <Chip
                key={u}
                as="button"
                variant={active ? 'active' : 'default'}
                onClick={() => setSelectedUnit(u)}
              >
                {u}
              </Chip>
            );
          })}
        </div>
      </div>

      {/* 4x3 Numpad */}
      <div className="grid grid-cols-3 gap-2 mb-3.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigitPress(digit)}
            className="h-[48px] rounded-[14px] bg-surface border border-line text-ink font-bold text-[20px] flex items-center justify-center hover:bg-surface-2 active:scale-[0.98] transition-all cursor-pointer tabular-nums"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          onClick={handleKPress}
          className="h-[48px] rounded-[14px] bg-surface-2 text-ink font-bold text-[19px] flex items-center justify-center hover:bg-surface-3 active:scale-[0.98] transition-all cursor-pointer"
        >
          k
        </button>

        <button
          type="button"
          onClick={() => handleDigitPress('0')}
          className="h-[48px] rounded-[14px] bg-surface border border-line text-ink font-bold text-[20px] flex items-center justify-center hover:bg-surface-2 active:scale-[0.98] transition-all cursor-pointer tabular-nums"
        >
          0
        </button>

        <button
          type="button"
          onClick={handleBackspace}
          aria-label="Backspace"
          className="h-[48px] rounded-[14px] bg-surface border border-line text-ink flex items-center justify-center hover:bg-surface-2 active:scale-[0.98] transition-all cursor-pointer"
        >
          <Delete className="w-5 h-5 text-ink" />
        </button>
      </div>

      {/* Primary Action: Check this price */}
      <Button
        variant="primary"
        size="md"
        onClick={handleSubmit}
        className="w-full mt-auto"
      >
        {lang === 'en' ? 'Check this price' : 'Kiểm tra mức giá này'}
      </Button>
    </div>
  );
};
