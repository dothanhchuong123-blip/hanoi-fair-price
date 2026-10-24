import React from 'react';
import { ConfirmationQuestion } from '../agent/types';
import { MangoSvg } from './SamplePhotos';

interface DisambiguationSheetProps {
  lang: 'en' | 'vi';
  question: ConfirmationQuestion;
  questionIndex: number;
  totalQuestions: number;
  onAnswer: (refId: string | 'none') => void;
}

export const DisambiguationSheet: React.FC<DisambiguationSheetProps> = ({
  lang,
  question,
  questionIndex,
  totalQuestions,
  onAnswer,
}) => {
  const isMango = question.options.some((o) => o.ref_id.startsWith('xoai'));

  return (
    <div
      data-testid="disambiguation-sheet"
      className="w-full bg-[#F6EFE1] rounded-t-[28px] pt-3 pb-5 px-5 shadow-[0_-10px_35px_rgba(0,0,0,0.35)] z-30 animate-sheet-up max-h-[70vh] overflow-y-auto overscroll-contain"
    >
      {/* Grab handle */}
      <div className="w-11 h-1.5 rounded-full bg-[#CFC4B0] mx-auto mb-3" />

      <div className="inline-flex items-center gap-1.5 bg-[#FBF0D4] text-[#9E5F10] text-[12.5px] font-bold px-3 py-1 rounded-full">
        <span>🤔</span>
        <span>
          {lang === 'en'
            ? `Quick question${totalQuestions > 1 ? ` · ${questionIndex + 1} of ${totalQuestions}` : ''}`
            : `Câu hỏi nhanh${totalQuestions > 1 ? ` · ${questionIndex + 1}/${totalQuestions}` : ''}`}
        </span>
      </div>

      <h2 className="font-display text-[23px] leading-[1.15] text-[#2A2118] mt-2">
        {lang === 'en' ? question.prompt_en : question.prompt_vi}
      </h2>
      <p className="text-[14px] leading-snug text-[#6B5E4E] mt-1">
        {lang === 'en' ? question.subtitle_en : question.subtitle_vi}
      </p>

      {/* One row per option: fits any number of options and long names */}
      <div className="flex flex-col gap-2.5 mt-3.5">
        {question.options.map((opt, idx) => (
          <button
            key={opt.ref_id}
            type="button"
            onClick={() => onAnswer(opt.ref_id)}
            style={{ animationDelay: `${60 + idx * 60}ms` }}
            className="animate-sheet-up w-full text-left bg-white rounded-[20px] p-2.5 pr-3.5 flex items-center gap-3 border-[1.5px] border-[#E3D8C4] hover:border-[#E3A82B] active:scale-[0.98] transition-all cursor-pointer"
          >
            <div
              className="w-[60px] h-[60px] rounded-[15px] flex items-center justify-center shrink-0"
              style={{ backgroundColor: opt.bg_tint }}
            >
              {isMango ? <MangoSvg className="w-[42px] h-[42px]" /> : <span className="text-[30px]">{opt.emoji}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[18px] leading-tight text-[#2A2118]">{opt.name_vi}</div>
              <div className="text-[13px] leading-snug text-[#6B5E4E] line-clamp-2">
                {lang === 'en' ? opt.description_en : opt.description_vi}
              </div>
            </div>
            <div className="text-[12.5px] font-bold text-[#2F6B4F] bg-[#DCEEE2] rounded-full px-2.5 py-1 shrink-0 tabular-nums">
              {opt.typical_range_text.replace(/^Typical /, '')}
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onAnswer('none')}
        className="btn-paper w-full h-[50px] rounded-[18px] font-bold text-[15.5px] text-[#2A2118] mt-3 cursor-pointer"
      >
        {lang === 'en' ? 'None of these · skip' : 'Không phải · bỏ qua'}
      </button>
    </div>
  );
};
