import React from 'react';
import { VerdictLabel } from '../../agent/types';
import { formatShortVnd } from '../../lib/parsePrice';
import { VERDICT_META } from './VerdictBadge';

export interface RangeBarProps {
  low: number;
  median: number;
  high: number;
  quoted: number | null;
  verdict: VerdictLabel;
  size?: 'mini' | 'full';
  lang?: 'en' | 'vi';
  className?: string;
}

function roundNiceVnd(vnd: number, refHigh: number): number {
  if (refHigh >= 50000) return Math.max(10000, Math.round(vnd / 10000) * 10000);
  if (vnd <= 10000) return Math.max(1000, Math.round(vnd / 1000) * 1000);
  return Math.round(vnd / 5000) * 5000;
}

export const RangeBar: React.FC<RangeBarProps> = ({
  low,
  median,
  high,
  quoted,
  verdict,
  size = 'full',
  lang = 'en',
  className = '',
}) => {
  const rawMin = low * 0.65;
  const rawMax = Math.max(high, quoted ?? high) * 1.18;
  const minTrack = roundNiceVnd(rawMin, high);
  const maxTrack = Math.max(minTrack + 10000, roundNiceVnd(rawMax, high));

  const pct = (val: number) =>
    Math.max(2, Math.min(98, ((val - minTrack) / (maxTrack - minTrack)) * 100));

  const lowPct = pct(low);
  const highPct = pct(high);
  const medianPct = pct(median);
  const quotedPct = quoted !== null ? Math.max(4, Math.min(96, pct(quoted))) : null;

  const dotColor = VERDICT_META[verdict].dot;
  const isMini = size === 'mini';

  return (
    <div className={`w-full select-none ${className}`} data-testid={`range-bar-${size}`}>
      {/* Track & Markers */}
      <div className={`relative w-full flex items-center ${isMini ? 'h-3.5' : 'h-6'}`}>
        {/* Base neutral track */}
        <div
          className={`w-full rounded-full bg-surface-2 relative overflow-visible ${
            isMini ? 'h-[6px]' : 'h-[8px]'
          }`}
        >
          {/* Typical low..high soft green band */}
          <div
            className="absolute top-0 bottom-0 rounded-full"
            style={{
              left: `${lowPct}%`,
              width: `${Math.max(4, highPct - lowPct)}%`,
              backgroundColor: 'rgba(31, 138, 91, 0.34)',
            }}
          />

          {/* Median green tick */}
          {!isMini && (
            <div
              className="absolute -top-1 -bottom-1 w-[2px] rounded-full bg-fair"
              style={{ left: `${medianPct}%` }}
            />
          )}
        </div>

        {/* Quoted price dot with white ring */}
        {quotedPct !== null && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-sm flex items-center justify-center transition-all duration-200 ${
              isMini ? 'w-3.5 h-3.5 p-[2px]' : 'w-[22px] h-[22px] p-[3px] shadow-md'
            }`}
            style={{ left: `${quotedPct}%` }}
          >
            <span
              className="w-full h-full rounded-full block"
              style={{ backgroundColor: dotColor }}
            />
          </div>
        )}
      </div>

      {/* Labels under the bar for full size */}
      {!isMini && (
        <div className="flex items-center justify-between text-[12.5px] font-medium text-ink-3 mt-1.5 tabular-nums">
          <span>{formatShortVnd(minTrack)}</span>
          <span>
            {lang === 'en' ? 'typical' : 'phổ biến'} {formatShortVnd(low).replace(/k$/, '')}–{formatShortVnd(high)}
          </span>
          <span>{formatShortVnd(maxTrack)}</span>
        </div>
      )}
    </div>
  );
};
