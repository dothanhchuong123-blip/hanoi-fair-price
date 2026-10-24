import React, { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { ConfirmationQuestion } from '../agent/types';
import { MangoSvg } from './SamplePhotos';
import { Button, Sheet } from './ui';

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
  const [selectedRefId, setSelectedRefId] = useState<string | 'none'>(
    question.options[0]?.ref_id || 'none'
  );
  const isMango = question.options.some((o) => o.ref_id.startsWith('xoai'));

  return (
    <Sheet
      data-testid="disambiguation-sheet"
      className="max-h-[72vh] overflow-y-auto overscroll-contain"
    >
      <div className="text-[11.5px] font-bold uppercase tracking-wider text-ink-3">
        {lang === 'en'
          ? `QUICK CHECK${totalQuestions > 1 ? ` · ${questionIndex + 1} OF ${totalQuestions}` : ''}`
          : `KIỂM TRA NHANH${totalQuestions > 1 ? ` · ${questionIndex + 1}/${totalQuestions}` : ''}`}
      </div>

      <h2 className="font-display text-[23px] leading-tight text-ink mt-1">
        {lang === 'en' ? question.prompt_en : question.prompt_vi}
      </h2>
      <p className="text-[14px] leading-snug text-ink-2 mt-1">
        {lang === 'en' ? question.subtitle_en : question.subtitle_vi}
      </p>

      {/* Selectable option cards matching Screenshot 09 */}
      <div className="flex flex-col gap-2.5 mt-4">
        {question.options.map((opt) => {
          const isSelected = selectedRefId === opt.ref_id;
          return (
            <button
              key={opt.ref_id}
              type="button"
              onClick={() => setSelectedRefId(opt.ref_id)}
              onDoubleClick={() => onAnswer(opt.ref_id)}
              aria-pressed={isSelected}
              className={`w-full text-left rounded-[18px] p-3 flex items-center gap-3 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-surface border-2 border-brand shadow-2xs'
                  : 'bg-surface border border-line hover:border-ink-3'
              }`}
            >
              <div className="w-[46px] h-[46px] rounded-[12px] bg-surface-2 flex items-center justify-center shrink-0">
                {isMango ? (
                  <MangoSvg className="w-[30px] h-[30px]" />
                ) : (
                  <span className="text-[24px]">{opt.emoji}</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-bold text-[16.5px] leading-snug text-ink">
                  {opt.name_vi}
                </div>
                <div className="text-[13px] leading-snug text-ink-2 truncate">
                  {lang === 'en'
                    ? `${opt.name_en} · ${opt.description_en.toLowerCase()}`
                    : opt.description_vi}
                </div>
              </div>

              <div
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-brand text-white'
                    : 'border-[1.5px] border-grabber bg-transparent'
                }`}
              >
                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </button>
          );
        })}

        {/* "None of these" option card matching Screenshot 09 */}
        <button
          type="button"
          onClick={() => setSelectedRefId('none')}
          aria-pressed={selectedRefId === 'none'}
          className={`w-full text-left rounded-[18px] p-3 flex items-center gap-3 transition-all cursor-pointer ${
            selectedRefId === 'none'
              ? 'bg-surface border-2 border-brand shadow-2xs'
              : 'bg-surface border border-line hover:border-ink-3'
          }`}
        >
          <div className="w-[46px] h-[46px] rounded-[12px] bg-surface-2 flex items-center justify-center shrink-0">
            <Pencil className="w-5 h-5 text-ink" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="font-bold text-[16.5px] leading-snug text-ink">
              {lang === 'en' ? 'None of these' : 'Không phải các loại trên'}
            </div>
            <div className="text-[13px] leading-snug text-ink-2">
              {lang === 'en' ? 'Type what you see' : 'Bỏ qua món này'}
            </div>
          </div>

          <div
            className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 transition-colors ${
              selectedRefId === 'none'
                ? 'bg-brand text-white'
                : 'border-[1.5px] border-grabber bg-transparent'
            }`}
          >
            {selectedRefId === 'none' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
          </div>
        </button>
      </div>

      {/* Primary Confirm Button + Secondary Skip Link */}
      <div className="mt-4 flex flex-col items-center gap-1.5">
        <Button
          variant="primary"
          size="md"
          onClick={() => onAnswer(selectedRefId)}
          className="w-full"
        >
          {lang === 'en' ? 'Confirm' : 'Xác nhận'}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAnswer('none')}
          className="w-full"
        >
          {lang === 'en' ? 'Skip — mark as unsure' : 'Bỏ qua — đánh dấu chưa rõ'}
        </Button>
      </div>
    </Sheet>
  );
};
