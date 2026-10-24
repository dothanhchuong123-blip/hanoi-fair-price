import React from 'react';

export interface ConfidenceMeterProps {
  /** Confidence value 0..1, or explicit segment count 1..5 */
  confidence: number;
  isSeedOnly?: boolean;
  lang?: 'en' | 'vi';
  className?: string;
}

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({
  confidence,
  isSeedOnly = false,
  lang = 'en',
  className = '',
}) => {
  let filled =
    confidence > 1
      ? Math.round(confidence)
      : confidence >= 0.85
      ? 4
      : confidence >= 0.65
      ? 3
      : 2;

  if (isSeedOnly) {
    filled = Math.min(filled, 4);
  }
  filled = Math.max(1, Math.min(5, filled));

  const label =
    filled >= 4
      ? lang === 'en'
        ? 'High'
        : 'Cao'
      : filled === 3
      ? lang === 'en'
        ? 'Medium'
        : 'Vừa'
      : lang === 'en'
      ? 'Low'
      : 'Thấp';

  return (
    <div
      className={`inline-flex items-center gap-2.5 ${className}`}
      aria-label={`Confidence: ${label} (${filled} of 5)`}
    >
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3, 4].map((idx) => (
          <span
            key={idx}
            className={`w-3.5 h-1.5 rounded-full transition-colors ${
              idx < filled ? 'bg-brand' : 'bg-line'
            }`}
          />
        ))}
      </div>
      <span className="text-[14px] font-bold text-ink">{label}</span>
    </div>
  );
};
