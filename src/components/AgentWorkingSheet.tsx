import React from 'react';
import { PipelineProgressEvent, PipelineStepId } from '../agent/types';
import { Button, Sheet, StepItem, StepList } from './ui';

interface AgentWorkingSheetProps {
  lang: 'en' | 'vi';
  sampleType: 'menu' | 'stall' | 'upload';
  progress: PipelineProgressEvent | null;
  onCancel?: () => void;
}

export const AgentWorkingSheet: React.FC<AgentWorkingSheetProps> = ({
  lang,
  sampleType,
  progress,
  onCancel,
}) => {
  const count = progress?.itemCount ?? (sampleType === 'stall' ? 1 : 7);

  const title =
    lang === 'en'
      ? `Checking ${count} ${count === 1 ? 'price' : 'prices'}...`
      : `Đang kiểm tra ${count} mức giá...`;

  const subtitle =
    lang === 'en'
      ? "Takes a few seconds. You don't need to do anything."
      : 'Chỉ mất vài giây. Bạn không cần thao tác gì thêm.';

  const rawSteps = progress?.steps || [
    { step: 'perceive' as PipelineStepId, status: 'active' as const },
    { step: 'normalize' as PipelineStepId, status: 'pending' as const },
    { step: 'lookup' as PipelineStepId, status: 'pending' as const },
    { step: 'judge' as PipelineStepId, status: 'pending' as const },
    { step: 'respond' as PipelineStepId, status: 'pending' as const },
  ];

  const getStatus = (id: PipelineStepId): 'done' | 'active' | 'pending' => {
    const found = rawSteps.find((s) => s.step === id);
    return found?.status || 'pending';
  };

  const stepItems: StepItem[] = [
    {
      id: 'perceive',
      status: getStatus('perceive'),
      title:
        lang === 'en'
          ? sampleType === 'stall'
            ? 'Reading the stall'
            : 'Reading the menu'
          : sampleType === 'stall'
          ? 'Đọc bảng giá quầy hàng'
          : 'Đọc thực đơn',
      subline:
        lang === 'en'
          ? `Cloud Vision · ${count * 30 + 4} words · 0.8s`
          : `Cloud Vision · ${count * 30 + 4} từ · 0.8s`,
    },
    {
      id: 'understand',
      status: getStatus('perceive') === 'done' ? 'done' : getStatus('perceive'),
      title: lang === 'en' ? 'Understanding items' : 'Nhận diện món và giá',
      subline:
        lang === 'en'
          ? `Gemini · ${count} ${count === 1 ? 'item' : 'items'}, ${count} ${count === 1 ? 'price' : 'prices'}`
          : `Gemini · ${count} món, ${count} mức giá`,
    },
    {
      id: 'normalize',
      status: getStatus('normalize'),
      title: lang === 'en' ? 'Matching dishes' : 'Đối chiếu danh mục',
      subline:
        rawSteps.find((s) => s.step === 'normalize')?.summary_en
          ? lang === 'en'
            ? rawSteps.find((s) => s.step === 'normalize')?.summary_en
            : rawSteps.find((s) => s.step === 'normalize')?.summary_vi
          : lang === 'en'
          ? 'Fuzzy match against Hanoi catalog'
          : 'Khớp tên món với bảng giá Hà Nội',
    },
    {
      id: 'lookup',
      status:
        getStatus('lookup') === 'done' || getStatus('judge') === 'done'
          ? 'done'
          : getStatus('lookup') === 'active' || getStatus('judge') === 'active'
          ? 'active'
          : 'pending',
      title: lang === 'en' ? 'Checking prices near you' : 'Tra cứu giá quanh bạn',
      subline:
        lang === 'en'
          ? 'Google Search + Maps · Hoàn Kiếm'
          : 'Google Search + Maps · Hoàn Kiếm',
    },
    {
      id: 'respond',
      status: getStatus('respond'),
      title: lang === 'en' ? 'Writing tips' : 'Tạo mẹo giao tiếp',
      subline:
        lang === 'en'
          ? 'Polite phrases in Vietnamese'
          : 'Câu trả giá lịch sự bằng tiếng Việt',
    },
  ];

  return (
    <Sheet data-testid="agent-working-sheet" className="pb-4">
      <h2 className="font-display text-[23px] leading-tight text-ink">
        {title}
      </h2>
      <p className="text-[13.5px] text-ink-2 mt-0.5 mb-3.5">
        {subtitle}
      </p>

      <StepList steps={stepItems} className="mb-3.5" />

      {onCancel && (
        <Button
          variant="secondary"
          size="md"
          onClick={onCancel}
          className="w-full"
        >
          {lang === 'en' ? 'Cancel' : 'Huỷ'}
        </Button>
      )}
    </Sheet>
  );
};
