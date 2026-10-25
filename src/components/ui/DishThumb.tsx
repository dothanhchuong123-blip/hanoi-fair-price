import React, { useState } from 'react';
import { ItemCategory } from '../../agent/types';
import { photoFor } from '../../lib/photos';

const TILE_TINT: Record<ItemCategory, string> = {
  street_food: 'bg-[#F3E3D3] text-[#8A4B22]',
  drink: 'bg-[#E9E1D6] text-[#5B4636]',
  fruit: 'bg-[#F6E7C8] text-[#8A6510]',
  vegetable: 'bg-[#E1EBD9] text-[#3F6331]',
  other: 'bg-surface-2 text-ink-2',
};

interface DishThumbProps {
  refId?: string | null;
  /** Vietnamese name, used for the alt text and the lettered fallback tile */
  name: string;
  category?: ItemCategory;
  /** Sizing, rounding and letter size, e.g. "w-12 h-12 rounded-[14px] text-[20px]" */
  className?: string;
}

/** A real photo of the dish when we have one, otherwise a quiet lettered tile */
export const DishThumb: React.FC<DishThumbProps> = ({
  refId,
  name,
  category = 'street_food',
  className = 'w-11 h-11 rounded-[12px] text-[18px]',
}) => {
  const photo = photoFor(refId);
  const [failed, setFailed] = useState(false);

  if (photo && !failed) {
    return (
      <img
        src={photo.src}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`object-cover bg-surface-2 shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center font-serif font-semibold shrink-0 select-none ${TILE_TINT[category]} ${className}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
};
