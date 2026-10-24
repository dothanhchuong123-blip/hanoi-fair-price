import React, { useState } from 'react';
import { X } from 'lucide-react';
import { EvaluatedItem } from '../agent/types';
import { formatShortVnd, parsePrice } from '../lib/parsePrice';
import { PassportStamp } from '../lib/storage';
import { Button, IconButton, Sheet } from './ui';

interface WhatDidYouPaySheetProps {
  lang: 'en' | 'vi';
  item: EvaluatedItem;
  stamps: PassportStamp[];
  onClose: () => void;
  onSubmitPaid: (paidVnd: number) => void;
}

export const WhatDidYouPaySheet: React.FC<WhatDidYouPaySheetProps> = ({
  lang,
  item,
  stamps,
  onClose,
  onSubmitPaid,
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState('');

  const ref = item.reference;
  const nameVi = (ref?.name_vi || item.perceived.name_vi).toLowerCase();

  const option1Vnd = ref ? Math.round((ref.median_vnd + 5000) / 10000) * 10000 : 60000;
  const option2Vnd = item.judgment.quoted_vnd || 120000;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parsePrice(customText);
    if (parsed.price_vnd && parsed.price_vnd > 0) {
      onSubmitPaid(parsed.price_vnd);
    }
  };

  const slots = [0, 1, 2, 3, 4].map((idx) => stamps[idx] || null);

  return (
    <Sheet data-testid="what-did-you-pay-sheet" className="pb-6 z-40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-[23px] leading-tight text-ink">
            {lang === 'en' ? 'What did you pay?' : 'Bạn đã trả bao nhiêu?'}
          </h2>
          <p className="text-[14px] text-ink-2 mt-0.5">
            {lang === 'en'
              ? `For ${nameVi} · anonymous · no photo saved`
              : `Cho món ${nameVi} · ẩn danh · không lưu ảnh`}
          </p>
        </div>

        <IconButton variant="default" onClick={onClose} aria-label="Close">
          <X className="w-4 h-4 text-ink" />
        </IconButton>
      </div>

      {/* 3 Quick Price Buttons */}
      <div className="grid grid-cols-3 gap-2.5 mt-4">
        <Button
          variant="secondary"
          size="md"
          onClick={() => onSubmitPaid(option1Vnd)}
          className="text-[18px] font-bold tabular-nums"
        >
          {formatShortVnd(option1Vnd)}
        </Button>

        <Button
          variant="primary"
          size="md"
          onClick={() => onSubmitPaid(option2Vnd)}
          className="text-[18px] font-bold tabular-nums"
        >
          {formatShortVnd(option2Vnd)}
        </Button>

        <Button
          variant="secondary"
          size="md"
          onClick={() => setShowCustomInput((prev) => !prev)}
          className="text-[16px] font-bold"
        >
          {lang === 'en' ? 'Other' : 'Khác'}
        </Button>
      </div>

      {showCustomInput && (
        <form onSubmit={handleCustomSubmit} className="mt-3 flex gap-2">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={lang === 'en' ? 'e.g. 55k or 55.000đ' : 'VD: 55k hoặc 55.000đ'}
            className="flex-1 h-[44px] px-3.5 rounded-full bg-surface border border-line text-[15px] text-ink focus:outline-none focus:border-brand"
          />
          <Button type="submit" variant="brand" size="sm" className="h-[44px] px-5">
            {lang === 'en' ? 'Save' : 'Lưu'}
          </Button>
        </form>
      )}

      {/* My Phố cổ passport */}
      <div className="mt-5">
        <div className="font-bold text-[13.5px] text-ink-2 mb-2.5">
          {lang === 'en' ? 'My Phố cổ passport' : 'Hộ chiếu Phố cổ của tôi'}
        </div>

        <div className="flex items-center justify-between gap-2">
          {slots.map((stamp, idx) => (
            <div
              key={idx}
              title={stamp ? stamp.street : undefined}
              className={`w-[54px] h-[54px] rounded-full flex items-center justify-center border-2 border-dashed ${
                stamp
                  ? 'border-brand bg-brand-soft text-[24px]'
                  : 'border-line bg-surface-2 text-ink-3 font-bold text-[18px]'
              }`}
            >
              {stamp ? stamp.emoji : '?'}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
};
