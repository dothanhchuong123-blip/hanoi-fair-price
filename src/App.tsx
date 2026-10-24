import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  Image as ImageIcon,
  MapPin,
  Share,
  X,
  Zap,
} from 'lucide-react';
import { isInOldQuarter } from './agent/context';
import { getAllReferences } from './agent/lookup';
import { evaluateItems, runPipeline } from './agent/pipeline';
import {
  AreaType,
  ConfirmationQuestion,
  EvaluatedItem,
  NormalizedItem,
  PerceptionResult,
  PipelineProgressEvent,
  PriceReference,
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
import { VerdictSheet } from './components/VerdictSheet';
import { WhatDidYouPaySheet } from './components/WhatDidYouPaySheet';
import { Chip, IconButton } from './components/ui';
import { formatShortVnd } from './lib/parsePrice';
import {
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

export default function App() {
  const [lang, setLang] = useState<'en' | 'vi'>('en');
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [bottomMode, setBottomMode] = useState<BottomMode>('menu');
  const [screen, setScreen] = useState<ScreenState>(() =>
    getOnboardingDone() ? 'camera_home' : 'onboarding'
  );

  // Pipeline & results state
  const [progress, setProgress] = useState<PipelineProgressEvent | null>(null);
  const [currentPerception, setCurrentPerception] = useState<PerceptionResult | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<ConfirmationQuestion[]>([]);
  const [userConfirmations, setUserConfirmations] = useState<Record<number, string | 'none'>>({});
  const [evaluatedItems, setEvaluatedItems] = useState<EvaluatedItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<EvaluatedItem | null>(null);
  const [notRelevantMessage, setNotRelevantMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

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
  const [venueOverride, setVenueOverride] = useState<VenueType | null>(null);
  const [showContextBar, setShowContextBar] = useState(false);

  // Crowd report & passport state
  const [showPaidSheet, setShowPaidSheet] = useState(false);
  const [stamps, setStamps] = useState<PassportStamp[]>(() => getPassportStamps());
  const [stampToast, setStampToast] = useState<{ street: string; emoji: string; count: number } | null>(
    null
  );

  useEffect(() => {
    setStamps(getPassportStamps());
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

  const startPipelineScan = async (options?: {
    overrideSample?: 'menu' | 'stall';
    forceDemo?: boolean;
    imageBase64?: string;
    mimeType?: string;
    existingPerception?: PerceptionResult;
    confirmations?: Record<number, string | 'none'>;
  }) => {
    setNotRelevantMessage(null);
    setScanError(null);
    setSelectedItem(null);
    setShowPaidSheet(false);
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
        imageBase64: imgToUse,
        mimeType: options?.mimeType || uploadedMime,
        existingPerception: options?.existingPerception,
        userConfirmations: options?.confirmations || {},
        stepDelayMs: 110,
        context: { area, ...(venueOverride ? { venue: venueOverride } : {}) },
        onProgress: (ev) => {
          setProgress(ev);
        },
      });

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
        setScreen('disambiguation');
        return;
      }

      setEvaluatedItems(result.evaluatedItems);
      setScreen('results');
    } catch (err) {
      console.error('Price check failed', err);
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      setScreen('camera_home');
      setScanError(
        offline
          ? lang === 'en'
            ? "You're offline, so we couldn't read this photo. Try again when connected, or switch on Demo."
            : 'Bạn đang mất mạng nên chưa đọc được ảnh. Hãy thử lại khi có mạng, hoặc bật Demo.'
          : lang === 'en'
          ? "We couldn't read this photo right now. Please try again."
          : 'Hiện chưa đọc được ảnh này. Bạn thử lại nhé.'
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
    const activeQuestion = pendingQuestions[0];
    if (!activeQuestion || !currentPerception) return;

    const updatedConfirmations = {
      ...userConfirmations,
      [activeQuestion.item_index]: chosenRefId,
    };
    setUserConfirmations(updatedConfirmations);

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
    setUploadedImage(null);
    setSelectedItem(null);
    setShowPaidSheet(false);
    setUserConfirmations({});
    setPendingQuestions([]);
    setNotRelevantMessage(null);
    setScanError(null);
    setScreen('camera_home');
  };

  const catalog = getAllReferences();

  return (
    <div className="min-h-screen w-full bg-[#E5E1D8] text-ink flex justify-center items-start lg:py-6 lg:px-8">
      <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8">
        {/* MOBILE PHONE FRAME (Full bleed at 375px-430px, framed on desktop) */}
        <main
          aria-label="Chợ Price Lens mobile app"
          className="relative w-full max-w-[430px] lg:w-[390px] min-h-screen lg:min-h-[844px] lg:max-h-[860px] lg:rounded-[44px] lg:shadow-[0_24px_70px_rgba(0,0,0,0.28)] lg:border-[8px] lg:border-ink overflow-hidden flex flex-col camera-bg shrink-0"
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

                  <Chip variant="glass">
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

              {/* Friendly Not Relevant Toast */}
              {notRelevantMessage && (
                <div className="absolute top-[74px] left-4 right-4 bg-warn-soft text-ink px-4 py-3 rounded-[14px] text-[14px] font-semibold flex items-center justify-between shadow-lg z-40">
                  <span>{notRelevantMessage}</span>
                  <button
                    type="button"
                    onClick={() => setNotRelevantMessage(null)}
                    className="ml-2 p-1 text-ink-2 cursor-pointer"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {scanError && (
                <div
                  role="alert"
                  className="absolute top-[74px] left-4 right-4 bg-bad-soft text-ink px-4 py-3 rounded-[14px] text-[14px] font-semibold shadow-lg z-40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span>{scanError}</span>
                    <button
                      type="button"
                      onClick={() => setScanError(null)}
                      aria-label="Dismiss"
                      className="p-1 text-ink-2 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {uploadedImage && (
                    <button
                      type="button"
                      onClick={() => startPipelineScan()}
                      className="mt-2 underline font-bold text-bad cursor-pointer"
                    >
                      {lang === 'en' ? 'Try again' : 'Thử lại'}
                    </button>
                  )}
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
                    {uploadedImage ? (
                      <UploadedPhotoCanvas
                        imageDataUrl={uploadedImage}
                        mode={screen === 'scanning' ? 'scanning' : 'results'}
                        lang={lang}
                        perceivedItems={progress?.perceivedItems}
                        evaluatedItems={evaluatedItems}
                        onSelectItem={(item) => {
                          setSelectedItem(item);
                          setShowPaidSheet(false);
                        }}
                      />
                    ) : currentSampleType === 'stall' ? (
                      <SampleStallBasket
                        mode={screen === 'scanning' ? 'scanning' : 'results'}
                        lang={lang}
                        evaluatedItems={evaluatedItems}
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
              {screen === 'disambiguation' && pendingQuestions[0] && (
                <DisambiguationSheet
                  lang={lang}
                  question={pendingQuestions[0]}
                  questionIndex={0}
                  totalQuestions={pendingQuestions.length}
                  onAnswer={handleAnswerDisambiguation}
                />
              )}

              {/* Results Summary Sheet (Screenshot 05) */}
              {screen === 'results' && !selectedItem && !showPaidSheet && (
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
                    }
                  }}
                />
              )}

              {/* Verdict / Item Detail Sheet (Screenshot 06) */}
              {screen === 'results' && selectedItem && !showPaidSheet && (
                <VerdictSheet
                  lang={lang}
                  item={selectedItem}
                  onClose={() => setSelectedItem(null)}
                  onOpenSayIt={() => setScreen('say_it')}
                  onOpenPaidPrompt={() => setShowPaidSheet(true)}
                />
              )}

              {/* What Did You Pay Sheet */}
              {screen === 'results' && selectedItem && showPaidSheet && (
                <WhatDidYouPaySheet
                  lang={lang}
                  item={selectedItem}
                  stamps={stamps}
                  onClose={() => setShowPaidSheet(false)}
                  onSubmitPaid={handleSubmitPaidReport}
                />
              )}
            </div>
          )}
        </main>

        {/* DESKTOP COMPANION PANEL (Visible on large screens >=1024px) */}
        <aside className="hidden lg:flex flex-col flex-1 max-w-xl bg-bg text-ink rounded-[28px] p-7 shadow-lg border border-line">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h2 className="font-display text-[26px] leading-tight text-ink">
                Chợ Price Lens · Phố cổ Hà Nội
              </h2>
              <p className="text-[14px] text-ink-2 mt-0.5">
                {lang === 'en'
                  ? 'Spatial-AI street food, drink & fruit price guide for Hanoi Old Quarter'
                  : 'Trợ lý AI kiểm tra giá đồ ăn đường phố & hoa quả tại Phố cổ Hà Nội'}
              </p>
            </div>
            <span className="text-[12.5px] font-bold text-ink-2 bg-surface-2 px-3 py-1.5 rounded-full whitespace-nowrap tabular-nums">
              {catalog.length} Hanoi items
            </span>
          </div>

          {/* Interactive Scenario Switcher */}
          <div className="mt-5">
            <h3 className="font-bold text-[12px] uppercase tracking-wider text-ink-3 mb-2.5">
              {lang === 'en' ? 'Interactive Demo Scenarios' : 'Kịch bản thử nghiệm nhanh'}
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setOnboardingDone(true);
                  setDemoMode(true);
                  setUploadedImage(null);
                  setBottomMode('menu');
                  startPipelineScan({ overrideSample: 'menu', forceDemo: true });
                }}
                className="bg-surface hover:bg-surface-2 border border-line rounded-[16px] p-3 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-[14.5px] text-ink">Sample Menu</div>
                <div className="text-[12.5px] text-ink-2 mt-0.5">
                  7 dishes · 2 high, 1 a bit high, 3 fair
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOnboardingDone(true);
                  setDemoMode(true);
                  setUploadedImage(null);
                  setBottomMode('stall');
                  setUserConfirmations({});
                  startPipelineScan({ overrideSample: 'stall', forceDemo: true });
                }}
                className="bg-surface hover:bg-surface-2 border border-line rounded-[16px] p-3 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-[14.5px] text-ink">Sample Stall</div>
                <div className="text-[12.5px] text-ink-2 mt-0.5">
                  Xoài 80k/kg · human-in-the-loop check
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOnboardingDone(true);
                  setBottomMode('quick');
                  setScreen('quick_quote');
                }}
                className="bg-surface hover:bg-surface-2 border border-line rounded-[16px] p-3 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-[14.5px] text-ink">Quick Quote</div>
                <div className="text-[12.5px] text-ink-2 mt-0.5">
                  No photo · instant numpad & unit converter
                </div>
              </button>
            </div>
          </div>

          {/* Reference Catalog Table */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-[12px] uppercase tracking-wider text-ink-3">
                {lang === 'en'
                  ? 'Hanoi Old Quarter Reference Catalog'
                  : 'Bảng giá tham khảo Phố cổ Hà Nội'}
              </h3>
              <span className="text-[12px] text-ink-3">1 lạng = 100g · 1 cân = 1 kg</span>
            </div>

            <div className="max-h-[410px] overflow-y-auto rounded-[18px] bg-surface border border-line divide-y divide-line">
              {catalog.map((ref) => (
                <div
                  key={ref.id}
                  onClick={() => handleQuickQuoteCheck(ref, ref.median_vnd, ref.unit)}
                  className="px-4 py-2.5 flex items-center justify-between text-[14px] hover:bg-surface-2/60 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[18px]">{ref.emoji || '🍜'}</span>
                    <div>
                      <span className="font-bold text-ink">{ref.name_vi}</span>
                      <span className="text-ink-2 ml-2">{ref.name_en}</span>
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <span className="font-bold text-fair">
                      {formatShortVnd(ref.low_vnd)}–{formatShortVnd(ref.high_vnd)}
                    </span>
                    <span className="text-ink-3 text-[12.5px] ml-1">/{ref.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Safety note */}
          <p className="text-[12.5px] text-ink-3 mt-4 pt-3 border-t border-line">
            {lang === 'en'
              ? 'Prices are estimates for guidance only. Photos are processed in-memory and never stored.'
              : 'Giá chỉ mang tính tham khảo. Ảnh chụp chỉ xử lý tức thời và không bao giờ lưu trữ.'}
          </p>
        </aside>
      </div>
    </div>
  );
}
