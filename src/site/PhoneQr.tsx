import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** The address phones should open: this site's own origin, straight into the camera */
export function appUrl(): string {
  if (typeof window === 'undefined') return 'https://ch-price-lens.ai.studio/#/app';
  return `${window.location.origin}${window.location.pathname}#/app`;
}

/** A crisp, scalable QR code drawn as SVG rects */
export const QrCode: React.FC<{ value: string; className?: string }> = ({ value, className = 'w-36 h-36' }) => {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { size: n, path: d };
  }, [value]);

  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} className={className} role="img" aria-label={`QR code for ${value}`}>
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      <path d={path} fill="#14110F" shapeRendering="crispEdges" />
    </svg>
  );
};

/** "Made for your phone" card with the QR code, shown on laptops */
export const PhoneQrCard: React.FC<{ lang: 'en' | 'vi'; className?: string }> = ({ lang, className = '' }) => {
  const url = appUrl();
  const shortUrl = url.replace(/^https?:\/\//, '').replace(/\/?#\/app$/, '');
  return (
    <div className={`flex items-center gap-5 bg-surface rounded-[24px] border border-line p-4 pr-6 shadow-card ${className}`}>
      <div className="rounded-[14px] border border-line p-1.5 bg-white shrink-0">
        <QrCode value={url} className="w-[112px] h-[112px]" />
      </div>
      <div className="min-w-0">
        <div className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-brand">
          {lang === 'en' ? 'Made for your phone' : 'Dành cho điện thoại'}
        </div>
        <div className="font-serif text-[22px] leading-[1.15] text-ink mt-1">
          {lang === 'en' ? 'Scan to open it at the stall' : 'Quét để mở ngay tại quầy'}
        </div>
        <div className="text-[13px] text-ink-2 mt-1.5 leading-snug">
          {lang === 'en'
            ? 'Point your camera here. No app store, no sign-up.'
            : 'Hướng camera vào đây. Không cần tải app, không cần đăng ký.'}
        </div>
        <div className="text-[12px] text-ink-3 mt-1 truncate">{shortUrl}</div>
      </div>
    </div>
  );
};
