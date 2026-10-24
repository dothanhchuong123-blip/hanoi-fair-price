import React, { useState } from 'react';
import { EvaluatedItem } from '../agent/types';

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

  // Screen 9: Full-screen landscape phrase card ("Show the seller")
  if (showSellerFullscreen) {
    const cleanEnglish = resp.phrase_en.replace(/^[“"]|[”"]$/g, '');
    return (
      <div
        data-testid="show-seller-fullscreen"
        className="fixed inset-0 z-50 bg-[#F6EFE1] text-[#2A2118] flex flex-col justify-center px-7 sm:px-14 py-8 select-none"
      >
        <button
          type="button"
          onClick={() => setShowSellerFullscreen(false)}
          aria-label="Close full-screen phrase"
          className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white border border-[#E4D9C5] shadow-sm flex items-center justify-center text-[#2A2118] cursor-pointer hover:bg-[#FAF5EB]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="max-w-3xl">
          <div className="text-[#2F6B4F] font-bold text-[18px] tracking-wider uppercase flex items-center gap-2">
            <span>XIN CHÀO</span>
            <span>👋</span>
          </div>

          <h1 className="font-display text-[44px] sm:text-[58px] leading-[1.08] text-[#2A2118] mt-3 mb-4">
            {resp.phrase_vi}
          </h1>

          <p className="text-[19px] sm:text-[22px] text-[#6B5E4E] font-medium">
            {cleanEnglish} · Cảm ơn ạ 🙏
          </p>
        </div>
      </div>
    );
  }

  // Screen 5: Say it phrase card view
  return (
    <div
      data-testid="say-it-view"
      className="w-full min-h-full bg-[#F6EFE1] text-[#2A2118] flex flex-col px-5 pt-4 pb-6"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to verdict"
          className="w-11 h-11 rounded-full bg-white border border-[#E4D9C5] shadow-xs flex items-center justify-center text-[19px] text-[#2A2118] cursor-pointer"
        >
          ←
        </button>

        <h1 className="font-display text-[23px] text-[#2A2118]">
          {lang === 'en' ? 'Say it' : 'Câu giao tiếp'}
        </h1>

        <button
          type="button"
          onClick={() => setSlowMode((prev) => !prev)}
          aria-label={slowMode ? 'Slow pronunciation active' : 'Toggle slow pronunciation'}
          aria-pressed={slowMode}
          className={`w-11 h-11 rounded-full flex items-center justify-center text-[20px] transition-all cursor-pointer ${
            slowMode
              ? 'bg-[#FBF0D4] border-2 border-[#E3A82B] shadow-xs'
              : 'bg-white border border-[#E4D9C5] shadow-xs'
          }`}
        >
          🐢
        </button>
      </div>

      {/* Cultural Tip Box */}
      <div className="bg-[#FBF0D4] rounded-[18px] p-4 flex items-start gap-3 text-[14.5px] leading-snug text-[#2A2118] mb-5">
        <span className="text-[18px] shrink-0 mt-0.5">💡</span>
        <p>
          {lang === 'en' ? (
            <>
              <strong className="font-bold">Street food usually has fixed prices.</strong>{' '}
              {resp.tip_en.replace(/^Street food usually has fixed prices\.\s*/i, '')}
            </>
          ) : (
            resp.tip_vi
          )}
        </p>
      </div>

      {/* Hanoi-Green Phrase Card (#2F6B4F) matching Screen 5 */}
      <div className="relative bg-[#2F6B4F] text-white rounded-[26px] p-6 pb-7 shadow-[0_5px_0_#1F4A36] mb-8">
        <div className="text-[13px] font-bold tracking-wider uppercase text-[#A7CDBD]">
          {lang === 'en' ? resp.phrase_header_en : resp.phrase_header_vi}
        </div>

        <div className="font-display text-[32px] leading-[1.15] text-white mt-2">
          {resp.phrase_vi}
        </div>

        <div className="italic text-[16px] text-[#D7ECE2] mt-3 pb-3.5 border-b border-white/20">
          {resp.pronunciation}
        </div>

        <div className="text-[17.5px] text-white mt-3.5 pr-16 leading-snug">
          {resp.phrase_en}
        </div>

        {/* Floating Mustard Play Button */}
        <button
          type="button"
          onClick={() => speakVietnamese(resp.phrase_vi)}
          aria-label="Play Vietnamese pronunciation"
          className={`btn-mustard w-[62px] h-[62px] rounded-full absolute -bottom-5 right-5 flex items-center justify-center text-[#2A2118] cursor-pointer ${
            speakingText === resp.phrase_vi ? 'scale-105 ring-4 ring-white/50' : ''
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
            <path d="M6 4l15 8-15 8V4z" />
          </svg>
        </button>
      </div>

      {/* More phrases */}
      <div className="mb-6">
        <h2 className="font-bold text-[15.5px] text-[#6B5E4E] mb-2.5">
          {lang === 'en' ? 'More phrases' : 'Các câu hữu ích khác'}
        </h2>

        <div className="space-y-2.5">
          {resp.more_phrases.map((mp, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => speakVietnamese(mp.vi)}
              className="w-full bg-[#FCF9F2] hover:bg-white rounded-[18px] p-3.5 flex items-center justify-between text-left border border-[#EBE1CE] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 pr-2">
                <span className="text-[22px] shrink-0">{mp.icon}</span>
                <div>
                  <div className="font-bold text-[16px] text-[#2A2118] leading-snug">
                    {mp.vi}
                  </div>
                  <div className="text-[13.5px] text-[#6B5E4E] mt-0.5">
                    {mp.en}
                  </div>
                </div>
              </div>
              <span className="text-[20px] shrink-0" aria-hidden="true">
                🔊
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom CTA: Show the seller */}
      <div className="mt-auto pt-2">
        <button
          type="button"
          onClick={() => setShowSellerFullscreen(true)}
          className="btn-shutter w-full h-[56px] rounded-[18px] font-bold text-[18px] flex items-center justify-center gap-2.5 cursor-pointer"
        >
          <span>📱</span>
          <span>{lang === 'en' ? 'Show the seller' : 'Đưa màn hình cho người bán'}</span>
        </button>
      </div>
    </div>
  );
};
