import React from 'react';
import { navigate, Route } from './router';

export const LogoMark: React.FC<{ className?: string }> = ({ className = 'w-9 h-9' }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="#C8361D" />
    <circle cx="28" cy="28" r="14" fill="#F6D776" stroke="#FAF7F2" strokeWidth="4" />
    <circle cx="28" cy="28" r="8.5" fill="none" stroke="#B8891A" strokeWidth="1.6" />
    <text
      x="28"
      y="33"
      textAnchor="middle"
      fontFamily="Georgia, serif"
      fontSize="13"
      fontWeight="700"
      fill="#8A6510"
    >
      ₫
    </text>
    <path d="M38.5 38.5 L50 50" stroke="#FAF7F2" strokeWidth="6" strokeLinecap="round" />
  </svg>
);

export const Wordmark: React.FC<{ onClick?: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick ?? (() => navigate({ page: 'home' }))}
    className="flex items-center gap-2.5 cursor-pointer"
    aria-label="Chợ Price Lens home"
  >
    <LogoMark />
    <span className="hidden sm:inline font-serif text-[20px] leading-none text-ink">
      Chợ <span className="text-brand">Price</span> Lens
    </span>
  </button>
);

export const LangToggle: React.FC<{
  lang: 'en' | 'vi';
  onChange: (l: 'en' | 'vi') => void;
}> = ({ lang, onChange }) => (
  <div
    role="group"
    aria-label="Language"
    className="p-1 rounded-full bg-surface-2 flex items-center text-[12.5px] font-bold"
  >
    {(['en', 'vi'] as const).map((l) => (
      <button
        key={l}
        type="button"
        onClick={() => onChange(l)}
        aria-pressed={lang === l}
        className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
          lang === l ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
        }`}
      >
        {l.toUpperCase()}
      </button>
    ))}
  </div>
);

interface SiteHeaderProps {
  lang: 'en' | 'vi';
  onChangeLang: (l: 'en' | 'vi') => void;
  route: Route;
  /** Hide on phones inside the app, where the camera UI has its own top bar */
  hideOnMobile?: boolean;
}

export const SiteHeader: React.FC<SiteHeaderProps> = ({ lang, onChangeLang, route, hideOnMobile }) => {
  const links: Array<{ label: string; to: Route; active: boolean }> = [
    {
      label: lang === 'en' ? 'Check prices' : 'Kiểm tra giá',
      to: { page: 'app' },
      active: route.page === 'app',
    },
    {
      label: lang === 'en' ? 'Price guide' : 'Bảng giá',
      to: { page: 'guide' },
      active: route.page === 'guide',
    },
  ];

  return (
    <header
      className={`sticky top-0 z-40 bg-bg/85 backdrop-blur-md border-b border-line/70 ${
        hideOnMobile ? 'hidden lg:block' : ''
      }`}
    >
      <div className="max-w-[1200px] mx-auto h-[68px] px-4 md:px-8 flex items-center justify-between gap-4">
        <Wordmark />
        <nav className="flex items-center gap-0.5 md:gap-1" aria-label="Main">
          {links.map((l) => (
            <button
              key={l.label}
              type="button"
              onClick={() => navigate(l.to)}
              className={`px-2.5 md:px-3.5 py-2 rounded-full text-[13px] md:text-[14px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                l.active ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {l.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <LangToggle lang={lang} onChange={onChangeLang} />
          {route.page !== 'app' && (
            <button
              type="button"
              onClick={() => navigate({ page: 'app' })}
              className="hidden sm:inline-flex h-[40px] px-4 items-center rounded-full bg-ink text-white text-[14px] font-semibold hover:bg-ink/90 transition-colors cursor-pointer"
            >
              {lang === 'en' ? 'Open the app' : 'Mở ứng dụng'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
