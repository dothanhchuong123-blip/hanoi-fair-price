import React, { useState } from 'react';
import { EvaluatedItem } from '../agent/types';
import { formatShortVnd, parsePrice } from '../lib/parsePrice';
import { PassportStamp } from '../lib/storage';

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

  // First button: typical/fair price (e.g. 60k in Screen 8); Second button: quoted price (e.g. 120k)
  const option1Vnd = ref ? Math.round((ref.median_vnd + 5000) / 10000) * 10000 : 60000;
  const option2Vnd = item.judgment.quoted_vnd || 120000;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parsePrice(customText);
    if (parsed.price_vnd && parsed.price_vnd > 0) {
      onSubmitPaid(parsed.price_vnd);
    }
  };

  // Display 5 passport stamp slots matching Screen 8
  const slots = [0, 1, 2, 3, 4].map((idx) => stamps[idx] || null);

  return (
    <div
      data-testid="what-did-you-pay-sheet"
      className="w-full bg-[#F6EFE1] rounded-t-[28px] pt-3 pb-6 px-5 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] z-40"
    >
      {/* Grab handle */}
      <div className="w-11 h-1.5 rounded-full bg-[#CFC4B0] mx-auto mb-3" />

      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-[28px] leading-tight text-[#2A2118]">
            {lang === 'en' ? 'What did you pay?' : 'Bạn đã trả bao nhiêu?'}
          </h2>
          <p className="text-[14.5px] text-[#6B5E4E] mt-0.5">
            {lang === 'en'
              ? `For ${nameVi} · anonymous · no photo saved`
              : `Cho món ${nameVi} · ẩn danh · không lưu ảnh`}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full bg-white border border-[#E4D9C5] flex items-center justify-center text-[#2A2118] cursor-pointer"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 3 Quick Price Buttons matching Screen 8 */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <button
          type="button"
          onClick={() => onSubmitPaid(option1Vnd)}
          className="btn-paper h-[56px] rounded-[18px] font-display text-[21px] text-[#2A2118] cursor-pointer"
        >
          {formatShortVnd(option1Vnd)}
        </button>

        <button
          type="button"
          onClick={() => onSubmitPaid(option2Vnd)}
          className="btn-mustard h-[56px] rounded-[18px] font-display text-[21px] text-[#2A2118] cursor-pointer"
        >
          {formatShortVnd(option2Vnd)}
        </button>

        <button
          type="button"
          onClick={() => setShowCustomInput((prev) => !prev)}
          className="btn-paper h-[56px] rounded-[18px] font-display text-[20px] text-[#2A2118] cursor-pointer"
        >
          {lang === 'en' ? 'Other' : 'Khác'}
        </button>
      </div>

      {showCustomInput && (
        <form onSubmit={handleCustomSubmit} className="mt-3 flex gap-2">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={lang === 'en' ? 'e.g. 55k or 55.000đ' : 'VD: 55k hoặc 55.000đ'}
            className="flex-1 h-[46px] px-3.5 rounded-[14px] bg-white border border-[#DFD3BC] text-[15px] text-[#2A2118] focus:outline-none focus:border-[#E3A82B]"
          />
          <button
            type="submit"
            className="btn-mustard px-5 h-[46px] rounded-[14px] font-bold text-[15px] cursor-pointer"
          >
            {lang === 'en' ? 'Save' : 'Lưu'}
          </button>
        </form>
      )}

      {/* My Phố cổ passport */}
      <div className="mt-5">
        <div className="font-bold text-[15px] text-[#6B5E4E] mb-2.5">
          {lang === 'en' ? 'My Phố cổ passport' : 'Hộ chiếu Phố cổ của tôi'}
        </div>

        <div className="flex items-center justify-between gap-2">
          {slots.map((stamp, idx) => (
            <div
              key={idx}
              title={stamp ? stamp.street : undefined}
              className={`w-[56px] h-[56px] rounded-full flex items-center justify-center border-[2.5px] border-dashed ${
                stamp
                  ? 'border-[#E3A82B] bg-[#FCF9F2] text-[25px] animate-stamp-thunk'
                  : 'border-[#D5CBB8] bg-[#F2E9D8]/60 text-[#BEB39E] font-display text-[22px]'
              }`}
            >
              {stamp ? stamp.emoji : '?'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
