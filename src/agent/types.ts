export type ImageType = 'menu' | 'price_board' | 'stall' | 'not_relevant';

export type ItemCategory = 'street_food' | 'drink' | 'fruit' | 'vegetable' | 'other';

export type BoxSource = 'ocr' | 'ocr_partial' | 'gemini';

export interface TraceStep {
  id:
    | 'ocr'
    | 'read'
    | 'fuse'
    | 'tiles'
    | 'second_pass'
    | 'match'
    | 'lookup'
    | 'maps'
    | 'judge'
    | 'respond'
    | 'live_track';
  title_en: string;
  title_vi: string;
  detail: string;          // technical sub-line, e.g. "Cloud Vision · 214 words"
  model?: string;          // exact model id or API name
  ms: number;
  status: 'done' | 'skipped' | 'failed';
}

export interface PerceivedItem {
  name_vi: string;
  name_en: string;
  category: ItemCategory;
  price_vnd: number | null;
  raw_price_text?: string;
  unit: string;
  /** [ymin, xmin, ymax, xmax] normalized 0-1000 */
  box_2d: [number, number, number, number];
  /** Optional polygon of [x, y] points 0-1000 tracing a stall pile outline, or base64 PNG mask */
  mask?: [number, number][] | string;
  box_source?: BoxSource;
  confidence: number;
  /** Catalog id Gemini picked for this item, '' when nothing in the catalog fits */
  catalog_id?: string;
  /** How sure Gemini is about catalog_id */
  match?: 'exact' | 'similar' | 'none';
  /** Other catalog ids that could be meant, when the name alone can't tell them apart */
  alternatives?: string[];
  /** Topping / add-on line (e.g. "Nấm 5k" under "Ăn kèm"), never judged as a full dish */
  is_addon?: boolean;
  /** True when the second pass changed this item */
  rechecked?: boolean;
  /** Optional Google Search grounding range and link for this item */
  search_grounding?: {
    count: number;
    low_vnd: number;
    high_vnd: number;
    uri: string;
  };
}

export type VenueType = 'street' | 'eatery' | 'cafe' | 'tourist';

export type MapsAreaKind = 'tourist_core' | 'mixed' | 'local';

export interface MapsSource {
  title: string;
  uri: string;
}

export interface MapsContextResult {
  unavailable?: boolean;
  area_kind?: MapsAreaKind;
  area_name?: string;
  summary_en?: string;
  summary_vi?: string;
  sources?: MapsSource[];
}

export interface NearbyPlace {
  name: string;
  rating: number | null;
  price_low: number | null;
  price_high: number | null;
  open_now?: boolean | null;
  uri: string;
  place_id: string;
  distance_m?: number;
  lat?: number;
  lng?: number;
  is_sample?: boolean;
}

export interface MapsNearbyResult {
  unavailable?: boolean;
  places?: NearbyPlace[];
  sources?: MapsSource[];
  is_sample?: boolean;
  maps_js_api_key?: string;
}

export interface PerceptionResult {
  image_type: ImageType;
  items: PerceivedItem[];
  /** Gemini's read of the kind of place, from cues like plastic stools, printed menus, English text */
  venue_type?: VenueType;
  trace?: TraceStep[];
  image_size?: { w: number; h: number };
  /** Optional neighbourhood context retrieved in parallel via /api/maps/context */
  maps_context?: MapsContextResult;
}

export type AreaType = 'old_quarter' | 'elsewhere';

/** What we know about where and when the price was quoted */
export interface PriceContext {
  area: AreaType;
  venue: VenueType;
  date: Date;
  /** Optional neighbourhood classification from Google Maps grounding */
  area_kind?: MapsAreaKind;
  /** Optional neighbourhood name from Google Maps grounding (e.g. "Hoàn Kiếm") */
  area_name?: string;
}

/** One reason the typical range was moved, shown to the user as a chip */
export interface PriceFactor {
  id: 'area' | 'venue' | 'in_season' | 'off_season' | 'tet';
  emoji: string;
  label_en: string;
  label_vi: string;
  /** Change to the top of the range, e.g. 0.3 for +30% */
  effect: number;
}

export interface PriceReference {
  id: string;
  name_vi: string;
  name_en: string;
  description_en?: string;
  description_vi?: string;
  emoji?: string;
  aliases: string[];
  category: ItemCategory;
  unit: string;
  low_vnd: number;
  median_vnd: number;
  high_vnd: number;
  area: 'Hanoi';
  source: 'seed_estimate';
  updated: string;
  /** Months (1-12) when this fruit or vegetable is in season in northern Vietnam */
  season_months?: number[];
}

export interface DisambiguationOption {
  ref_id: string;
  name_vi: string;
  name_en: string;
  description_en: string;
  description_vi: string;
  typical_range_text: string;
  emoji: string;
  bg_tint: string;
}

export interface ConfirmationQuestion {
  item_index: number;
  perceived_name_vi: string;
  prompt_en: string;
  prompt_vi: string;
  subtitle_en: string;
  subtitle_vi: string;
  options: DisambiguationOption[];
}

export interface NormalizedItem {
  index: number;
  perceived: PerceivedItem;
  matched_id: string | null;
  match_score: number;
  normalized_price_vnd: number | null;
  normalized_unit: string;
  needs_confirmation: boolean;
  confirmation_question?: ConfirmationQuestion;
}

export interface NormalizeResult {
  items: NormalizedItem[];
  questions: ConfirmationQuestion[];
}

export type VerdictLabel = 'fair' | 'slightly_high' | 'overpriced' | 'unknown';

export interface JudgeVerdict {
  verdict: VerdictLabel;
  ratio: number | null;
  pct_above_median: number | null;
  pct_above_high: number | null;
  quoted_vnd: number | null;
  reference: PriceReference | null;
  confidence: number;
}

export interface SecondaryPhrase {
  icon: string;
  vi: string;
  en: string;
}

export interface RespondOutput {
  explanation_en: string;
  explanation_vi: string;
  phrase_header_en: string;
  phrase_header_vi: string;
  phrase_vi: string;
  pronunciation: string;
  phrase_en: string;
  tip_en: string;
  tip_vi: string;
  more_phrases: SecondaryPhrase[];
}

export interface EvaluatedItem {
  index: number;
  perceived: PerceivedItem;
  normalized: NormalizedItem;
  reference: PriceReference | null;
  /** Catalog range before context adjustments */
  base_reference: PriceReference | null;
  factors: PriceFactor[];
  judgment: JudgeVerdict;
  response: RespondOutput;
}

export type PipelineStepId = 'perceive' | 'normalize' | 'lookup' | 'judge' | 'respond';

export interface PipelineStepProgress {
  step: PipelineStepId;
  status: 'pending' | 'active' | 'done';
  summary_en?: string;
  summary_vi?: string;
}

export interface PipelineProgressEvent {
  currentStep: PipelineStepId;
  steps: PipelineStepProgress[];
  itemCount?: number;
  perceivedItems?: PerceivedItem[];
  trace?: TraceStep[];
}

export interface CrowdReport {
  id: string;
  item_id: string;
  name_vi: string;
  paid_vnd: number;
  street: string;
  timestamp: number;
}
