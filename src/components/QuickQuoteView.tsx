import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Delete, Search, X } from 'lucide-react';
import { getAllReferences } from '../agent/lookup';
import { PriceReference } from '../agent/types';
import { formatDotVnd, formatShortVnd, formatUsd } from '../lib/parsePrice';
import { convertToReferenceUnit, getUnit, perUnit, unitsForReference } from '../lib/units';
import { Button, IconButton } from './ui';

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

/** Strip Vietnamese diacritics so "pho" finds "Phở" */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

export const QuickQuoteView: React.FC<QuickQuoteViewProps> = ({
  lang,
  initialRefId = 'pho_bo',
  initialPriceK = '',
  onToggleLang,
  onBack,
  onCheckPrice,
}) => {
  const catalog = useMemo(() => getAllReferences(), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState(initialRefId);
  // Thousands of đồng the seller said, e.g. "80" means 80k
  const [digits, setDigits] = useState(initialPriceK.replace(/\D/g, ''));

  const selectedRef = useMemo(
    () => catalog.find((r) => r.id === selectedId) || catalog[0],
    [catalog, selectedId]
  );
  const unitOptions = useMemo(() => unitsForReference(selectedRef), [selectedRef]);
  const [selectedUnit, setSelectedUnit] = useState<string>(() => getUnit(selectedRef.unit).id);

  const displayedItems = useMemo(() => {
    const q = fold(searchQuery.trim());
    if (!q) {
      return FEATURED_IDS.map((id) => catalog.find((r) => r.id === id)).filter(
        Boolean
      ) as PriceReference[];
    }
    return catalog
      .filter(
        (r) =>
          fold(r.name_vi).includes(q) ||
          fold(r.name_en).includes(q) ||
          r.aliases.some((a) => fold(a).includes(q))
      )
      .slice(0, 12);
  }, [catalog, searchQuery]);

  const quotedVnd = (parseInt(digits || '0', 10) || 0) * 1000;
  const unitInfo = getUnit(selectedUnit);
  const primaryName = (r: PriceReference) => (lang === 'en' ? r.name_en : r.name_vi);
  const secondaryName = (r: PriceReference) => (lang === 'en' ? r.name_vi : r.name_en);

  const handleSelectDish = (ref: PriceReference) => {
    setSelectedId(ref.id);
    setSelectedUnit(getUnit(ref.unit).id);
  };

  const pushDigits = (more: string) =>
    setDigits((prev) => {
      const next = (prev === '0' ? '' : prev) + more;
      return next.length > 5 ? prev : next.replace(/^0+(?=\d)/, '');
    });

  const handleSubmit = () => {
    if (quotedVnd <= 0) return;
    const converted = convertToReferenceUnit(quotedVnd, selectedUnit, selectedRef.unit) ?? quotedVnd;
    onCheckPrice(selectedRef, converted, selectedUnit);
  };

  // On a laptop the keyboard types the price too, unless the search box has focus
  const submitRef = useRef(handleSubmit);
  submitRef.current = handleSubmit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (/^\d$/.test(e.key)) pushDigits(e.key);
      else if (e.key === 'Backspace') setDigits((p) => p.slice(0, -1));
      else if (e.key === 'Enter') submitRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const keyClass =
    'h-[54px] rounded-[16px] bg-surface border border-line text-ink font-semibold text-[21px] flex items-center justify-center hover:bg-surface-2 active:scale-[0.97] transition-all cursor-pointer tabular-nums select-none';

  return (
    <div
      data-testid="quick-quote-view"
      className="w-full min-h-full bg-bg text-ink flex flex-col px-4 pt-3.5 pb-5"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <IconButton variant="default" onClick={onBack} aria-label="Back to camera">
          <ChevronLeft className="w-5 h-5 text-ink" />
        </IconButton>

        <div className="text-center">
          <h1 className="font-serif text-[24px] leading-none text-ink">
            {lang === 'en' ? 'Check a price' : 'Kiểm tra giá'}
          </h1>
          <p className="text-[12.5px] text-ink-2 mt-1">
            {lang === 'en' ? 'What did the seller say?' : 'Người bán báo bao nhiêu?'}
          </p>
        </div>

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
      <div className="bg-surface rounded-[16px] px-3.5 h-[48px] flex items-center gap-2.5 border border-line mb-3 focus-within:border-ink/40 transition-colors">
        <Search className="w-4 h-4 text-ink-3 shrink-0" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            lang === 'en' ? 'Search pho, banh mi, mango…' : 'Tìm phở, bánh mì, xoài…'
          }
          aria-label="Search Hanoi items"
          className="w-full bg-transparent text-[15px] text-ink placeholder-ink-3 focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="p-1 text-ink-3 hover:text-ink cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dish grid */}
      {displayedItems.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-line p-5 text-center text-[14px] text-ink-2 mb-3">
          {lang === 'en'
            ? 'No dish matches that. Try “pho”, “coffee” or “mango”.'
            : 'Không tìm thấy món. Thử “phở”, “cà phê” hoặc “xoài”.'}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {displayedItems.map((ref) => {
            const isSelected = ref.id === selectedRef.id;
            return (
              <button
                key={ref.id}
                type="button"
                onClick={() => handleSelectDish(ref)}
                aria-pressed={isSelected}
                className={`rounded-[18px] pt-2.5 pb-2 px-1 flex flex-col items-center justify-start text-center transition-all cursor-pointer min-h-[92px] ${
                  isSelected
                    ? 'bg-brand-soft ring-2 ring-brand'
                    : 'bg-surface border border-line hover:bg-surface-2'
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-[22px] leading-none mb-1.5 ${
                    isSelected ? 'bg-white' : 'bg-surface-2'
                  }`}
                  aria-hidden="true"
                >
                  {ref.emoji || '🍜'}
                </span>
                <span className="font-semibold text-[11.5px] leading-tight text-ink line-clamp-2">
                  {ref.id === 'xoai_cat' && !searchQuery
                    ? lang === 'en'
                      ? 'Mango'
                      : 'Xoài'
                    : primaryName(ref)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Price card */}
      <div className="bg-surface rounded-[22px] p-4 border border-line mb-3 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[13px] text-ink-2 font-medium min-w-0 truncate">
            {lang === 'en' ? 'Seller said for ' : 'Giá báo cho '}
            <strong className="text-ink font-semibold">{primaryName(selectedRef)}</strong>
            <span className="text-ink-3"> · {secondaryName(selectedRef)}</span>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mt-1.5">
          <span
            data-testid="quick-quote-amount"
            className={`font-serif text-[44px] leading-none tabular-nums ${
              quotedVnd > 0 ? 'text-ink' : 'text-ink-3'
            }`}
          >
            {quotedVnd > 0 ? formatShortVnd(quotedVnd) : '0k'}
          </span>
          <span className="text-[16px] font-semibold text-ink-2">
            {perUnit(selectedUnit, lang)}
          </span>
        </div>
        <div className="text-[13.5px] text-ink-3 mt-1 tabular-nums">
          {quotedVnd > 0
            ? `= ${formatDotVnd(quotedVnd)} ≈ ${formatUsd(quotedVnd)}`
            : lang === 'en'
            ? 'Type the price below, in thousands of đồng'
            : 'Nhập giá bên dưới, đơn vị nghìn đồng'}
        </div>

        {/* Unit picker: only units that make sense for this dish */}
        {unitOptions.length > 1 ? (
          <div
            role="radiogroup"
            aria-label={lang === 'en' ? 'Unit' : 'Đơn vị'}
            className="mt-3 inline-flex p-1 rounded-full bg-surface-2"
          >
            {unitOptions.map((u) => {
              const info = getUnit(u);
              const active = selectedUnit === u;
              return (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedUnit(u)}
                  className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-all cursor-pointer ${
                    active ? 'bg-ink text-white shadow-sm' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {lang === 'en' ? info.perEn : info.perVi}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 text-[12.5px] font-semibold text-ink-2">
            {lang === 'en'
              ? `Sold ${unitInfo.perEn} · ${unitInfo.vi}`
              : `Bán theo ${unitInfo.vi} · ${unitInfo.en.toLowerCase()}`}
          </div>
        )}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => pushDigits(d)} className={keyClass}>
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => pushDigits('00')}
          className={`${keyClass} text-[17px] text-ink-2`}
        >
          00
        </button>
        <button type="button" onClick={() => pushDigits('0')} className={keyClass}>
          0
        </button>
        <button
          type="button"
          onClick={() => setDigits((p) => p.slice(0, -1))}
          aria-label="Backspace"
          className={keyClass}
        >
          <Delete className="w-5 h-5 text-ink" />
        </button>
      </div>

      <Button
        variant="brand"
        size="md"
        onClick={handleSubmit}
        disabled={quotedVnd <= 0}
        className="w-full mt-auto"
      >
        {lang === 'en' ? 'Check this price' : 'Kiểm tra mức giá này'}
      </Button>
    </div>
  );
};
