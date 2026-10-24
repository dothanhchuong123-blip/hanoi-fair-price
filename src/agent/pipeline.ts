import { applyContext, defaultContext } from './context';
import { judge } from './judge';
import { lookup } from './lookup';
import { normalize } from './normalize';
import { perceive, PerceiveOptions } from './perceive';
import { buildTemplateResponse } from './respond';
import {
  ConfirmationQuestion,
  EvaluatedItem,
  NormalizedItem,
  PerceptionResult,
  PriceContext,
  PipelineProgressEvent,
  PipelineStepId,
  PipelineStepProgress,
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
  onProgress?: (event: PipelineProgressEvent) => void;
}

export interface PipelineRunResult {
  status: 'needs_confirmation' | 'complete' | 'not_relevant';
  perception: PerceptionResult;
  questions: ConfirmationQuestion[];
  evaluatedItems: EvaluatedItem[];
}

const STEP_ORDER: PipelineStepId[] = ['perceive', 'normalize', 'lookup', 'judge', 'respond'];

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runPipeline(options: PipelineRunOptions): Promise<PipelineRunResult> {
  const stepDelay = options.stepDelayMs ?? 0;
  const steps: PipelineStepProgress[] = STEP_ORDER.map((step) => ({
    step,
    status: 'pending',
  }));

  const emit = (currentStep: PipelineStepId, itemCount?: number, perceivedItems = perception?.items) => {
    options.onProgress?.({
      currentStep,
      steps: steps.map((s) => ({ ...s })),
      itemCount,
      perceivedItems,
    });
  };

  // 1. PERCEIVE
  let perception: PerceptionResult;
  steps[0].status = 'active';
  emit('perceive');

  if (options.existingPerception) {
    perception = options.existingPerception;
  } else {
    perception = await perceive(options);
  }

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

  // 2. NORMALIZE
  steps[1].status = 'active';
  emit('normalize', totalItems, perception.items);
  if (stepDelay > 0 && !options.existingPerception) await delay(stepDelay);

  const normalizedResult = await normalize(perception.items, options.userConfirmations || {});
  const askCount = normalizedResult.questions.length;
  const sureCount = Math.max(0, totalItems - askCount);

  steps[1].status = 'done';
  steps[1].summary_en = askCount > 0 ? `${sureCount} sure, ${askCount} to ask` : `${sureCount} matched`;
  steps[1].summary_vi = askCount > 0 ? `${sureCount} rõ, ${askCount} cần hỏi` : `${sureCount} khớp`;

  if (askCount > 0) {
    emit('normalize', totalItems, perception.items);
    return {
      status: 'needs_confirmation',
      perception,
      questions: normalizedResult.questions,
      evaluatedItems: [],
    };
  }

  // 3. LOOKUP (+ context adjustment)
  steps[2].status = 'active';
  emit('lookup', totalItems, perception.items);
  if (stepDelay > 0) await delay(stepDelay);

  const context: PriceContext = {
    ...defaultContext(perception.venue_type ?? 'street'),
    ...options.context,
  };
  const evaluatedItems = await evaluateItems(normalizedResult.items, context);
  const foundRefs = evaluatedItems.filter((e) => e.reference).length;
  steps[2].status = 'done';
  steps[2].summary_en = `${foundRefs} ranges`;
  steps[2].summary_vi = `${foundRefs} mức giá`;

  // 4. JUDGE (deterministic, already computed in evaluateItems)
  steps[3].status = 'active';
  emit('judge', totalItems, perception.items);
  if (stepDelay > 0) await delay(stepDelay);
  steps[3].status = 'done';
  steps[3].summary_en = 'Done';
  steps[3].summary_vi = 'Xong';

  // 5. RESPOND (local templates: instant, offline, and never one network call per item)
  steps[4].status = 'active';
  emit('respond', totalItems, perception.items);
  if (stepDelay > 0) await delay(stepDelay);
  steps[4].status = 'done';
  steps[4].summary_en = 'Ready';
  steps[4].summary_vi = 'Sẵn sàng';
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
