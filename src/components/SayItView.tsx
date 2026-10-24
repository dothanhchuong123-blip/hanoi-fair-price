import React, { useState } from 'react';
import { ChevronLeft, Gauge, Info, Maximize2, Play, Volume2, X } from 'lucide-react';
import { EvaluatedItem } from '../agent/types';
import { Button, IconButton } from './ui';

interface SayItViewProps {
  lang: 'en' | 'vi';
  item: EvaluatedItem;
  onBack: () => void;
}

export const SayItView: React.FC<SayItViewProps> = ({ lang, item, onBack }) => {
  const [slowMode, setSlowMode] = useState(false);
  const [showSellerFullscreen, setShowSellerFullscreen] = useState(false);
  const [speakingText, setSpeakingText] = useState<string | null>(null);

  const resp = item.response;

  const speakVietnamese = (text: string) => {
    setSpeakingText(text);
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = slowMode ? 0.72 : 0.96;

        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find((v) => v.lang.toLowerCase().includes('vi'));
        if (viVoice) {
          utterance.voice = viVoice;
        }

        utterance.onend = () => setSpeakingText(null);
        utterance.onerror = () => setSpeakingText(null);
        window.speechSynthesis.speak(utterance);
        setTimeout(() => setSpeakingText(null), 2600);
      } else {
        setTimeout(() => setSpeakingText(null), 1200);
      }
    } catch {
      setTimeout(() => setSpeakingText(null), 1200);
    }
  };

  if (showSellerFullscreen) {
    const cleanEnglish = resp.phrase_en.replace(/^[“"]|[”"]$/g, '');
    return (
      <div
        data-testid="show-seller-fullscreen"
        className="fixed inset-0 z-50 bg-bg text-ink flex flex-col justify-center px-7 sm:px-14 py-8 select-none"
      >
        <IconButton
          variant="surface"
          onClick={() => setShowSellerFullscreen(false)}
          aria-label="Close full-screen phrase"
          className="absolute top-6 right-6"
        >
          <X className="w-5 h-5 text-ink" />
        </IconButton>

        <div className="max-w-3xl">
          <div className="text-brand font-bold text-[14px] tracking-wider uppercase">
            XIN CHÀO
          </div>

          <h1 className="font-display text-[42px] sm:text-[56px] leading-[1.08] text-ink mt-2 mb-4">
            {resp.phrase_vi}
          </h1>

          <p className="text-[18px] sm:text-[21px] text-ink-2 font-medium">
            {cleanEnglish} · Cảm ơn ạ
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="say-it-view"
      className="w-full min-h-full bg-bg text-ink flex flex-col px-5 pt-4 pb-6"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <IconButton
          variant="default"
          onClick={onBack}
          aria-label="Back to verdict"
        >
          <ChevronLeft className="w-5 h-5 text-ink" />
        </IconButton>

        <h1 className="font-display text-[20px] text-ink">
          {lang === 'en' ? 'Say it' : 'Câu giao tiếp'}
        </h1>

        <IconButton
          variant={slowMode ? 'brand' : 'default'}
          onClick={() => setSlowMode((prev) => !prev)}
          aria-label={slowMode ? 'Slow pronunciation active' : 'Toggle slow pronunciation'}
          aria-pressed={slowMode}
        >
          <Gauge className="w-5 h-5" />
        </IconButton>
      </div>

      {/* Cultural Tip Box */}
      <div className="bg-surface-2 rounded-[16px] p-3.5 flex items-start gap-2.5 text-[14px] leading-snug text-ink-2 mb-4">
        <Info className="w-4 h-4 text-ink-2 shrink-0 mt-0.5" />
        <p>
          {lang === 'en' ? (
            <>
              <strong className="font-semibold text-ink">Street food usually has fixed prices.</strong>{' '}
              {resp.tip_en.replace(/^Street food usually has fixed prices\.\s*/i, '')}
            </>
          ) : (
            resp.tip_vi
          )}
        </p>
      </div>

      {/* Primary Phrase Card */}
      <div className="bg-surface text-ink rounded-[24px] p-5 border border-line shadow-xs mb-6">
        <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3">
          {lang === 'en' ? resp.phrase_header_en : resp.phrase_header_vi}
        </div>

        <div className="font-display text-[28px] leading-[1.15] text-ink mt-2">
          {resp.phrase_vi}
        </div>

        <div className="text-[15px] text-ink-2 mt-2.5">
          {resp.phrase_en}
        </div>

        <div className="text-[13.5px] text-ink-3 mt-1.5 pb-4 border-b border-line">
          {resp.pronunciation}
        </div>

        <div className="pt-3.5 flex items-center justify-between">
          <span className="text-[13px] text-ink-2">
            {slowMode
              ? lang === 'en'
                ? 'Slow speed enabled'
                : 'Đang bật phát âm chậm'
              : lang === 'en'
              ? 'Tap play to hear pronunciation'
              : 'Bấm để nghe phát âm'}
          </span>

          <IconButton
            variant="brand"
            onClick={() => speakVietnamese(resp.phrase_vi)}
            aria-label="Play Vietnamese pronunciation"
            className={speakingText === resp.phrase_vi ? 'ring-4 ring-brand/25 scale-105' : ''}
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </IconButton>
        </div>
      </div>

      {/* More phrases */}
      <div className="mb-6">
        <h2 className="font-bold text-[14px] text-ink-2 mb-2.5">
          {lang === 'en' ? 'More phrases' : 'Các câu hữu ích khác'}
        </h2>

        <div className="space-y-2">
          {resp.more_phrases.map((mp, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => speakVietnamese(mp.vi)}
              className="w-full bg-surface hover:bg-surface-2 rounded-[16px] p-3.5 flex items-center justify-between text-left border border-line transition-colors cursor-pointer"
            >
              <div className="pr-3">
                <div className="font-bold text-[15.5px] text-ink leading-snug">
                  {mp.vi}
                </div>
                <div className="text-[13px] text-ink-2 mt-0.5">
                  {mp.en}
                </div>
              </div>
              <Volume2 className="w-4 h-4 text-brand shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Bottom CTA: Show the seller */}
      <div className="mt-auto pt-2">
        <Button
          variant="primary"
          size="md"
          onClick={() => setShowSellerFullscreen(true)}
          className="w-full"
        >
          <Maximize2 className="w-4 h-4" />
          <span>{lang === 'en' ? 'Show the seller' : 'Đưa màn hình cho người bán'}</span>
        </Button>
      </div>
    </div>
  );
};
