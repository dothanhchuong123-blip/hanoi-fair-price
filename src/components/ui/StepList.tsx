import React from 'react';
import { Check } from 'lucide-react';

export interface StepItem {
  id: string;
  status: 'done' | 'active' | 'pending';
  title: string;
  subline?: string;
  timing?: string;
}

export interface StepListProps {
  steps: StepItem[];
  className?: string;
}

export const StepList: React.FC<StepListProps> = ({ steps, className = '' }) => {
  return (
    <div className={`flex flex-col ${className}`}>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const isDone = step.status === 'done';
        const isActive = step.status === 'active';
        const isPending = step.status === 'pending';

        return (
          <div key={step.id} className="relative flex items-start gap-3 pb-3 last:pb-0">
            {/* Vertical connector line */}
            {!isLast && (
              <div
                aria-hidden="true"
                className="absolute left-[15px] top-8 bottom-0 w-[1.5px] bg-line"
              />
            )}

            {/* Status Circle */}
            {isDone && (
              <div className="w-8 h-8 rounded-full bg-fair-soft text-fair flex items-center justify-center shrink-0 z-10">
                <Check className="w-4 h-4 stroke-[2.75]" />
              </div>
            )}

            {isActive && (
              <div className="w-8 h-8 rounded-full bg-brand text-white ring-4 ring-brand/15 font-bold text-[13.5px] flex items-center justify-center shrink-0 z-10 tabular-nums">
                {idx + 1}
              </div>
            )}

            {isPending && (
              <div className="w-8 h-8 rounded-full bg-surface-2 text-ink-2 font-bold text-[13.5px] flex items-center justify-center shrink-0 z-10 tabular-nums">
                {idx + 1}
              </div>
            )}

            {/* Title & Subline */}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <div
                  className={`text-[16px] font-bold leading-snug ${
                    isPending ? 'text-ink-3' : 'text-ink'
                  }`}
                >
                  {step.title}
                </div>
                {step.timing && (
                  <span className="font-mono text-[13px] text-ink-2 shrink-0 tabular-nums">
                    {step.timing}
                  </span>
                )}
              </div>
              {step.subline && (
                <div className="text-[13px] text-ink-2 leading-snug mt-0.5">
                  {step.subline}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
