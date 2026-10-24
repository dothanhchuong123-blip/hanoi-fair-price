import React from 'react';
import { PipelineProgressEvent, PipelineStepId, TraceStep } from '../agent/types';
import { Button, Sheet, StepItem, StepList } from './ui';

interface AgentWorkingSheetProps {
  lang: 'en' | 'vi';
  sampleType: 'menu' | 'stall' | 'upload';
  progress: PipelineProgressEvent | null;
  onCancel?: () => void;
}

/**
 * Maps the pipeline trace into the 5 plain-language steps shown on the Checking screen (Screenshot 04):
 * 1. Reading the menu      -> `ocr`
 * 2. Understanding items   -> `read` + `fuse` + `tiles` + `second_pass`
 * 3. Matching dishes       -> `match`
 * 4. Checking prices near you -> `lookup` + `maps`
 * 5. Writing tips          -> `judge` + `respond`
 */
export function mapTraceToCheckingSteps(
  trace: TraceStep[] | undefined,
  progress: PipelineProgressEvent | null = null,
  sampleType: 'menu' | 'stall' | 'upload' = 'menu',
  lang: 'en' | 'vi' = 'en'
): StepItem[] {
  const count = progress?.itemCount ?? (sampleType === 'stall' ? 3 : 7);

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

  const findTrace = (id: TraceStep['id']) => trace?.find((t) => t.id === id);

  // 1. Reading the menu (`ocr`)
  const ocrTrace = findTrace('ocr');
  const ocrDetail =
    ocrTrace?.detail ??
    (lang === 'en'
      ? `Cloud Vision · ${count * 30 + 4} words · 0.8s`
      : `Cloud Vision · ${count * 30 + 4} từ · 0.8s`);

  // 2. Understanding items (`read` + `fuse` + `tiles` + `second_pass`)
  const readTrace = findTrace('read');
  const fuseTrace = findTrace('fuse');
  const tilesTrace = findTrace('tiles');
  const secondPassTrace = findTrace('second_pass');

  const understandParts: string[] = [];
  if (readTrace?.detail) understandParts.push(readTrace.detail);
  if (tilesTrace?.status === 'done' && tilesTrace.detail) {
    understandParts.push(tilesTrace.detail);
  }
  if (secondPassTrace?.status === 'done' && secondPassTrace.detail) {
    understandParts.push(secondPassTrace.detail);
  }
  if (understandParts.length === 0 && fuseTrace?.detail) {
    understandParts.push(fuseTrace.detail);
  }
  const understandDetail =
    understandParts.length > 0
      ? understandParts.join(' · ')
      : lang === 'en'
      ? `Gemini · ${count} ${count === 1 ? 'item' : 'items'}, ${count} ${
          count === 1 ? 'price' : 'prices'
        }`
      : `Gemini · ${count} món, ${count} mức giá`;

  // 3. Matching dishes (`match`)
  const matchTrace = findTrace('match');
  const matchDetail =
    matchTrace?.detail ??
    (lang === 'en' ? '1 needs your help' : '1 món cần bạn xác nhận');

  // 4. Checking prices near you (`lookup` + `maps`)
  const lookupTrace = findTrace('lookup');
  const mapsTrace = findTrace('maps');
  const lookupDetail =
    lookupTrace?.detail ??
    (mapsTrace?.status === 'done' ? mapsTrace.detail : undefined) ??
    'Google Search + Maps · Hoàn Kiếm';

  // 5. Writing tips (`judge` + `respond`)
  const judgeTrace = findTrace('judge');
  const respondTrace = findTrace('respond');
  const writingDetail =
    respondTrace?.detail ??
    judgeTrace?.detail ??
    (lang === 'en'
      ? 'Polite phrases in Vietnamese'
      : 'Câu trả giá lịch sự bằng tiếng Việt');

  const perceiveStatus = getStatus('perceive');
  const normalizeStatus = getStatus('normalize');
  const lookupStatus = getStatus('lookup');
  const judgeStatus = getStatus('judge');
  const respondStatus = getStatus('respond');

  return [
    {
      id: 'ocr',
      status: ocrTrace ? 'done' : perceiveStatus,
      title:
        lang === 'en'
          ? sampleType === 'stall'
            ? 'Reading the stall'
            : 'Reading the menu'
          : sampleType === 'stall'
          ? 'Đọc bảng giá quầy hàng'
          : 'Đọc thực đơn',
      subline: ocrDetail,
    },
    {
      id: 'understand',
      status:
        perceiveStatus === 'done' || (readTrace && fuseTrace && !progress)
          ? 'done'
          : ocrTrace && perceiveStatus === 'active'
          ? 'active'
          : perceiveStatus,
      title: lang === 'en' ? 'Understanding items' : 'Nhận diện món và giá',
      subline: understandDetail,
    },
    {
      id: 'match',
      status: matchTrace && !progress ? 'done' : normalizeStatus,
      title: lang === 'en' ? 'Matching dishes' : 'Đối chiếu danh mục',
      subline: matchDetail,
    },
    {
      id: 'lookup',
      status:
        lookupStatus === 'done' || (lookupTrace && !progress)
          ? 'done'
          : lookupStatus === 'active'
          ? 'active'
          : 'pending',
      title: lang === 'en' ? 'Checking prices near you' : 'Tra cứu giá quanh bạn',
      subline: lookupDetail,
    },
    {
      id: 'respond',
      status:
        respondStatus === 'done' || (respondTrace && !progress)
          ? 'done'
          : judgeStatus === 'active' || respondStatus === 'active'
          ? 'active'
          : 'pending',
      title: lang === 'en' ? 'Writing tips' : 'Tạo mẹo giao tiếp',
      subline: writingDetail,
    },
  ];
}

export const AgentWorkingSheet: React.FC<AgentWorkingSheetProps> = ({
  lang,
  sampleType,
  progress,
  onCancel,
}) => {
  const knownCount =
    progress?.itemCount ??
    (sampleType === 'menu' ? 7 : sampleType === 'stall' ? 3 : undefined);

  const title =
    knownCount !== undefined
      ? lang === 'en'
        ? `Checking ${knownCount} ${knownCount === 1 ? 'price' : 'prices'}...`
        : `Đang kiểm tra ${knownCount} mức giá...`
      : lang === 'en'
      ? 'Checking prices...'
      : 'Đang kiểm tra giá...';

  const subtitle =
    lang === 'en'
      ? "Takes a few seconds. You don't need to do anything."
      : 'Chỉ mất vài giây. Bạn không cần thao tác gì thêm.';

  const stepItems = mapTraceToCheckingSteps(
    progress?.trace,
    progress,
    sampleType,
    lang
  );

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
          data-testid="cancel-scan-btn"
          onClick={onCancel}
          className="w-full"
        >
          {lang === 'en' ? 'Cancel' : 'Huỷ'}
        </Button>
      )}
    </Sheet>
  );
};
