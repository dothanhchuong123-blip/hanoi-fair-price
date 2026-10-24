import React, { useState } from 'react';
import { VENUE_LABELS } from '../agent/context';
import { AreaType, VenueType } from '../agent/types';

interface ContextBarProps {
  lang: 'en' | 'vi';
  venue: VenueType;
  area: AreaType;
  /** True when the venue came from Gemini reading the photo rather than the user */
  venueGuessed: boolean;
  onChange: (venue: VenueType, area: AreaType) => void;
  onLocate: () => Promise<void>;
}

const VENUES: VenueType[] = ['street', 'eatery', 'cafe', 'tourist'];

const AREA_LABELS: Record<AreaType, { en: string; vi: string }> = {
  old_quarter: { en: 'Old Quarter', vi: 'Phố cổ' },
  elsewhere: { en: 'Elsewhere', vi: 'Nơi khác' },
};

/** Lets the user say what kind of place this is and where, which moves the typical ranges. */
export const ContextBar: React.FC<ContextBarProps> = ({ lang, venue, area, venueGuessed, onChange, onLocate }) => {
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const venueLabel = VENUE_LABELS[venue];

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
      active ? 'bg-[#2A2118] text-white border-[#2A2118]' : 'bg-white text-[#4A3F33] border-[#E4D9C5] hover:border-[#B9AD97]'
    }`;

  return (
    <div className="mb-2 rounded-[16px] bg-[#EFE4CE]/70 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
      >
        <span className="text-[13px] text-[#4A3F33] min-w-0 truncate">
          <span className="font-bold">
            {venueLabel.emoji} {lang === 'en' ? venueLabel.en : venueLabel.vi}
          </span>
          <span className="text-[#6B5E4E]"> · </span>
          <span className="font-bold">📍 {lang === 'en' ? AREA_LABELS[area].en : AREA_LABELS[area].vi}</span>
          {venueGuessed && <span className="text-[#6B5E4E]">{lang === 'en' ? ' · guessed' : ' · tự đoán'}</span>}
        </span>
        <span className="text-[13px] font-bold text-[#9E5F10] shrink-0">
          {open ? (lang === 'en' ? 'Done' : 'Xong') : lang === 'en' ? 'Change' : 'Đổi'}
        </span>
      </button>

      {open && (
        <div className="mt-2.5 pb-1 animate-fade-in">
          <div className="text-[12px] font-bold uppercase tracking-wide text-[#6B5E4E] mb-1.5">
            {lang === 'en' ? 'Kind of place' : 'Loại quán'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VENUES.map((v) => (
              <button key={v} type="button" onClick={() => onChange(v, area)} className={chip(v === venue)}>
                {VENUE_LABELS[v].emoji} {lang === 'en' ? VENUE_LABELS[v].en : VENUE_LABELS[v].vi}
              </button>
            ))}
          </div>

          <div className="text-[12px] font-bold uppercase tracking-wide text-[#6B5E4E] mt-3 mb-1.5">
            {lang === 'en' ? 'Where' : 'Ở đâu'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(AREA_LABELS) as AreaType[]).map((a) => (
              <button key={a} type="button" onClick={() => onChange(venue, a)} className={chip(a === area)}>
                {lang === 'en' ? AREA_LABELS[a].en : AREA_LABELS[a].vi}
              </button>
            ))}
            <button
              type="button"
              disabled={locating}
              onClick={async () => {
                setLocating(true);
                await onLocate();
                setLocating(false);
              }}
              className="px-3 py-1.5 rounded-full text-[13px] font-semibold text-[#2F6B4F] border border-[#2F6B4F]/40 bg-[#DCEEE2] cursor-pointer disabled:opacity-60"
            >
              {locating ? (lang === 'en' ? 'Locating…' : 'Đang định vị…') : lang === 'en' ? '📍 Use my location' : '📍 Dùng vị trí'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
