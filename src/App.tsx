import React, { useEffect, useRef, useState } from 'react';
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
import { ContextBar } from './components/ContextBar';
import { AgentWorkingSheet } from './components/AgentWorkingSheet';
import { CameraViewfinder, CameraViewfinderHandle } from './components/CameraViewfinder';
import { DisambiguationSheet } from './components/DisambiguationSheet';
import { QuickQuoteView } from './components/QuickQuoteView';
import { ResultsSheet } from './components/ResultsSheet';
import {
  SampleMenuBoard,
  SampleStallBasket,
  UploadedPhotoCanvas,
  VERDICT_STYLES,
} from './components/SamplePhotos';
import { SayItView } from './components/SayItView';
import { VerdictSheet } from './components/VerdictSheet';
import { WhatDidYouPaySheet } from './components/WhatDidYouPaySheet';
import { cropPhotoToDocument } from './lib/detectDocument';
import { formatShortVnd } from './lib/parsePrice';
import { getPassportStamps, PassportStamp, saveCrowdReport } from './lib/storage';

type ScreenState =
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
  const [screen, setScreen] = useState<ScreenState>('camera_home');

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

  // Price context: the venue starts from Gemini's guess, the user can override both
  const [area, setArea] = useState<AreaType>('old_quarter');
  const [venueOverride, setVenueOverride] = useState<VenueType | null>(null);

  // Crowd report & passport state
  const [showPaidSheet, setShowPaidSheet] = useState(false);
  const [stamps, setStamps] = useState<PassportStamp[]>(() => getPassportStamps());
  const [stampToast, setStampToast] = useState<{ street: string; emoji: string; count: number } | null>(
    null
  );

  useEffect(() => {
    setStamps(getPassportStamps());
  }, []);

  const venue: VenueType = venueOverride ?? currentPerception?.venue_type ?? 'street';

  const currentSampleType: 'menu' | 'stall' | 'upload' = uploadedImage
    ? 'upload'
    : bottomMode === 'stall'
    ? 'stall'
    : 'menu';

  const startPipelineScan = async (options?: {
    overrideSample?: 'menu' | 'stall';
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
    if (!options?.existingPerception) setProgress(null);
    setScreen('scanning');

    const sampleToUse = options?.overrideSample || (bottomMode === 'stall' ? 'stall' : 'menu');
    const imgToUse = options?.imageBase64 ?? uploadedImage ?? undefined;
    const isDemo = demoMode && !imgToUse;

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
      // Never substitute sample results for a real photo: say what went wrong instead.
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
    const reader = new FileReader();
    reader.onload = async () => {
      // Crop to the menu sheet when one is clearly visible: smaller upload, fewer stray items
      const { dataUrl } = await cropPhotoToDocument(reader.result as string);
      setUploadedImage(dataUrl);
      setUploadedMime('image/jpeg');
      setUserConfirmations({});
      setVenueOverride(null);
      startPipelineScan({ imageBase64: dataUrl, mimeType: 'image/jpeg' });
    };
    reader.readAsDataURL(file);
    // Allow picking the same file again
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

  /** Re-judges the current results for a new place type / area. Local and instant: no new photo read. */
  const handleContextChange = async (nextVenue: VenueType, nextArea: AreaType) => {
    setVenueOverride(nextVenue);
    setArea(nextArea);
    const next = await evaluateItems(
      evaluatedItems.map((e) => e.normalized),
      { area: nextArea, venue: nextVenue, date: new Date() }
    );
    setEvaluatedItems(next);
    setSelectedItem((current) => (current ? next.find((e) => e.index === current.index) ?? null : null));
  };

  const handleLocate = () =>
    new Promise<void>((resolve) => {
      if (!navigator.geolocation) {
        resolve();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handleContextChange(venue, isInOldQuarter(pos.coords.latitude, pos.coords.longitude) ? 'old_quarter' : 'elsewhere');
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
    <div className="min-h-screen w-full bg-[#15100C] text-[#2A2118] flex justify-center items-start lg:py-6 lg:px-8">
      <div className="w-full max-w-6xl flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8">
        {/* MOBILE PHONE FRAME (Full bleed at 375px-430px, framed on desktop) */}
        <main
          aria-label="Chợ Price Lens mobile app"
          className="relative w-full max-w-[430px] lg:w-[390px] min-h-screen lg:min-h-[844px] lg:max-h-[860px] lg:rounded-[40px] lg:shadow-[0_24px_70px_rgba(0,0,0,0.65)] lg:border-[6px] lg:border-[#2C2219] overflow-hidden flex flex-col camera-bg shrink-0"
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

          {/* SCREEN 5 & 9: Say It Full View */}
          {screen === 'say_it' && selectedItem ? (
            <div className="flex-1 flex flex-col bg-[#F6EFE1] overflow-y-auto">
              <SayItView
                lang={lang}
                item={selectedItem}
                onBack={() => setScreen('results')}
              />
            </div>
          ) : screen === 'quick_quote' ? (
            /* SCREEN 7: Quick Quote Full View */
            <div className="flex-1 flex flex-col bg-[#F6EFE1] overflow-y-auto">
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
              {/* Top Floating Passport Stamp Toast (Screen 8) */}
              {stampToast && (
                <div
                  data-testid="passport-stamp-toast"
                  role="status"
                  className="absolute top-14 left-4 right-4 z-50 bg-[#231B13]/95 backdrop-blur-md border border-white/15 rounded-[20px] p-3.5 flex items-center gap-3.5 text-white shadow-2xl"
                >
                  <div className="w-13 h-13 rounded-full border-[2.5px] border-dashed border-[#E3A82B] flex items-center justify-center text-[24px] shrink-0 animate-stamp-thunk">
                    {stampToast.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-[17.5px] leading-snug text-white">
                      {lang === 'en'
                        ? `Stamp collected: ${stampToast.street}!`
                        : `Đã sưu tầm dấu: ${stampToast.street}!`}
                    </div>
                    <div className="text-[13px] text-[#D7CBB8] leading-snug">
                      {lang === 'en'
                        ? `Thanks — your report helps the next visitor. ${stampToast.count} / 12 streets`
                        : `Cảm ơn bạn — báo giá giúp du khách tiếp theo. ${stampToast.count} / 12 phố`}
                    </div>
                  </div>
                </div>
              )}

              {/* TOP BAR: Camera Home vs Results Mode */}
              {screen === 'results' ? (
                <header className="px-4 pt-4 pb-2 flex items-center justify-between z-20">
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="dark-glass-pill px-4 py-2 rounded-full text-white font-bold text-[14.5px] flex items-center gap-1.5 cursor-pointer hover:bg-black/60"
                  >
                    <span>←</span>
                    <span>{lang === 'en' ? 'Retake' : 'Chụp lại'}</span>
                  </button>

                  <div className="dark-glass-pill px-4 py-2 rounded-full text-white font-bold text-[14px]">
                    {lang === 'en' ? 'Tap a tag for details' : 'Chạm vào nhãn để xem'}
                  </div>
                </header>
              ) : (
                <header className="px-3.5 pt-4 pb-2 flex items-center justify-between gap-2 z-20">
                  {/* Brand Pill */}
                  <div className="dark-glass-pill px-3.5 py-2 rounded-full flex items-center gap-1.5 shrink-0">
                    <span className="text-[15px]">🏮</span>
                    <span className="font-display text-[17px] tracking-tight leading-none text-white">
                      Chợ <span className="text-[#E3A82B]">Price</span> Lens
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* EN / VI Segmented Toggle */}
                    <div
                      role="group"
                      aria-label="Language selector"
                      className="dark-glass-pill p-1 rounded-full flex items-center text-[13px] font-bold"
                    >
                      <button
                        type="button"
                        onClick={() => setLang('en')}
                        className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                          lang === 'en' ? 'bg-white text-[#2A2118]' : 'text-white/85'
                        }`}
                      >
                        EN
                      </button>
                      <button
                        type="button"
                        onClick={() => setLang('vi')}
                        className={`px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                          lang === 'vi' ? 'bg-white text-[#2A2118]' : 'text-white/85'
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
                      className={`dark-glass-pill px-3 py-2 rounded-full text-[13px] font-bold transition-all cursor-pointer ${
                        demoMode
                          ? 'text-white ring-1 ring-[#E3A82B]/70'
                          : 'text-white/70'
                      }`}
                    >
                      Demo
                    </button>
                  </div>
                </header>
              )}

              {/* Friendly Not Relevant Toast */}
              {notRelevantMessage && (
                <div className="absolute top-[68px] left-4 right-4 bg-[#FBF0D4] text-[#2A2118] px-4 py-3 rounded-[16px] text-[14px] font-semibold flex items-center justify-between shadow-lg z-40">
                  <span>{notRelevantMessage}</span>
                  <button
                    type="button"
                    onClick={() => setNotRelevantMessage(null)}
                    className="ml-2 font-bold text-[#6B5E4E]"
                  >
                    ✕
                  </button>
                </div>
              )}

              {scanError && (
                <div
                  role="alert"
                  className="absolute top-[68px] left-4 right-4 bg-[#FBE3DF] text-[#2A2118] px-4 py-3 rounded-[16px] text-[14px] font-semibold shadow-lg z-40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span>{scanError}</span>
                    <button
                      type="button"
                      onClick={() => setScanError(null)}
                      aria-label="Dismiss"
                      className="font-bold text-[#6B5E4E] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  {uploadedImage && (
                    <button
                      type="button"
                      onClick={() => startPipelineScan()}
                      className="mt-2 underline font-bold text-[#B23A2F] cursor-pointer"
                    >
                      {lang === 'en' ? 'Try again' : 'Thử lại'}
                    </button>
                  )}
                </div>
              )}

              {/* CENTER VIEWFINDER / PHOTO STAGE */}
              <div className="relative flex-1 flex flex-col items-center justify-center px-5 py-2">
                {/* Corner Guides on Camera Home (Screen 1) */}
                {screen === 'camera_home' && (
                  <div className="relative w-full max-w-[348px] py-2">
                    {(uploadedImage || demoMode) && (
                    <>
                    {/* Top-Left Corner Guide */}
                    <div className="pointer-events-none absolute -top-1 -left-1 w-11 h-11 border-t-[4px] border-l-[4px] border-white/95 rounded-tl-[16px] z-20" />
                    {/* Top-Right Corner Guide */}
                    <div className="pointer-events-none absolute -top-1 -right-1 w-11 h-11 border-t-[4px] border-r-[4px] border-white/95 rounded-tr-[16px] z-20" />
                    {/* Bottom-Left Corner Guide */}
                    <div className="pointer-events-none absolute -bottom-1 -left-1 w-11 h-11 border-b-[4px] border-l-[4px] border-white/95 rounded-bl-[16px] z-20" />
                    {/* Bottom-Right Corner Guide */}
                    <div className="pointer-events-none absolute -bottom-1 -right-1 w-11 h-11 border-b-[4px] border-r-[4px] border-white/95 rounded-br-[16px] z-20" />
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
                      />
                    ) : (
                      <div className="relative">
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 bg-[#E3A82B] text-[#2A2118] text-[12px] font-bold px-3 py-1 rounded-full shadow-md whitespace-nowrap">
                          {lang === 'en' ? 'Demo · sample photo' : 'Demo · ảnh mẫu'}
                        </span>
                        {currentSampleType === 'stall' ? (
                          <SampleStallBasket mode="preview" lang={lang} />
                        ) : (
                          <SampleMenuBoard mode="preview" lang={lang} />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {screen !== 'camera_home' && (
                  <div className="w-full max-w-[348px] py-1">
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
                  {/* Helper instruction pill */}
                  <div className="bg-black/45 backdrop-blur-md px-4 py-1.5 rounded-full text-white/95 text-[14px] font-medium">
                    {uploadedImage
                      ? lang === 'en'
                        ? 'Tap the shutter to check this photo'
                        : 'Bấm nút chụp để kiểm tra ảnh này'
                      : lang === 'en'
                      ? 'Point at a menu, price board or stall'
                      : 'Hướng camera vào thực đơn, bảng giá hoặc quầy hàng'}
                  </div>

                  {/* Shutter Row: Gallery | Big Shutter | Flash/Sample Switch */}
                  <div className="w-full max-w-[290px] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Upload photo from gallery"
                      className="w-12 h-12 rounded-full dark-glass-pill flex items-center justify-center text-[20px] cursor-pointer hover:bg-white/15 active:scale-95 transition-transform"
                    >
                      🖼️
                    </button>

                    <button
                      type="button"
                      onClick={handleShutter}
                      aria-label="Capture and check prices"
                      className={`w-[78px] h-[78px] rounded-full p-1.5 bg-white/20 flex items-center justify-center cursor-pointer active:scale-90 transition-transform duration-150 shadow-xl ${
                        cameraLocked && !demoMode && !uploadedImage ? 'animate-shutter-glow' : ''
                      }`}
                    >
                      <span
                        className={`w-full h-full rounded-full border-[5px] block transition-colors duration-200 ${
                          cameraLocked && !demoMode && !uploadedImage ? 'border-[#E3A82B] bg-[#FCE592]' : 'border-[#E3A82B] bg-white'
                        }`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUploadedImage(null);
                        if (demoMode) {
                          setBottomMode((m) => (m === 'menu' ? 'stall' : 'menu'));
                        } else {
                          setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'));
                        }
                      }}
                      aria-label={demoMode ? 'Switch sample photo' : 'Flip camera'}
                      className="w-12 h-12 rounded-full dark-glass-pill flex items-center justify-center text-[20px] text-white cursor-pointer hover:bg-white/15 active:scale-95 transition-transform"
                    >
                      ⟲
                    </button>
                  </div>

                  {/* Bottom Mode Selector Pills: Menu · Stall · Quick quote */}
                  <nav
                    aria-label="Scan mode"
                    className="dark-glass-pill p-1.5 rounded-full flex items-center justify-between w-full max-w-[335px]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedImage(null);
                        setBottomMode('menu');
                      }}
                      className={`flex-1 py-2 px-3 rounded-full text-[14.5px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        bottomMode === 'menu'
                          ? 'bg-[#E3A82B] text-[#2A2118]'
                          : 'text-white hover:text-white/90'
                      }`}
                    >
                      <span>📋</span>
                      <span>{lang === 'en' ? 'Menu' : 'Thực đơn'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUploadedImage(null);
                        setBottomMode('stall');
                      }}
                      className={`flex-1 py-2 px-3 rounded-full text-[14.5px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        bottomMode === 'stall'
                          ? 'bg-[#E3A82B] text-[#2A2118]'
                          : 'text-white hover:text-white/90'
                      }`}
                    >
                      <span>🧺</span>
                      <span>{lang === 'en' ? 'Stall' : 'Quầy hàng'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setBottomMode('quick');
                        setScreen('quick_quote');
                      }}
                      className="flex-1 py-2 px-3 rounded-full text-[14.5px] font-bold text-white hover:text-white/90 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>🔢</span>
                      <span>{lang === 'en' ? 'Quick quote' : 'Nhập nhanh'}</span>
                    </button>
                  </nav>
                </div>
              )}

              {/* SCREEN 2: Agent Working Sheet */}
              {screen === 'scanning' && (
                <AgentWorkingSheet
                  lang={lang}
                  sampleType={currentSampleType}
                  progress={progress}
                />
              )}

              {/* SCREEN 6: Human-in-the-loop Disambiguation Sheet */}
              {screen === 'disambiguation' && pendingQuestions[0] && (
                <DisambiguationSheet
                  lang={lang}
                  question={pendingQuestions[0]}
                  questionIndex={0}
                  totalQuestions={pendingQuestions.length}
                  onAnswer={handleAnswerDisambiguation}
                />
              )}

              {/* SCREEN 3, 4, 8: Results Summary Sheet OR Verdict Sheet OR What Did You Pay Sheet */}
              {screen === 'results' && !selectedItem && !showPaidSheet && (
                <ResultsSheet
                  lang={lang}
                  items={evaluatedItems}
                  contextBar={
                    <ContextBar
                      lang={lang}
                      venue={venue}
                      area={area}
                      venueGuessed={!venueOverride && Boolean(currentPerception?.venue_type)}
                      onChange={handleContextChange}
                      onLocate={handleLocate}
                    />
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

              {screen === 'results' && selectedItem && !showPaidSheet && (
                <VerdictSheet
                  lang={lang}
                  item={selectedItem}
                  onClose={() => setSelectedItem(null)}
                  onOpenSayIt={() => setScreen('say_it')}
                  onOpenPaidPrompt={() => setShowPaidSheet(true)}
                />
              )}

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

        {/* DESKTOP COMPANION PANEL (Visible on large screens >=1024px so 1440px desktop layout is rich & informative) */}
        <aside className="hidden lg:flex flex-col flex-1 max-w-xl bg-[#F6EFE1] text-[#2A2118] rounded-[32px] p-7 shadow-2xl border border-[#DFD3BC]">
          <div className="flex items-center justify-between border-b border-[#E4D9C5] pb-4">
            <div>
              <h2 className="font-display text-[28px] leading-tight text-[#2A2118]">
                Chợ Price Lens · Phố cổ Hà Nội
              </h2>
              <p className="text-[14.5px] text-[#6B5E4E]">
                {lang === 'en'
                  ? 'Spatial-AI street food, drink & fruit price guide for Hanoi Old Quarter'
                  : 'Trợ lý AI kiểm tra giá đồ ăn đường phố & hoa quả tại Phố cổ Hà Nội'}
              </p>
            </div>
            <span className="text-[13px] font-bold text-[#2F6B4F] bg-[#DCEEE2] px-3.5 py-1.5 rounded-full whitespace-nowrap">
              {catalog.length} Hanoi items
            </span>
          </div>

          {/* Interactive Scenario Switcher */}
          <div className="mt-5">
            <h3 className="font-bold text-[14px] uppercase tracking-wider text-[#6B5E4E] mb-2.5">
              {lang === 'en' ? 'Interactive Demo Scenarios' : 'Kịch bản thử nghiệm nhanh'}
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDemoMode(true);
                  setUploadedImage(null);
                  setBottomMode('menu');
                  startPipelineScan({ overrideSample: 'menu' });
                }}
                className="bg-[#FCF9F2] hover:bg-white border border-[#DFD3BC] rounded-[16px] p-3 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-[15px] text-[#2A2118]">📋 Sample Menu</div>
                <div className="text-[12.5px] text-[#6B5E4E] mt-0.5">
                  7 dishes · 3 fair, 2 high, 2 above typical
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDemoMode(true);
                  setUploadedImage(null);
                  setBottomMode('stall');
                  setUserConfirmations({});
                  startPipelineScan({ overrideSample: 'stall' });
                }}
                className="bg-[#FCF9F2] hover:bg-white border border-[#DFD3BC] rounded-[16px] p-3 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-[15px] text-[#2A2118]">🥭 Sample Stall</div>
                <div className="text-[12.5px] text-[#6B5E4E] mt-0.5">
                  Xoài 80k/kg · asks human-in-the-loop
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBottomMode('quick');
                  setScreen('quick_quote');
                }}
                className="bg-[#FCF9F2] hover:bg-white border border-[#DFD3BC] rounded-[16px] p-3 text-left transition-all cursor-pointer"
              >
                <div className="font-bold text-[15px] text-[#2A2118]">🔢 Quick Quote</div>
                <div className="text-[12.5px] text-[#6B5E4E] mt-0.5">
                  No photo · instant numpad & unit converter
                </div>
              </button>
            </div>
          </div>

          {/* Reference Catalog Table */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-[14px] uppercase tracking-wider text-[#6B5E4E]">
                {lang === 'en'
                  ? 'Hanoi Old Quarter Reference Catalog (Oct 2026)'
                  : 'Bảng giá tham khảo Phố cổ Hà Nội (10/2026)'}
              </h3>
              <span className="text-[12.5px] text-[#6B5E4E]">1 lạng = 100g · 1 cân = 1 kg</span>
            </div>

            <div className="max-h-[410px] overflow-y-auto rounded-[18px] bg-[#FCF9F2] border border-[#EBE1CE] divide-y divide-[#EBE1CE]">
              {catalog.map((ref) => (
                <div
                  key={ref.id}
                  onClick={() => handleQuickQuoteCheck(ref, ref.median_vnd, ref.unit)}
                  className="px-4 py-2.5 flex items-center justify-between text-[14px] hover:bg-[#F6EFE1] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[18px]">{ref.emoji || '🍜'}</span>
                    <div>
                      <span className="font-bold text-[#2A2118]">{ref.name_vi}</span>
                      <span className="text-[#6B5E4E] ml-2">{ref.name_en}</span>
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <span className="font-bold text-[#2F6B4F]">
                      {formatShortVnd(ref.low_vnd)}–{formatShortVnd(ref.high_vnd)}
                    </span>
                    <span className="text-[#6B5E4E] text-[12.5px] ml-1">/{ref.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Safety note */}
          <p className="text-[12.5px] text-[#6B5E4E] mt-4 pt-3 border-t border-[#E4D9C5]">
            {lang === 'en'
              ? 'Prices are estimates for guidance only. Photos are processed in-memory and never stored.'
              : 'Giá chỉ mang tính tham khảo. Ảnh chụp chỉ xử lý tức thời và không bao giờ lưu trữ.'}
          </p>
        </aside>
      </div>
    </div>
  );
}
