import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  Eye,
  Image as ImageIcon,
  MapPin,
  Share,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { isInOldQuarter } from './agent/context';
import { evaluateItems, runPipeline } from './agent/pipeline';
import {
  AreaType,
  ConfirmationQuestion,
  EvaluatedItem,
  NormalizedItem,
  PerceptionResult,
  PipelineProgressEvent,
  PriceReference,
  TraceStep,
  VenueType,
} from './agent/types';
import { AgentWorkingSheet } from './components/AgentWorkingSheet';
import { CameraViewfinder, CameraViewfinderHandle } from './components/CameraViewfinder';
import { ContextBar } from './components/ContextBar';
import { DisambiguationSheet } from './components/DisambiguationSheet';
import { OnboardingView } from './components/OnboardingView';
import { QuickQuoteView } from './components/QuickQuoteView';
import { ResultsSheet } from './components/ResultsSheet';
import {
  SampleMenuBoard,
  SampleStallBasket,
  UploadedPhotoCanvas,
} from './components/SamplePhotos';
import { SayItView } from './components/SayItView';
import { StallLiveView } from './components/StallLiveView';
import { VerdictSheet } from './components/VerdictSheet';
import { NearbySheet } from './components/NearbySheet';
import { WhatDidYouPaySheet } from './components/WhatDidYouPaySheet';
import { HowWeKnowSheet } from './components/HowWeKnowSheet';
import { Button, Chip, IconButton } from './components/ui';
import { DesktopPanel } from './site/DesktopPanel';
import { DelegateType } from './lib/liveTracker';
import {
  addHistory,
  getOnboardingDone,
  getPassportStamps,
  PassportStamp,
  saveCrowdReport,
  setOnboardingDone,
} from './lib/storage';

type ScreenState =
  | 'onboarding'
  | 'camera_home'
  | 'scanning'
  | 'disambiguation'
  | 'results'
  | 'say_it'
  | 'quick_quote';

type BottomMode = 'menu' | 'stall' | 'quick';

interface AppProps {
  lang: 'en' | 'vi';
  setLang: React.Dispatch<React.SetStateAction<'en' | 'vi'>>;
  /** Where the website sent the user: camera, quick quote, or the sample menu */
  start?: 'camera' | 'quote' | 'sample';
  dishId?: string;
}

/** Keep a local log of every judged price so the History list can show it */
function recordHistory(items: EvaluatedItem[]) {
  const entries = items
    .filter((e) => e.judgment.quoted_vnd !== null)
    .map((e) => ({
      item_id: e.reference?.id ?? null,
      name_vi: e.reference?.name_vi ?? e.perceived.name_vi,
      name_en: e.reference?.name_en ?? e.perceived.name_en,
      emoji: e.reference?.emoji ?? '🍜',
      quoted_vnd: e.normalized.normalized_price_vnd ?? (e.judgment.quoted_vnd as number),
      unit: e.normalized.normalized_unit || e.perceived.unit,
      verdict: e.judgment.verdict,
      typical_high_vnd: e.reference?.high_vnd ?? null,
    }));
  if (entries.length > 0) addHistory(entries);
}

export default function App({ lang, setLang, start = 'camera', dishId }: AppProps) {
  const [demoMode, setDemoMode] = useState<boolean>(start === 'sample');
  const [bottomMode, setBottomMode] = useState<BottomMode>(start === 'quote' ? 'quick' : 'menu');
  const [quoteRefId, setQuoteRefId] = useState<string | undefined>(dishId);
  const [screen, setScreen] = useState<ScreenState>(() =>
    start === 'quote'
      ? 'quick_quote'
      : start === 'sample' || getOnboardingDone()
      ? 'camera_home'
      : 'onboarding'
  );

  // Pipeline & results state
  const [progress, setProgress] = useState<PipelineProgressEvent | null>(null);
  const [currentPerception, setCurrentPerception] = useState<PerceptionResult | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<ConfirmationQuestion[]>([]);
  const [questionCursor, setQuestionCursor] = useState<number>(0);
  const [userConfirmations, setUserConfirmations] = useState<Record<number, string | 'none'>>({});
  const [evaluatedItems, setEvaluatedItems] = useState<EvaluatedItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<EvaluatedItem | null>(null);
  const [howWeKnowItem, setHowWeKnowItem] = useState<EvaluatedItem | null>(null);
  const [notRelevantMessage, setNotRelevantMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);

  // Stall AR live view state
  const [liveViewActive, setLiveViewActive] = useState<boolean>(false);
  const [liveTelemetry, setLiveTelemetry] = useState<{
    delegate: DelegateType;
    fps: number;
  } | null>(null);

  // Uploaded photo / camera state
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedMime, setUploadedMime] = useState<string>('image/jpeg');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<CameraViewfinderHandle | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraLocked, setCameraLocked] = useState(false);
  const [autoCaptureCountdown, setAutoCaptureCountdown] = useState(false);

  // Price context: the venue starts from Gemini's guess, the user can override both
  const [area, setArea] = useState<AreaType>('old_quarter');
  const [locationKnown, setLocationKnown] = useState<boolean>(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [venueOverride, setVenueOverride] = useState<VenueType | null>(null);
  const [showContextBar, setShowContextBar] = useState(false);

  // Crowd report, nearby & passport state
  const [showPaidSheet, setShowPaidSheet] = useState(false);
  const [showNearbySheet, setShowNearbySheet] = useState(false);
  const [stamps, setStamps] = useState<PassportStamp[]>(() => getPassportStamps());
  const [stampToast, setStampToast] = useState<{ street: string; emoji: string; count: number } | null>(
    null
  );

  useEffect(() => {
    setStamps(getPassportStamps());
  }, []);

  // React to the website's links (e.g. "Check a price" on a guide card) while the app is open
  useEffect(() => {
    if (start === 'quote') {
      setQuoteRefId(dishId);
      setBottomMode('quick');
      setScreen('quick_quote');
    } else if (start === 'sample') {
      setOnboardingDone(true);
      setDemoMode(true);
      setUploadedImage(null);
      setBottomMode('menu');
      startPipelineScan({ overrideSample: 'menu', forceDemo: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, dishId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__choTrace = currentPerception?.trace ?? [];
    }
  }, [currentPerception]);

  const handleLiveTelemetry = useCallback((info: { delegate: DelegateType; fps: number }) => {
    setLiveTelemetry(info);
    const detail = `MediaPipe EfficientDet-Lite0 · ${info.delegate} · ${info.fps} fps`;
    const step: TraceStep = {
      id: 'live_track',
      title_en: 'Live AR stall tracking',
      title_vi: 'Theo dõi AR quầy hàng',
      detail,
      ms: Math.round(1000 / Math.max(1, info.fps)),
      status: 'done',
    };

    setCurrentPerception((prev) => {
      if (!prev) return prev;
      const existingTrace = prev.trace ?? [];
      const idx = existingTrace.findIndex((t) => t.id === 'live_track');
      if (idx >= 0 && existingTrace[idx].detail === detail) return prev;
      const nextTrace =
        idx >= 0
          ? existingTrace.map((t, i) => (i === idx ? step : t))
          : [...existingTrace, step];
      return { ...prev, trace: nextTrace };
    });
  }, []);

  // Check geolocation once on scan screen to populate neighbourhood chip ("Hoàn Kiếm")
  useEffect(() => {
    if (screen !== 'camera_home') return;
    if (!navigator.geolocation?.getCurrentPosition) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const inOQ = isInOldQuarter(pos.coords.latitude, pos.coords.longitude);
        setArea(inOQ ? 'old_quarter' : 'elsewhere');
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationKnown(true);
      },
      () => {
        if (cancelled) return;
        setLocationKnown(false);
      },
      { timeout: 6000, maximumAge: 300000 }
    );
    return () => {
      cancelled = true;
    };
  }, [screen]);

  const venue: VenueType = venueOverride ?? currentPerception?.venue_type ?? 'street';

  const currentSampleType: 'menu' | 'stall' | 'upload' = uploadedImage
    ? 'upload'
    : bottomMode === 'stall'
    ? 'stall'
    : 'menu';

  const isStallResult =
    bottomMode === 'stall' || currentPerception?.image_type === 'stall';

  const startPipelineScan = async (options?: {
    overrideSample?: 'menu' | 'stall';
    forceDemo?: boolean;
    imageBase64?: string;
    mimeType?: string;
    existingPerception?: PerceptionResult;
    confirmations?: Record<number, string | 'none'>;
  }) => {
    scanAbortRef.current?.abort();
    const abortController = new AbortController();
    scanAbortRef.current = abortController;

    setNotRelevantMessage(null);
    setScanError(null);
    setSelectedItem(null);
    setHowWeKnowItem(null);
    setShowPaidSheet(false);
    setShowNearbySheet(false);
    setLiveViewActive(false);
    setLiveTelemetry(null);
    setEvaluatedItems([]);
    setCameraLocked(false);
    setAutoCaptureCountdown(false);
    if (!options?.existingPerception) setProgress(null);
    setScreen('scanning');

    const sampleToUse = options?.overrideSample || (bottomMode === 'stall' ? 'stall' : 'menu');
    const imgToUse = options?.imageBase64 ?? uploadedImage ?? undefined;
    const isDemo = options?.forceDemo ?? (demoMode && !imgToUse);

    try {
      const result = await runPipeline({
        demoMode: isDemo,
        demoSample: sampleToUse,
        mode: sampleToUse,
        imageBase64: imgToUse,
        mimeType: options?.mimeType || uploadedMime,
        existingPerception: options?.existingPerception,
        userConfirmations: options?.confirmations || {},
        stepDelayMs: 110,
        coords: userCoords,
        signal: abortController.signal,
        context: { area, ...(venueOverride ? { venue: venueOverride } : {}) },
        onProgress: (ev) => {
          if (!abortController.signal.aborted) {
            setProgress(ev);
          }
        },
      });

      if (abortController.signal.aborted) return;

      setCurrentPerception(result.perception);

      if (result.status === 'not_relevant') {
        setScreen('camera_home');
        setNotRelevantMessage(
          lang === 'en'
            ? "That doesn't look like a menu or stall — try again?"
            : 'Ảnh này có vẻ không phải thực đơn hay quầy hàng — bạn thử chụp lại nhé?'
        );
        return;
      }

      if (result.status === 'needs_confirmation' && result.questions.length > 0) {
        setPendingQuestions(result.questions);
        setQuestionCursor(0);
        setScreen('disambiguation');
        return;
      }

      setEvaluatedItems(result.evaluatedItems);
      recordHistory(result.evaluatedItems);
      setScreen('results');
    } catch (err: unknown) {
      if (
        abortController.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      console.error('Price check failed', err);
      setScreen('camera_home');
      // A missing server key fails every photo, so say so instead of blaming the network
      const keyMissing = err instanceof Error && err.message.includes('GEMINI_API_KEY');
      setScanError(
        keyMissing
          ? lang === 'en'
            ? 'Photo checks are switched off on this server (no Gemini key). Use the sample for now.'
            : 'Máy chủ chưa bật kiểm tra ảnh (thiếu khóa Gemini). Hãy dùng ảnh mẫu.'
          : lang === 'en'
          ? "Couldn't reach our checker. Try again or use the sample."
          : 'Không kết nối được bộ kiểm tra giá. Hãy thử lại hoặc dùng ảnh mẫu.'
      );
    }
  };

  const handleOnboardingGetStarted = async () => {
    setOnboardingDone(true);
    setDemoMode(false);
    setUploadedImage(null);
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: false,
        });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        // CameraViewfinder will render fallback UI if denied or unavailable
      }
    }
    setScreen('camera_home');
  };

  const handleOnboardingTrySample = () => {
    setOnboardingDone(true);
    setDemoMode(true);
    setUploadedImage(null);
    setBottomMode('menu');
    startPipelineScan({ overrideSample: 'menu', forceDemo: true });
  };

  const handleShutter = () => {
    if (demoMode || uploadedImage) {
      startPipelineScan();
      return;
    }
    const frame = cameraRef.current?.capture();
    if (!frame) {
      setScanError(
        lang === 'en'
          ? 'The camera isn’t ready yet. Choose a photo instead, or switch on Demo.'
          : 'Camera chưa sẵn sàng. Hãy chọn ảnh, hoặc bật Demo.'
      );
      return;
    }
    setUploadedImage(frame.dataUrl);
    setUploadedMime(frame.mimeType);
    setUserConfirmations({});
    setVenueOverride(null);
    startPipelineScan({ imageBase64: frame.dataUrl, mimeType: frame.mimeType });
  };

  const handleAnswerDisambiguation = async (chosenRefId: string | 'none') => {
    const activeQuestion = pendingQuestions[questionCursor] ?? pendingQuestions[0];
    if (!activeQuestion || !currentPerception) return;

    const updatedConfirmations = {
      ...userConfirmations,
      [activeQuestion.item_index]: chosenRefId,
    };
    setUserConfirmations(updatedConfirmations);

    if (questionCursor + 1 < pendingQuestions.length) {
      setQuestionCursor((c) => c + 1);
      return;
    }

    await startPipelineScan({
      existingPerception: currentPerception,
      confirmations: updatedConfirmations,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mime = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadedImage(dataUrl);
      setUploadedMime(mime);
      setUserConfirmations({});
      setVenueOverride(null);
      startPipelineScan({ imageBase64: dataUrl, mimeType: mime });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleQuickQuoteCheck = async (
    ref: PriceReference,
    quotedVnd: number,
    selectedUnit: string
  ) => {
    const perceived = {
      name_vi: ref.name_vi,
      name_en: ref.name_en,
      category: ref.category,
      price_vnd: quotedVnd,
      unit: selectedUnit,
      box_2d: [200, 150, 300, 850] as [number, number, number, number],
      confidence: 0.98,
    };

    const normalized: NormalizedItem = {
      index: 0,
      perceived,
      matched_id: ref.id,
      match_score: 1.0,
      normalized_price_vnd: quotedVnd,
      normalized_unit: ref.unit,
      needs_confirmation: false,
    };

    const [evaluated] = await evaluateItems([normalized], { area, venue, date: new Date() });

    setEvaluatedItems([evaluated]);
    recordHistory([evaluated]);
    setSelectedItem(evaluated);
    setScreen('results');
  };

  const handleContextChange = async (nextVenue: VenueType, nextArea: AreaType) => {
    setVenueOverride(nextVenue);
    setArea(nextArea);
    const next = await evaluateItems(
      evaluatedItems.map((e) => e.normalized),
      { area: nextArea, venue: nextVenue, date: new Date() }
    );
    setEvaluatedItems(next);
    setSelectedItem((current) =>
      current ? next.find((e) => e.index === current.index) ?? null : null
    );
  };

  const handleLocate = () =>
    new Promise<void>((resolve) => {
      if (!navigator.geolocation) {
        resolve();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationKnown(true);
          handleContextChange(
            venue,
            isInOldQuarter(pos.coords.latitude, pos.coords.longitude)
              ? 'old_quarter'
              : 'elsewhere'
          );
          resolve();
        },
        () => {
          setScanError(
            lang === 'en'
              ? 'Couldn’t get your location. Pick the area yourself instead.'
              : 'Không lấy được vị trí. Bạn hãy tự chọn khu vực nhé.'
          );
          resolve();
        },
        { timeout: 8000, maximumAge: 300000 }
      );
    });

  const handleSubmitPaidReport = (paidVnd: number) => {
    if (!selectedItem) return;
    const itemId = selectedItem.reference?.id || 'custom_item';
    const nameVi = selectedItem.reference?.name_vi || selectedItem.perceived.name_vi;

    const { newStamp, allStamps } = saveCrowdReport(itemId, nameVi, paidVnd);
    setStamps(allStamps);
    setShowPaidSheet(false);
    setSelectedItem(null);

    setStampToast({
      street: newStamp.street,
      emoji: newStamp.emoji,
      count: allStamps.length,
    });

    setTimeout(() => {
      setStampToast(null);
    }, 4800);
  };

  const handleRetake = () => {
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
    setUploadedImage(null);
    setSelectedItem(null);
    setHowWeKnowItem(null);
    setShowPaidSheet(false);
    setShowNearbySheet(false);
    setLiveViewActive(false);
    setLiveTelemetry(null);
    setUserConfirmations({});
    setPendingQuestions([]);
    setQuestionCursor(0);
    setNotRelevantMessage(null);
    setScanError(null);
    setScreen('camera_home');
  };

  return (
    <div className="w-full bg-bg text-ink flex justify-center items-start paper-grain lg:py-8 lg:px-8 lg:min-h-[calc(100vh-68px)]">
      <div className="w-full max-w-[1200px] flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8 xl:gap-12">
        {/* MOBILE PHONE FRAME (Full bleed at 375px-430px, framed on desktop) */}
        <main
          aria-label="Chợ Price Lens mobile app"
          className="relative w-full max-w-[480px] lg:w-[400px] h-[100dvh] lg:h-[min(820px,calc(100vh-124px))] lg:rounded-[32px] lg:shadow-pop lg:ring-1 lg:ring-ink/10 overflow-hidden flex flex-col camera-bg shrink-0 lg:sticky lg:top-[92px]"
        >
          {/* Hidden file input for gallery upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
            aria-label="Upload menu or stall photo"
          />

          {/* Onboarding Full View (Screenshot 01) */}
          {screen === 'onboarding' ? (
            <OnboardingView
              lang={lang}
              onChangeLang={setLang}
              onGetStarted={handleOnboardingGetStarted}
              onTrySampleMenu={handleOnboardingTrySample}
            />
          ) : screen === 'say_it' && selectedItem ? (
            /* Say It Full View */
            <div className="flex-1 flex flex-col bg-bg overflow-y-auto">
              <SayItView
                lang={lang}
                item={selectedItem}
                onBack={() => setScreen('results')}
              />
            </div>
          ) : screen === 'quick_quote' ? (
            /* Quick Quote Full View */
            <div className="flex-1 flex flex-col bg-bg overflow-y-auto">
              <QuickQuoteView
                key={quoteRefId ?? 'default'}
                initialRefId={quoteRefId}
                lang={lang}
                onToggleLang={() => setLang((l) => (l === 'en' ? 'vi' : 'en'))}
                onBack={() => {
                  setBottomMode('menu');
                  setScreen('camera_home');
                }}
                onCheckPrice={handleQuickQuoteCheck}
              />
            </div>
          ) : (
            /* CAMERA / SCANNING / DISAMBIGUATION / RESULTS VIEWPORT */
            <div className="flex-1 flex flex-col justify-between relative overflow-hidden">
              {/* Top Floating Passport Stamp Toast */}
              {stampToast && (
                <div
                  data-testid="passport-stamp-toast"
                  role="status"
                  className="absolute top-14 left-4 right-4 z-50 bg-surface border border-line rounded-[20px] p-3.5 flex items-center gap-3.5 text-ink shadow-xl"
                >
                  <div className="w-12 h-12 rounded-full border-2 border-dashed border-brand bg-brand-soft flex items-center justify-center text-[22px] shrink-0">
                    {stampToast.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[15.5px] leading-snug text-ink">
                      {lang === 'en'
                        ? `Stamp collected: ${stampToast.street}!`
                        : `Đã sưu tầm dấu: ${stampToast.street}!`}
                    </div>
                    <div className="text-[13px] text-ink-2 leading-snug">
                      {lang === 'en'
                        ? `Thanks — your report helps the next visitor. ${stampToast.count} / 12 streets`
                        : `Cảm ơn bạn — báo giá giúp du khách tiếp theo. ${stampToast.count} / 12 phố`}
                    </div>
                  </div>
                </div>
              )}

              {/* TOP BAR: Results vs Disambiguation vs Camera Home */}
              {screen === 'results' ? (
                <header className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2 z-20">
                  <IconButton
                    variant="glass"
                    onClick={handleRetake}
                    aria-label={lang === 'en' ? 'Retake' : 'Chụp lại'}
                  >
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </IconButton>

                  <Chip
                    as="button"
                    variant="glass"
                    onClick={() => setShowContextBar((v) => !v)}
                  >
                    <MapPin className="w-3.5 h-3.5 text-white/90" />
                    <span>
                      {area === 'old_quarter'
                        ? lang === 'en'
                          ? 'Hoàn Kiếm · Old Quarter'
                          : 'Hoàn Kiếm · Phố cổ'
                        : lang === 'en'
                        ? 'Hanoi · Elsewhere'
                        : 'Hà Nội · Nơi khác'}
                    </span>
                  </Chip>

                  <IconButton
                    variant="glass"
                    onClick={() => setShowContextBar((v) => !v)}
                    aria-label="Share or adjust context"
                  >
                    <Share className="w-4 h-4 text-white" />
                  </IconButton>
                </header>
              ) : screen === 'disambiguation' ? (
                <header className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2 z-20">
                  <IconButton
                    variant="glass"
                    onClick={handleRetake}
                    aria-label={lang === 'en' ? 'Back' : 'Quay lại'}
                  >
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </IconButton>

                  <Chip variant="glass" data-testid="needs-eyes-chip">
                    {lang === 'en' ? 'One item needs your eyes' : 'Một món cần bạn xác nhận'}
                  </Chip>

                  <div className="w-[44px]" aria-hidden="true" />
                </header>
              ) : screen === 'scanning' ? (
                <div className="pt-3" aria-hidden="true" />
              ) : cameraLocked && !demoMode && !uploadedImage ? (
                /* Live detect top bar matching Screenshot 03 */
                <header className="px-4 pt-3.5 pb-1 flex items-center justify-between gap-2 z-20">
                  <IconButton
                    variant="glass"
                    onClick={handleRetake}
                    aria-label="Reset camera view"
                  >
                    <X className="w-5 h-5 text-white" />
                  </IconButton>

                  <Chip variant="glass" data-testid="menu-found-chip">
                    <span className="w-2 h-2 rounded-full bg-brand shrink-0" />
                    <span>
                      {lang === 'en'
                        ? 'Menu found · hold steady'
                        : 'Đã thấy thực đơn · giữ máy'}
                    </span>
                  </Chip>

                  <div className="w-[44px]" aria-hidden="true" />
                </header>
              ) : (
                /* Camera Home Top Bar matching Screenshot 02 */
                <header className="px-4 pt-3.5 pb-1 flex flex-col items-center gap-2.5 z-20">
                  <div className="w-full flex items-center justify-between gap-2">
                    <IconButton
                      variant="glass"
                      onClick={handleRetake}
                      aria-label="Reset camera view"
                    >
                      <X className="w-5 h-5 text-white" />
                    </IconButton>

                    {/* EN / VI Segmented Toggle */}
                    <div
                      role="group"
                      aria-label="Language selector"
                      className="glass-surface p-1 rounded-full flex items-center text-[13px] font-bold"
                    >
                      <button
                        type="button"
                        onClick={() => setLang('en')}
                        className={`px-3.5 py-1 rounded-full transition-colors cursor-pointer ${
                          lang === 'en' ? 'bg-white text-ink' : 'text-white/80'
                        }`}
                      >
                        EN
                      </button>
                      <button
                        type="button"
                        onClick={() => setLang('vi')}
                        className={`px-3.5 py-1 rounded-full transition-colors cursor-pointer ${
                          lang === 'vi' ? 'bg-white text-ink' : 'text-white/80'
                        }`}
                      >
                        VI
                      </button>
                    </div>

                    {/* Demo Mode Toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        setDemoMode((d) => !d);
                        setUploadedImage(null);
                        setScanError(null);
                      }}
                      aria-pressed={demoMode}
                      className={`glass-surface px-4 h-[38px] rounded-full text-[13.5px] font-semibold transition-all cursor-pointer ${
                        demoMode
                          ? 'bg-white/20 text-white ring-1 ring-white/60'
                          : 'text-white/90 hover:bg-white/15'
                      }`}
                    >
                      Demo
                    </button>
                  </div>

                  {/* Location Pill matching Screenshot 02: shown once geolocation is known */}
                  {locationKnown && (
                    <Chip
                      as="button"
                      variant="glass"
                      data-testid="location-chip"
                      onClick={() =>
                        setArea((a) => (a === 'old_quarter' ? 'elsewhere' : 'old_quarter'))
                      }
                    >
                      <MapPin className="w-3.5 h-3.5 text-white/90" />
                      <span>
                        {area === 'old_quarter'
                          ? 'Hoàn Kiếm'
                          : lang === 'en'
                          ? 'Elsewhere in Hanoi'
                          : 'Khu vực khác'}
                      </span>
                    </Chip>
                  )}
                </header>
              )}

              {/* Friendly Not Relevant Empty State with Retake Button */}
              {notRelevantMessage && (
                <div
                  data-testid="not-relevant-empty-state"
                  role="status"
                  className="absolute top-[74px] left-4 right-4 bg-surface text-ink p-4 rounded-[18px] border border-line shadow-xl z-40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[14.5px] font-semibold leading-snug">
                      {notRelevantMessage}
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotRelevantMessage(null)}
                      className="p-1 text-ink-2 cursor-pointer shrink-0"
                      aria-label="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      data-testid="not-relevant-retake-btn"
                      onClick={handleRetake}
                    >
                      {lang === 'en' ? 'Retake' : 'Chụp lại'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Network Failure Banner with Try Again and Demo Button */}
              {scanError && (
                <div
                  data-testid="network-error-banner"
                  role="alert"
                  className="absolute top-[74px] left-4 right-4 bg-surface text-ink p-4 rounded-[18px] border border-line shadow-xl z-40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[14.5px] font-semibold leading-snug">
                      {scanError}
                    </span>
                    <button
                      type="button"
                      onClick={() => setScanError(null)}
                      aria-label="Dismiss"
                      className="p-1 text-ink-2 cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid="error-try-again-btn"
                      onClick={() => startPipelineScan()}
                    >
                      {lang === 'en' ? 'Try again' : 'Thử lại'}
                    </Button>
                    {uploadedImage && !demoMode && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-testid="error-retake-btn"
                        onClick={() => {
                          setUploadedImage(null);
                          setScanError(null);
                        }}
                      >
                        {lang === 'en' ? 'Retake' : 'Chụp lại'}
                      </Button>
                    )}
                    <Button
                      variant="brand"
                      size="sm"
                      data-testid="error-use-sample-btn"
                      onClick={() => {
                        setDemoMode(true);
                        setUploadedImage(null);
                        setScanError(null);
                        startPipelineScan({
                          overrideSample: bottomMode === 'stall' ? 'stall' : 'menu',
                          forceDemo: true,
                        });
                      }}
                    >
                      {lang === 'en' ? 'Use sample' : 'Dùng ảnh mẫu'}
                    </Button>
                  </div>
                </div>
              )}

              {/* CENTER VIEWFINDER / PHOTO STAGE */}
              <div className="relative flex-1 flex flex-col items-center justify-center px-5 py-1">
                {screen === 'camera_home' && (
                  <div className="relative w-full max-w-[335px] py-3">
                    {(!cameraLocked || demoMode || Boolean(uploadedImage)) && (
                      <>
                        {/* Top-Left Corner Bracket */}
                        <div className="pointer-events-none absolute -top-0.5 -left-0.5 w-7 h-7 border-t-[3px] border-l-[3px] border-white/95 rounded-tl-[12px] z-20" />
                        {/* Top-Right Corner Bracket */}
                        <div className="pointer-events-none absolute -top-0.5 -right-0.5 w-7 h-7 border-t-[3px] border-r-[3px] border-white/95 rounded-tr-[12px] z-20" />
                        {/* Bottom-Left Corner Bracket */}
                        <div className="pointer-events-none absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-[3px] border-l-[3px] border-white/95 rounded-bl-[12px] z-20" />
                        {/* Bottom-Right Corner Bracket */}
                        <div className="pointer-events-none absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-[3px] border-r-[3px] border-white/95 rounded-br-[12px] z-20" />
                      </>
                    )}

                    {uploadedImage ? (
                      <UploadedPhotoCanvas
                        imageDataUrl={uploadedImage}
                        mode="preview"
                        lang={lang}
                      />
                    ) : !demoMode ? (
                      <CameraViewfinder
                        ref={cameraRef}
                        lang={lang}
                        facingMode={facingMode}
                        onUploadInstead={() => fileInputRef.current?.click()}
                        onLockChange={setCameraLocked}
                        onAutoCaptureChange={setAutoCaptureCountdown}
                        onAutoCapture={handleShutter}
                      />
                    ) : currentSampleType === 'stall' ? (
                      <SampleStallBasket mode="preview" lang={lang} />
                    ) : (
                      <SampleMenuBoard mode="preview" lang={lang} />
                    )}
                  </div>
                )}

                {screen !== 'camera_home' && (
                  <div className="w-full max-w-[335px] py-1">
                    {screen === 'results' && isStallResult && liveViewActive ? (
                      <StallLiveView
                        lang={lang}
                        evaluatedItems={evaluatedItems}
                        capturedImageDataUrl={uploadedImage}
                        demoMode={demoMode}
                        facingMode={facingMode}
                        onSelectItem={(item) => {
                          setSelectedItem(item);
                          setShowPaidSheet(false);
                        }}
                        onRescan={() => {
                          setLiveViewActive(false);
                          startPipelineScan({
                            overrideSample: 'stall',
                          });
                        }}
                        onTelemetry={handleLiveTelemetry}
                      />
                    ) : uploadedImage ? (
                      <UploadedPhotoCanvas
                        imageDataUrl={uploadedImage}
                        mode={
                          screen === 'scanning'
                            ? 'scanning'
                            : screen === 'disambiguation'
                            ? 'disambiguation'
                            : 'results'
                        }
                        lang={lang}
                        perceivedItems={currentPerception?.items ?? progress?.perceivedItems}
                        evaluatedItems={evaluatedItems}
                        activeQuestionItemIndex={
                          (pendingQuestions[questionCursor] ?? pendingQuestions[0])?.item_index ?? 0
                        }
                        onSelectItem={(item) => {
                          setSelectedItem(item);
                          setShowPaidSheet(false);
                        }}
                      />
                    ) : currentSampleType === 'stall' ? (
                      <SampleStallBasket
                        mode={
                          screen === 'scanning'
                            ? 'scanning'
                            : screen === 'disambiguation'
                            ? 'disambiguation'
                            : 'results'
                        }
                        lang={lang}
                        evaluatedItems={evaluatedItems}
                        activeQuestionItemIndex={
                          (pendingQuestions[questionCursor] ?? pendingQuestions[0])?.item_index ?? 0
                        }
                        onSelectItem={(item) => {
                          setSelectedItem(item);
                          setShowPaidSheet(false);
                        }}
                      />
                    ) : (
                      <SampleMenuBoard
                        mode={screen === 'scanning' ? 'scanning' : 'results'}
                        lang={lang}
                        evaluatedItems={evaluatedItems}
                        onSelectItem={(item) => {
                          setSelectedItem(item);
                          setShowPaidSheet(false);
                        }}
                      />
                    )}
                  </div>
                )}

                {/* Glass button "Live view" shown in Stall results mode */}
                {screen === 'results' && isStallResult && (
                  <div className="mt-1.5 flex items-center justify-center gap-2 z-20">
                    <Chip
                      as="button"
                      variant="glass"
                      data-testid="live-view-btn"
                      onClick={() => setLiveViewActive((v) => !v)}
                      className={`px-4 py-1.5 font-semibold text-[13px] transition-all ${
                        liveViewActive
                          ? 'bg-brand text-white ring-2 ring-white/70'
                          : 'hover:bg-white/25'
                      }`}
                    >
                      {liveViewActive ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>{lang === 'en' ? 'Photo view' : 'Xem ảnh chụp'}</span>
                        </>
                      ) : (
                        <>
                          <Video className="w-3.5 h-3.5" />
                          <span>{lang === 'en' ? 'Live view' : 'Xem trực tiếp'}</span>
                        </>
                      )}
                    </Chip>

                    {liveViewActive && liveTelemetry && (
                      <span
                        data-testid="live-telemetry-pill"
                        className="glass-surface px-2.5 py-1 rounded-full text-[11px] font-semibold text-white/90 tabular-nums"
                      >
                        {liveTelemetry.delegate} · {liveTelemetry.fps} fps
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* BOTTOM AREA: Camera Controls OR Active Bottom Sheet */}
              {screen === 'camera_home' && (
                <div className="px-4 pb-5 pt-1 flex flex-col items-center gap-3.5 z-20">
                  {/* Helper instruction pill (Screenshot 02) OR Auto-capture countdown pill (Screenshot 03) */}
                  <Chip
                    variant="glass"
                    data-testid={
                      autoCaptureCountdown && !demoMode && !uploadedImage
                        ? 'auto-capture-chip'
                        : 'scan-hint-chip'
                    }
                    className="text-[13px] font-medium px-4 py-1.5"
                  >
                    {autoCaptureCountdown && !demoMode && !uploadedImage
                      ? lang === 'en'
                        ? 'Auto-capture in 1s'
                        : 'Tự chụp sau 1 giây'
                      : uploadedImage
                      ? lang === 'en'
                        ? 'Tap the shutter to check this photo'
                        : 'Bấm nút chụp để kiểm tra ảnh này'
                      : lang === 'en'
                      ? 'Point at a menu, price board or stall'
                      : 'Hướng camera vào thực đơn, bảng giá hoặc quầy hàng'}
                  </Chip>

                  {/* Shutter Row: Gallery | White Shutter | Flash/Switch matching Screenshot 02 */}
                  <div className="w-full max-w-[270px] flex items-center justify-between">
                    <IconButton
                      variant="glass"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Upload photo from gallery"
                    >
                      <ImageIcon className="w-5 h-5 text-white" />
                    </IconButton>

                    <button
                      type="button"
                      onClick={handleShutter}
                      aria-label="Capture and check prices"
                      className="w-[72px] h-[72px] rounded-full p-1 border-[3px] border-white flex items-center justify-center cursor-pointer active:scale-95 transition-transform duration-150"
                    >
                      <span className="w-full h-full rounded-full bg-white block" />
                    </button>

                    <IconButton
                      variant="glass"
                      onClick={() => {
                        setUploadedImage(null);
                        if (demoMode) {
                          setBottomMode((m) => (m === 'menu' ? 'stall' : 'menu'));
                        } else {
                          setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'));
                        }
                      }}
                      aria-label={demoMode ? 'Switch sample photo' : 'Flip camera'}
                    >
                      <Zap className="w-5 h-5 text-white" />
                    </IconButton>
                  </div>

                  {/* Bottom Mode Selector Pills: Menu · Stall · Quick quote matching Screenshot 02 */}
                  <nav
                    aria-label="Scan mode"
                    className="glass-surface p-1 rounded-full flex items-center justify-between w-full max-w-[300px]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedImage(null);
                        setBottomMode('menu');
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-full text-[13.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        bottomMode === 'menu'
                          ? 'bg-white text-ink'
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      {lang === 'en' ? 'Menu' : 'Thực đơn'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUploadedImage(null);
                        setBottomMode('stall');
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-full text-[13.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        bottomMode === 'stall'
                          ? 'bg-white text-ink'
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      {lang === 'en' ? 'Stall' : 'Quầy hàng'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setBottomMode('quick');
                        setScreen('quick_quote');
                      }}
                      className="flex-1 py-1.5 px-3 rounded-full text-[13.5px] font-semibold text-white/80 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {lang === 'en' ? 'Quick quote' : 'Nhập nhanh'}
                    </button>
                  </nav>
                </div>
              )}

              {/* Agent Working Sheet (Screenshot 04) */}
              {screen === 'scanning' && (
                <AgentWorkingSheet
                  lang={lang}
                  sampleType={currentSampleType}
                  progress={progress}
                  onCancel={handleRetake}
                />
              )}

              {/* Human-in-the-loop Disambiguation Sheet (Screenshot 09) */}
              {screen === 'disambiguation' && (pendingQuestions[questionCursor] ?? pendingQuestions[0]) && (
                <DisambiguationSheet
                  lang={lang}
                  question={pendingQuestions[questionCursor] ?? pendingQuestions[0]}
                  questionIndex={questionCursor}
                  totalQuestions={pendingQuestions.length}
                  onAnswer={handleAnswerDisambiguation}
                />
              )}

              {/* Results Summary Sheet (Screenshot 05) */}
              {screen === 'results' && !selectedItem && !showPaidSheet && !showNearbySheet && (
                <ResultsSheet
                  lang={lang}
                  items={evaluatedItems}
                  contextBar={
                    showContextBar ? (
                      <ContextBar
                        lang={lang}
                        venue={venue}
                        area={area}
                        venueGuessed={!venueOverride && Boolean(currentPerception?.venue_type)}
                        onChange={handleContextChange}
                        onLocate={handleLocate}
                      />
                    ) : undefined
                  }
                  onSelectItem={(item) => {
                    if (item.judgment.quoted_vnd === null) {
                      setScreen('quick_quote');
                    } else {
                      setSelectedItem(item);
                      setShowNearbySheet(false);
                    }
                  }}
                  onOpenHowWeKnow={(item) => {
                    setHowWeKnowItem(item);
                  }}
                />
              )}

              {/* Verdict / Item Detail Sheet (Screenshot 06) */}
              {screen === 'results' && selectedItem && !showPaidSheet && !showNearbySheet && (
                <VerdictSheet
                  lang={lang}
                  item={selectedItem}
                  areaName={currentPerception?.maps_context?.area_name}
                  locationAllowed={locationKnown || demoMode}
                  onClose={() => setSelectedItem(null)}
                  onOpenSayIt={() => setScreen('say_it')}
                  onOpenPaidPrompt={() => setShowPaidSheet(true)}
                  onOpenNearby={() => setShowNearbySheet(true)}
                  onOpenHowWeKnow={() => setHowWeKnowItem(selectedItem)}
                />
              )}

              {/* Nearby Options Sheet (Screenshot 08) */}
              {screen === 'results' && selectedItem && showNearbySheet && (
                <NearbySheet
                  lang={lang}
                  item={selectedItem}
                  demoMode={demoMode}
                  locationAllowed={locationKnown || demoMode}
                  userCoords={userCoords}
                  areaName={currentPerception?.maps_context?.area_name}
                  onClose={() => setShowNearbySheet(false)}
                  onRequestLocation={handleLocate}
                />
              )}

              {/* What Did You Pay Sheet */}
              {screen === 'results' && selectedItem && showPaidSheet && !showNearbySheet && (
                <WhatDidYouPaySheet
                  lang={lang}
                  item={selectedItem}
                  stamps={stamps}
                  onClose={() => setShowPaidSheet(false)}
                  onSubmitPaid={handleSubmitPaidReport}
                />
              )}

              {/* "How we know" Drawer (Screenshot 07) */}
              {screen === 'results' && howWeKnowItem && (
                <HowWeKnowSheet
                  lang={lang}
                  item={howWeKnowItem}
                  trace={currentPerception?.trace ?? []}
                  area={area}
                  mapsContext={currentPerception?.maps_context}
                  userConfirmedRefId={userConfirmations[howWeKnowItem.index]}
                  onClose={() => setHowWeKnowItem(null)}
                />
              )}
            </div>
          )}
        </main>

        {/* DESKTOP COMPANION PANEL (Visible on large screens >=1024px) */}
        <DesktopPanel
          lang={lang}
          onTrySample={(kind) => {
            setOnboardingDone(true);
            setDemoMode(true);
            setUploadedImage(null);
            setUserConfirmations({});
            setBottomMode(kind);
            startPipelineScan({ overrideSample: kind, forceDemo: true });
          }}
          onQuickQuote={(refId) => {
            setOnboardingDone(true);
            setQuoteRefId(refId);
            setBottomMode('quick');
            setScreen('quick_quote');
          }}
        />
      </div>
    </div>
  );
}
