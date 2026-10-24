import React from 'react';
import { PipelineProgressEvent, PipelineStepId } from '../agent/types';

interface AgentWorkingSheetProps {
  lang: 'en' | 'vi';
  sampleType: 'menu' | 'stall' | 'upload';
  progress: PipelineProgressEvent | null;
}

const STEP_META: Record<
  PipelineStepId,
  { emoji: string; labelEn: string; labelVi: string }
> = {
  perceive: {
    emoji: '👀',
    labelEn: 'Reading prices',
    labelVi: 'Đọc bảng giá',
  },
  normalize: {
    emoji: '🔎',
    labelEn: 'Matching dishes',
    labelVi: 'Đối chiếu món',
  },
  lookup: {
    emoji: '📚',
    labelEn: 'Checking typical prices',
    labelVi: 'Tra cứu giá chuẩn',
  },
  judge: {
    emoji: '⚖️',
    labelEn: 'Judging each price',
    labelVi: 'Đánh giá từng mức giá',
  },
  respond: {
    emoji: '💬',
    labelEn: 'Writing tips & phrases',
    labelVi: 'Tạo mẹo & câu giao tiếp',
  },
};

export const AgentWorkingSheet: React.FC<AgentWorkingSheetProps> = ({
  lang,
  sampleType,
  progress,
}) => {
  const count = progress?.itemCount;
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, []);

  const title =
    lang === 'en'
      ? sampleType === 'stall'
        ? 'Reading the stall...'
        : 'Reading the menu...'
      : sampleType === 'stall'
      ? 'Đang đọc quầy hàng...'
      : 'Đang đọc thực đơn...';

  const subtitle =
    count === undefined
      ? lang === 'en'
        ? `Usually 5–10 seconds · ${elapsed}s`
        : `Thường mất 5–10 giây · ${elapsed}s`
      : lang === 'en'
      ? `${count} ${count === 1 ? 'item' : 'items'} found · ${elapsed}s`
      : `Tìm thấy ${count} món · ${elapsed}s`;

  const steps = progress?.steps || [
    { step: 'perceive' as PipelineStepId, status: 'active' as const },
    { step: 'normalize' as PipelineStepId, status: 'pending' as const },
    { step: 'lookup' as PipelineStepId, status: 'pending' as const },
    { step: 'judge' as PipelineStepId, status: 'pending' as const },
    { step: 'respond' as PipelineStepId, status: 'pending' as const },
  ];

  return (
    <div
      data-testid="agent-working-sheet"
      className="w-full bg-[#F6EFE1] rounded-t-[28px] pt-3 pb-5 px-6 shadow-[0_-10px_35px_rgba(0,0,0,0.35)] z-30 animate-sheet-up"
    >
      {/* Grab handle */}
      <div className="w-11 h-1.5 rounded-full bg-[#CFC4B0] mx-auto mb-4" />

      <h2 className="font-display text-[26px] leading-tight text-[#2A2118]">
        {title}
      </h2>
      <p className="text-[14.5px] text-[#6B5E4E] mt-0.5 mb-4">
        {subtitle}
      </p>

      {/* Pipeline Steps List */}
      <div className="flex flex-col gap-1.5">
        {steps.map((s: { step: PipelineStepId; status: string; summary_en?: string; summary_vi?: string }) => {
          const meta = STEP_META[s.step];
          const isActive = s.status === 'active';
          const isDone = s.status === 'done';
          const isPending = s.status === 'pending';

          return (
            <div
              key={s.step}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-[16px] transition-all duration-200 ${
                isActive
                  ? 'bg-white shadow-sm scale-[1.01]'
                  : 'bg-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`text-[19px] ${isPending ? 'opacity-35 grayscale' : ''}`}>
                  {meta.emoji}
                </span>
                <span
                  className={`text-[16px] font-bold ${
                    isPending ? 'text-[#2A2118]/35' : 'text-[#2A2118]'
                  }`}
                >
                  {lang === 'en' ? meta.labelEn : meta.labelVi}
                </span>
              </div>

              {/* Right indicator */}
              {isDone && (
                <span className="text-[14px] font-bold text-[#2F6B4F] flex items-center gap-1 whitespace-nowrap">
                  <span>✓</span>
                  <span>{lang === 'en' ? s.summary_en : s.summary_vi}</span>
                </span>
              )}

              {isActive && (
                <span
                  className="w-5 h-5 rounded-full border-[2.5px] border-[#EFE4CE] border-t-[#D69B27] animate-spin"
                  aria-label="In progress"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Footer matching Screen 2 */}
      <p className="text-center text-[12.5px] text-[#6B5E4E] mt-4">
        {lang === 'en'
          ? 'Gemini reads the photo · prices are checked on this phone'
          : 'Gemini đọc ảnh · giá được kiểm tra ngay trên máy'}
      </p>
    </div>
  );
};
