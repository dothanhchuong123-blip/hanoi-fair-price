import React from 'react';
import { VerdictLabel } from '../../agent/types';

export interface VerdictBadgeProps {
  verdict: VerdictLabel;
  lang?: 'en' | 'vi';
  count?: number;
  shortLabel?: boolean;
  showDot?: boolean;
  className?: string;
}

export const VERDICT_META: Record<
  VerdictLabel,
  {
    dot: string;
    bg: string;
    text: string;
    border: string;
    tint: string;
    labelEn: string;
    labelVi: string;
    shortEn: string;
    shortVi: string;
  }
> = {
  fair: {
    dot: '#16A36A',
    bg: '#DCFCE7',
    text: '#117A4F',
    border: '#16A36A',
    tint: 'rgba(22, 163, 106, 0.10)',
    labelEn: 'Fair',
    labelVi: 'Hợp lý',
    shortEn: 'fair',
    shortVi: 'hợp lý',
  },
  slightly_high: {
    dot: '#E08A00',
    bg: '#FEF0D6',
    text: '#A86400',
    border: '#E08A00',
    tint: 'rgba(224, 138, 0, 0.10)',
    labelEn: 'A bit high',
    labelVi: 'Hơi cao',
    shortEn: 'a bit high',
    shortVi: 'hơi cao',
  },
  overpriced: {
    dot: '#E5484D',
    bg: '#FFE5E6',
    text: '#C8232C',
    border: '#E5484D',
    tint: 'rgba(229, 72, 77, 0.10)',
    labelEn: 'Above typical',
    labelVi: 'Cao hơn thường lệ',
    shortEn: 'high',
    shortVi: 'cao',
  },
  unknown: {
    dot: '#7C7C86',
    bg: '#ECEDF0',
    text: '#4A4A52',
    border: '#7C7C86',
    tint: 'rgba(124, 124, 134, 0.10)',
    labelEn: 'Unsure',
    labelVi: 'Chưa rõ',
    shortEn: 'unsure',
    shortVi: 'chưa rõ',
  },
};

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({
  verdict,
  lang = 'en',
  count,
  shortLabel = false,
  showDot,
  className = '',
}) => {
  const meta = VERDICT_META[verdict];
  const label = shortLabel
    ? lang === 'en'
      ? meta.shortEn
      : meta.shortVi
    : lang === 'en'
    ? meta.labelEn
    : meta.labelVi;

  const displayDot = showDot !== undefined ? showDot : !(shortLabel && verdict === 'unknown');

  return (
    <span
      style={{ backgroundColor: meta.bg, color: meta.text }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12.5px] font-bold whitespace-nowrap shrink-0 tabular-nums ${className}`}
    >
      {displayDot && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: meta.dot }}
        />
      )}
      <span>
        {count !== undefined ? `${count} ${label}` : label}
      </span>
    </span>
  );
};
