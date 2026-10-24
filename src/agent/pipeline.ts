import { applyContext, defaultContext, isInOldQuarter, mapAreaKindToArea } from './context';
import { judge } from './judge';
import { lookup } from './lookup';
import { buildMapsTraceStep, fetchMapsContext } from './maps';
import { normalize } from './normalize';
import { perceive, PerceiveOptions } from './perceive';
import { buildTemplateResponse } from './respond';
import {
  ConfirmationQuestion,
  EvaluatedItem,
  MapsContextResult,
  NormalizedItem,
  PerceptionResult,
  PriceContext,
  PipelineProgressEvent,
  PipelineStepId,
  PipelineStepProgress,
  TraceStep,
} from './types';

export interface PipelineRunOptions extends PerceiveOptions {
  /** Pre-existing perception result when resuming after a human-in-the-loop question */
  existingPerception?: PerceptionResult;
  /** Map of item_index -> chosen reference ID (or 'none') */
  userConfirmations?: Record<number, string | 'none'>;
  /** Short pause between the instant local steps so the trace is readable (0 in unit tests) */
  stepDelayMs?: number;
  /** Where and when the price was quoted; venue defaults to what Gemini saw in the photo */
  context?: Partial<PriceContext>;
  /** User coordinates when geolocation is allowed; omitted or null when denied/unknown */
  coords?: { lat: number; lng: number } | null;
  /** Optional override for unit tests */
  mapsContextFetcher?: (lat: number, lng: number) => Promise<{ result: MapsContextResult; ms: number }>;
  onProgress?: (event: PipelineProgressEvent) => void;
}

export interface PipelineRunResult {
  status: 'needs_confirmation' | 'complete' | 'not_relevant';
  perception: PerceptionResult;
  questions: ConfirmationQuestion[];
  evaluatedItems: EvaluatedItem[];
}

const STEP_ORDER: PipelineStepId[] = ['perceive', 'normalize', 'lookup', 'judge', 'respond'];

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Scan aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Scan aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const PERCEPTION_STEP_IDS = new Set(['ocr', 'read', 'fuse', 'tiles', 'second_pass']);

export async function runPipeline(options: PipelineRunOptions): Promise<PipelineRunResult> {
  const stepDelay = options.stepDelayMs ?? 0;
  const sig = options.signal;
  const checkAbort = () => {
    if (sig?.aborted) {
      throw new DOMException('Scan aborted', 'AbortError');
    }
  };

  const steps: PipelineStepProgress[] = STEP_ORDER.map((step) => ({
    step,
    status: 'pending',
  }));

  let perception: PerceptionResult | undefined;
  let trace: TraceStep[] = [];
  let mapsResult: MapsContextResult | undefined;
  let mapsMs = 0;

  const emit = (currentStep: PipelineStepId, itemCount?: number, perceivedItems = perception?.items) => {
    options.onProgress?.({
      currentStep,
      steps: steps.map((s) => ({ ...s })),
      itemCount,
      perceivedItems,
      trace: trace.map((t) => ({ ...t })),
    });
  };

  checkAbort();

  // 1. PERCEIVE (+ parallel /api/maps/context when location is known and not in demo mode)
  steps[0].status = 'active';
  emit('perceive');

  const fetcher = options.mapsContextFetcher ?? ((lat: number, lng: number) => fetchMapsContext(lat, lng, sig));

  if (options.existingPerception) {
    perception = {
      ...options.existingPerception,
      trace: (options.existingPerception.trace ?? []).filter((t) => PERCEPTION_STEP_IDS.has(t.id)),
    };
    mapsResult = options.existingPerception.maps_context;
  } else {
    const mapsPromise: Promise<{ result: MapsContextResult; ms: number } | null> =
      !options.demoMode && options.coords
        ? fetcher(options.coords.lat, options.coords.lng)
        : Promise.resolve(null);

    const [perceiveRes, mapsSettled] = await Promise.all([perceive(options), mapsPromise]);
    perception = perceiveRes;
    if (mapsSettled) {
      mapsResult = mapsSettled.result;
      mapsMs = mapsSettled.ms;
      perception.maps_context = mapsResult;
    } else if (perception.maps_context) {
      mapsResult = perception.maps_context;
    }
  }

  checkAbort();

  trace = [...(perception.trace ?? [])];
  perception.trace = trace;

  if (perception.image_type === 'not_relevant' || !perception.items || perception.items.length === 0) {
    steps[0].status = 'done';
    steps[0].summary_en = '0 items';
    steps[0].summary_vi = '0 món';
    emit('perceive', 0, []);
    return {
      status: 'not_relevant',
      perception,
      questions: [],
      evaluatedItems: [],
    };
  }

  const totalItems = perception.items.length;
  steps[0].status = 'done';
  steps[0].summary_en = `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
  steps[0].summary_vi = `${totalItems} món`;

  // 2. NORMALIZE (match)
  steps[1].status = 'active';
  emit('normalize', totalItems, perception.items);
  if (stepDelay > 0 && !options.existingPerception) await delay(stepDelay, sig);

  const matchStart = performance.now();
  const normalizedResult = await normalize(perception.items, options.userConfirmations || {});
  const matchMs = Math.round(performance.now() - matchStart);
  const askCount = normalizedResult.questions.length;
  const sureCount = Math.max(0, totalItems - askCount);

  steps[1].status = 'done';
  steps[1].summary_en = askCount > 0 ? `${sureCount} sure, ${askCount} to ask` : `${sureCount} matched`;
  steps[1].summary_vi = askCount > 0 ? `${sureCount} rõ, ${askCount} cần hỏi` : `${sureCount} khớp`;

  const confirmedEntries = Object.entries(options.userConfirmations || {});
  let matchDetail: string;
  if (askCount > 0) {
    matchDetail = askCount === 1 ? '1 needs your help' : `${askCount} need your help`;
  } else if (confirmedEntries.length > 0) {
    const allRefs = await Promise.all(
      confirmedEntries.map(async ([, refId]) => {
        if (refId === 'none') return 'unsure';
        const ref = await lookup(refId);
        return (ref?.name_vi || refId).toLowerCase();
      })
    );
    matchDetail = `${confirmedEntries.length} asked you: ${allRefs.join(', ')}`;
  } else {
    matchDetail = `${sureCount} of ${totalItems} matched`;
  }

  trace.push({
    id: 'match',
    title_en: 'Matching dishes',
    title_vi: 'Đối chiếu danh mục',
    detail: matchDetail,
    ms: matchMs,
    status: 'done',
  });

  if (askCount > 0) {
    emit('normalize', totalItems, perception.items);
    return {
      status: 'needs_confirmation',
      perception,
      questions: normalizedResult.questions,
      evaluatedItems: [],
    };
  }

  // 3. LOOKUP (+ Maps context adjustment)
  steps[2].status = 'active';
  emit('lookup', totalItems, perception.items);
  if (stepDelay > 0) await delay(stepDelay, sig);

  const fallbackArea = options.coords
    ? isInOldQuarter(options.coords.lat, options.coords.lng)
      ? 'old_quarter'
      : 'elsewhere'
    : options.context?.area ?? 'old_quarter';

  const mapsSucceeded = Boolean(
    mapsResult && !mapsResult.unavailable && mapsResult.area_kind && mapsResult.area_name
  );

  const context: PriceContext = {
    ...defaultContext(perception.venue_type ?? 'street'),
    area: mapsSucceeded ? mapAreaKindToArea(mapsResult!.area_kind!) : fallbackArea,
    ...options.context,
    ...(mapsSucceeded
      ? {
          area: mapAreaKindToArea(mapsResult!.area_kind!),
          area_kind: mapsResult!.area_kind,
          area_name: mapsResult!.area_name,
        }
      : {}),
  };

  const lookupStart = performance.now();
  const lookedUp = await Promise.all(
    normalizedResult.items.map(async (norm) => {
      const baseRef = await lookup(norm.matched_id);
      const adjusted = baseRef ? applyContext(baseRef, context) : null;
      return {
        norm,
        baseRef,
        reference: adjusted?.reference ?? null,
        factors: adjusted?.factors ?? [],
      };
    })
  );
  const lookupMs = Math.round(performance.now() - lookupStart);
  const foundRefs = lookedUp.filter((e) => e.reference).length;

  steps[2].status = 'done';
  steps[2].summary_en = `${foundRefs} ranges`;
  steps[2].summary_vi = `${foundRefs} mức giá`;

  const areaLabel = context.area_name || (context.area === 'old_quarter' ? 'Hoàn Kiếm' : 'Hà Nội');
  trace.push({
    id: 'lookup',
    title_en: 'Checking prices near you',
    title_vi: 'Tra cứu giá quanh bạn',
    detail: `Google Search + Maps · ${areaLabel}`,
    ms: lookupMs,
    status: 'done',
  });

  const mapsStep = buildMapsTraceStep({
    demoMode: options.demoMode,
    hasLocation: Boolean(options.coords),
    contextResult: mapsResult,
    ms: mapsMs,
  });
  trace.push(mapsStep);

  // 4. JUDGE
  steps[3].status = 'active';
  emit('judge', totalItems, perception.items);
  if (stepDelay > 0) await delay(stepDelay, sig);

  const judgeStart = performance.now();
  const judged = await Promise.all(
    lookedUp.map(async (entry) => ({
      ...entry,
      judgment: await judge(entry.norm, entry.reference),
    }))
  );
  const judgeMs = Math.round(performance.now() - judgeStart);

  steps[3].status = 'done';
  steps[3].summary_en = 'Done';
  steps[3].summary_vi = 'Xong';

  trace.push({
    id: 'judge',
    title_en: 'Judging prices',
    title_vi: 'Đánh giá mức giá',
    detail: `${foundRefs} of ${totalItems} items judged`,
    ms: judgeMs,
    status: 'done',
  });

  // 5. RESPOND (local templates: instant, offline, and never one network call per item)
  steps[4].status = 'active';
  emit('respond', totalItems, perception.items);
  if (stepDelay > 0) await delay(stepDelay, sig);

  const respondStart = performance.now();
  const evaluatedItems: EvaluatedItem[] = judged.map((entry, idx) => ({
    index: idx,
    perceived: entry.norm.perceived,
    normalized: entry.norm,
    reference: entry.reference,
    base_reference: entry.baseRef,
    factors: entry.factors,
    judgment: entry.judgment,
    response: buildTemplateResponse(entry.norm, entry.reference, entry.judgment, entry.factors),
  }));
  const respondMs = Math.round(performance.now() - respondStart);

  steps[4].status = 'done';
  steps[4].summary_en = 'Ready';
  steps[4].summary_vi = 'Sẵn sàng';

  trace.push({
    id: 'respond',
    title_en: 'Writing tips',
    title_vi: 'Tạo mẹo giao tiếp',
    detail: 'Polite phrases in Vietnamese',
    ms: respondMs,
    status: 'done',
  });

  emit('respond', totalItems, perception.items);

  return {
    status: 'complete',
    perception,
    questions: [],
    evaluatedItems,
  };
}

/**
 * Steps 3-5 for already-normalized items. Pure and local, so the UI can re-run it instantly
 * when the user changes the place type or area.
 */
export async function evaluateItems(items: NormalizedItem[], context: PriceContext): Promise<EvaluatedItem[]> {
  return Promise.all(
    items.map(async (norm, idx) => {
      const baseRef = await lookup(norm.matched_id);
      const adjusted = baseRef ? applyContext(baseRef, context) : null;
      const reference = adjusted?.reference ?? null;
      const judgment = await judge(norm, reference);
      return {
        index: idx,
        perceived: norm.perceived,
        normalized: norm,
        reference,
        base_reference: baseRef,
        factors: adjusted?.factors ?? [],
        judgment,
        response: buildTemplateResponse(norm, reference, judgment, adjusted?.factors ?? []),
      };
    })
  );
}
