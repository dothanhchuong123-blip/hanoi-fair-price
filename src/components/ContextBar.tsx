import React, { useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { VENUE_LABELS } from '../agent/context';
import { AreaType, VenueType } from '../agent/types';
import {
  DelegatePreference,
  getDelegatePreference,
  setDelegatePreference,
} from '../lib/liveTracker';
import { Chip } from './ui';

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
export const ContextBar: React.FC<ContextBarProps> = ({
  lang,
  venue,
  area,
  venueGuessed,
  onChange,
  onLocate,
}) => {
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [delegatePref, setDelegatePrefState] = useState<DelegatePreference>(() =>
    getDelegatePreference()
  );
  const venueLabel = VENUE_LABELS[venue];

  const handleCycleDelegate = (next: DelegatePreference) => {
    setDelegatePreference(next);
    setDelegatePrefState(next);
  };

  return (
    <div className="mb-2 rounded-[14px] bg-surface-2 px-3.5 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
      >
        <span className="text-[13px] text-ink-2 min-w-0 truncate flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-ink-2 shrink-0" />
          <span className="font-semibold text-ink">
            {lang === 'en' ? venueLabel.en : venueLabel.vi}
          </span>
          <span className="text-ink-3">·</span>
          <span className="font-semibold text-ink">
            {lang === 'en' ? AREA_LABELS[area].en : AREA_LABELS[area].vi}
          </span>
          {venueGuessed && (
            <span className="text-ink-3">
              {lang === 'en' ? '· auto' : '· tự đoán'}
            </span>
          )}
        </span>
        <span className="text-[13px] font-semibold text-brand shrink-0">
          {open ? (lang === 'en' ? 'Done' : 'Xong') : lang === 'en' ? 'Change' : 'Đổi'}
        </span>
      </button>

      {open && (
        <div className="mt-2.5 pb-1 animate-fade-in">
          <div className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3 mb-1.5">
            {lang === 'en' ? 'Kind of place' : 'Loại quán'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VENUES.map((v) => (
              <Chip
                key={v}
                as="button"
                variant={v === venue ? 'active' : 'default'}
                onClick={() => onChange(v, area)}
                className="bg-surface border border-line"
              >
                {lang === 'en' ? VENUE_LABELS[v].en : VENUE_LABELS[v].vi}
              </Chip>
            ))}
          </div>

          <div className="flex items-center justify-between mt-3 mb-1.5">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3">
              {lang === 'en' ? 'Where' : 'Ở đâu'}
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-label="Toggle AR tracker delegate settings"
              className="text-[11px] text-ink-3 hover:text-ink-2 cursor-pointer"
            >
              {showAdvanced ? 'Hide AR' : 'AR'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(AREA_LABELS) as AreaType[]).map((a) => (
              <Chip
                key={a}
                as="button"
                variant={a === area ? 'active' : 'default'}
                onClick={() => onChange(venue, a)}
                className="bg-surface border border-line"
              >
                {lang === 'en' ? AREA_LABELS[a].en : AREA_LABELS[a].vi}
              </Chip>
            ))}
            <Chip
              as="button"
              variant="brand"
              disabled={locating}
              onClick={async () => {
                setLocating(true);
                await onLocate();
                setLocating(false);
              }}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>
                {locating
                  ? lang === 'en'
                    ? 'Locating…'
                    : 'Đang định vị…'
                  : lang === 'en'
                  ? 'Use my location'
                  : 'Dùng vị trí'}
              </span>
            </Chip>
          </div>

          {showAdvanced && (
            <div className="mt-3 pt-2 border-t border-line flex items-center justify-between gap-2">
              <span className="text-[12px] text-ink-2">
                {lang === 'en' ? 'AR tracker delegate' : 'Bộ xử lý AR'}
              </span>
              <div className="flex items-center gap-1">
                {(['auto', 'CPU', 'GPU'] as DelegatePreference[]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleCycleDelegate(opt)}
                    className={`px-2 py-0.5 rounded-md text-[11.5px] font-semibold cursor-pointer ${
                      delegatePref === opt
                        ? 'bg-ink text-white'
                        : 'bg-surface text-ink-2 border border-line'
                    }`}
                  >
                    {opt === 'auto' ? 'Auto (iOS CPU)' : opt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

