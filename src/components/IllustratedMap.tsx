import React from 'react';
import { NearbyPlace } from '../agent/types';

interface IllustratedMapProps {
  lang: 'en' | 'vi';
  center: { lat: number; lng: number };
  places: NearbyPlace[];
  /** Price label and colour for each place pin */
  pinFor: (place: NearbyPlace) => { label: string; color: string };
  selectedId?: string | null;
  onSelect?: (placeId: string) => void;
}

/** Metres covered by half the map width */
const HALF_SPAN_M = 900;
const M_PER_DEG_LAT = 111_320;

/**
 * A drawn map of the Old Quarter used whenever Google Maps can't load.
 * Pins sit at their real bearing and distance from the user, so it stays truthful.
 */
export const IllustratedMap: React.FC<IllustratedMapProps> = ({
  lang,
  center,
  places,
  pinFor,
  selectedId,
  onSelect,
}) => {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);

  const position = (place: NearbyPlace, idx: number) => {
    if (typeof place.lat === 'number' && typeof place.lng === 'number') {
      const dx = (place.lng - center.lng) * mPerDegLng;
      const dy = (place.lat - center.lat) * M_PER_DEG_LAT;
      return {
        x: Math.max(8, Math.min(92, 50 + (dx / HALF_SPAN_M) * 50)),
        y: Math.max(14, Math.min(86, 50 - (dy / HALF_SPAN_M) * 50)),
      };
    }
    // No coordinates: fan the pins out around the user by their distance
    const angle = (idx / Math.max(1, places.length)) * Math.PI * 2 - Math.PI / 3;
    const r = Math.min(40, ((place.distance_m ?? 400) / HALF_SPAN_M) * 50);
    return { x: 50 + Math.cos(angle) * r, y: 50 + Math.sin(angle) * r };
  };

  return (
    <div
      data-testid="nearby-illustrated-map"
      className="absolute inset-0 overflow-hidden bg-[#EFE8DB]"
      aria-label={lang === 'en' ? 'Map of nearby places' : 'Bản đồ các quán gần đây'}
    >
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        <defs>
          <pattern id="blocks" width="34" height="26" patternUnits="userSpaceOnUse">
            <rect width="34" height="26" fill="#EFE8DB" />
            <rect x="3" y="3" width="28" height="20" rx="3" fill="#E7DECF" />
          </pattern>
        </defs>
        <rect width="400" height="300" fill="url(#blocks)" />
        {/* Main streets of the Old Quarter, loosely traced */}
        <g stroke="#FBF8F2" strokeLinecap="round" fill="none">
          <path d="M-10 70 C 90 60, 180 82, 410 64" strokeWidth="11" />
          <path d="M-10 150 C 110 140, 230 160, 410 146" strokeWidth="9" />
          <path d="M-10 232 C 120 226, 250 240, 410 228" strokeWidth="11" />
          <path d="M92 -10 C 98 90, 84 200, 96 310" strokeWidth="9" />
          <path d="M196 -10 C 190 100, 204 200, 192 310" strokeWidth="11" />
          <path d="M300 -10 C 306 90, 296 200, 308 310" strokeWidth="8" />
          <path d="M20 -10 L 380 310" strokeWidth="6" opacity="0.8" />
        </g>
        {/* Hoàn Kiếm lake */}
        <path
          d="M268 196 C 300 178, 344 188, 352 222 C 360 258, 332 300, 300 304 C 270 306, 252 270, 256 240 C 258 220, 256 204, 268 196 Z"
          fill="#BFD6DA"
          stroke="#AECBD0"
          strokeWidth="2"
        />
        <circle cx="300" cy="236" r="4" fill="#C8361D" opacity="0.7" />
        <text
          x="306"
          y="268"
          textAnchor="middle"
          fontFamily="Fraunces, Georgia, serif"
          fontSize="11"
          fontStyle="italic"
          fill="#5E7F86"
        >
          Hồ Hoàn Kiếm
        </text>
        <text x="110" y="62" fontFamily="Be Vietnam Pro, sans-serif" fontSize="8.5" fontWeight="600" fill="#A2978A" letterSpacing="1">
          HÀNG BUỒM
        </text>
        <text x="120" y="142" fontFamily="Be Vietnam Pro, sans-serif" fontSize="8.5" fontWeight="600" fill="#A2978A" letterSpacing="1">
          HÀNG BẠC
        </text>
        <text x="206" y="40" fontFamily="Be Vietnam Pro, sans-serif" fontSize="8.5" fontWeight="600" fill="#A2978A" letterSpacing="1" transform="rotate(90 206 40)">
          HÀNG ĐÀO
        </text>
      </svg>

      {/* Place pins */}
      {places.map((place, idx) => {
        const { x, y } = position(place, idx);
        const { label, color } = pinFor(place);
        const selected = selectedId === place.place_id;
        return (
          <button
            key={place.place_id}
            type="button"
            onClick={() => onSelect?.(place.place_id)}
            className={`absolute -translate-x-1/2 -translate-y-full px-2.5 py-1 rounded-full text-white font-bold text-[12px] tabular-nums whitespace-nowrap border-2 border-white cursor-pointer transition-transform animate-float-up ${
              selected ? 'scale-110 z-20 shadow-pop' : 'z-10 shadow-card'
            }`}
            style={{ left: `${x}%`, top: `${y}%`, backgroundColor: color, animationDelay: `${idx * 60}ms` }}
            aria-label={`${place.name}, ${label}`}
          >
            {label}
          </button>
        );
      })}

      {/* You */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
        style={{ left: '50%', top: '50%' }}
      >
        <span className="absolute inset-0 rounded-full bg-[#2563EB]/40 pulse-halo" />
        <span className="relative block w-4 h-4 rounded-full bg-[#2563EB] border-[3px] border-white shadow-md" />
      </div>
    </div>
  );
};
