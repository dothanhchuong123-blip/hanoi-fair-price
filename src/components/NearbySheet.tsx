import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { ChevronLeft, ExternalLink, MapPin } from 'lucide-react';
import { OLD_QUARTER_CENTER, haversineMeters } from '../agent/context';
import { fetchMapsNearby } from '../agent/maps';
import { EvaluatedItem, MapsNearbyResult, NearbyPlace } from '../agent/types';
import { formatShortVnd } from '../lib/parsePrice';
import { Button, Chip, DishThumb, IconButton, Sheet } from './ui';
import { IllustratedMap } from './IllustratedMap';

const MAP_ID =
  ((import.meta as any).env?.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() || 'DEMO_MAP_ID';

interface NearbySheetProps {
  lang: 'en' | 'vi';
  item: EvaluatedItem;
  demoMode: boolean;
  locationAllowed: boolean;
  userCoords: { lat: number; lng: number } | null;
  areaName?: string;
  onClose: () => void;
  onRequestLocation: () => Promise<void>;
}

interface PlaceLocationMap {
  [placeId: string]: {
    lat: number;
    lng: number;
    distance_m: number;
  };
}

function formatPriceRange(low: number | null, high: number | null): string {
  if (low !== null && high !== null) {
    if (low === high) return formatShortVnd(high);
    const lowStr = formatShortVnd(low).replace(/k$/i, '');
    const highStr = formatShortVnd(high);
    return `${lowStr}–${highStr}`;
  }
  if (high !== null) return formatShortVnd(high);
  if (low !== null) return formatShortVnd(low);
  return '—';
}

function formatDistanceMeters(meters?: number): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Child component inside <APIProvider> that uses Places API (New) Place Details
 * by place_id with field mask ['location'] and computes haversine distance from user.
 */
const PlacesLocationResolver: React.FC<{
  places: NearbyPlace[];
  userCoords: { lat: number; lng: number };
  onResolved: (locations: PlaceLocationMap) => void;
}> = ({ places, userCoords, onResolved }) => {
  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || places.length === 0) return;
    let cancelled = false;

    const resolveAll = async () => {
      const next: PlaceLocationMap = {};
      await Promise.all(
        places.map(async (p) => {
          if (!p.place_id || p.place_id.startsWith('sample_')) return;
          try {
            const PlaceCtor = (placesLib as any).Place;
            if (!PlaceCtor) return;
            const placeInstance = new PlaceCtor({ id: p.place_id });
            await placeInstance.fetchFields({ fields: ['location'] });
            const loc = placeInstance.location;
            if (!loc) return;
            const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
            const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              next[p.place_id] = {
                lat,
                lng,
                distance_m: haversineMeters(userCoords, { lat, lng }),
              };
            }
          } catch {
            // Ignore individual place lookup failures
          }
        })
      );
      if (!cancelled && Object.keys(next).length > 0) {
        onResolved(next);
      }
    };

    resolveAll();
    return () => {
      cancelled = true;
    };
  }, [placesLib, places, userCoords, onResolved]);

  return null;
};

export const NearbySheet: React.FC<NearbySheetProps> = ({
  lang,
  item,
  demoMode,
  locationAllowed,
  userCoords,
  areaName,
  onClose,
  onRequestLocation,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<MapsNearbyResult | null>(null);
  const [resolvedLocations, setResolvedLocations] = useState<PlaceLocationMap>({});
  const [mapFailed, setMapFailed] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const mapBoxRef = useRef<HTMLDivElement | null>(null);

  // Google calls gm_authFailure when the key is rejected (bad key, billing off, site not allowed)
  // and then paints its own grey "Oops" box. Watch for both and swap in our drawn map instead.
  useEffect(() => {
    const w = window as any;
    const previous = w.gm_authFailure;
    w.gm_authFailure = () => {
      setMapFailed(true);
      previous?.();
    };
    const box = mapBoxRef.current;
    const observer = box
      ? new MutationObserver(() => {
          if (box.querySelector('.gm-err-container, .gm-err-content')) setMapFailed(true);
        })
      : null;
    if (box && observer) observer.observe(box, { childList: true, subtree: true });
    return () => {
      w.gm_authFailure = previous;
      observer?.disconnect();
    };
  }, []);

  const ref = item.reference;
  const dishVi = ref?.name_vi || item.perceived.name_vi;
  const dishEn = ref?.name_en || item.perceived.name_en;
  const itemKey = ref?.id || dishVi.toLowerCase();
  const typicalHigh = ref?.high_vnd ?? null;

  const effectiveCoords = userCoords ?? OLD_QUARTER_CENTER;

  useEffect(() => {
    if (!locationAllowed && !demoMode) {
      setResult(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchMapsNearby({
      lat: effectiveCoords.lat,
      lng: effectiveCoords.lng,
      itemId: itemKey,
      dishVi,
      dishEn,
      demoMode,
    })
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ unavailable: true, places: [], sources: [] });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locationAllowed, demoMode, effectiveCoords.lat, effectiveCoords.lng, itemKey, dishVi, dishEn]);

  const envMapsKey = (
    (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
    result?.maps_js_api_key ||
    ''
  ).trim();
  const hasGoogleMapsKey = Boolean(envMapsKey);
  const placesList = result?.places ?? [];
  const fromGuide = Boolean(result?.is_sample);

  const pinFor = (place: NearbyPlace) => {
    const compare = place.price_high ?? place.price_low;
    const isTypical = compare !== null && (typicalHigh === null || compare <= typicalHigh);
    return {
      label: formatPriceRange(place.price_low, place.price_high),
      color: isTypical ? 'var(--fair)' : 'var(--warn)',
    };
  };

  const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${dishVi} (${dishEn}) near Hoàn Kiếm Hanoi`
  )}`;

  return (
    <div
      data-testid="nearby-sheet-view"
      className="absolute inset-0 z-30 flex flex-col justify-between bg-black/45 backdrop-blur-[2px]"
    >
      {/* Top header + optional Google Map (ONLY rendered when GOOGLE_MAPS_API_KEY exists) */}
      <div className="relative flex-1 min-h-[220px] flex flex-col justify-between">
        {(locationAllowed || demoMode) && (
          <div className="absolute inset-0 z-0" ref={mapBoxRef}>
            {hasGoogleMapsKey && !mapFailed ? (
              <div className="absolute inset-0" data-testid="nearby-google-map">
                <APIProvider apiKey={envMapsKey} onError={() => setMapFailed(true)}>
                  <PlacesLocationResolver
                    places={placesList}
                    userCoords={effectiveCoords}
                    onResolved={(locs) =>
                      setResolvedLocations((prev) => ({ ...prev, ...locs }))
                    }
                  />
                  <Map
                    defaultCenter={effectiveCoords}
                    defaultZoom={15}
                    mapId={MAP_ID}
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    gestureHandling="greedy"
                    disableDefaultUI
                    className="w-full h-full"
                  >
                    <AdvancedMarker position={effectiveCoords}>
                      <div className="relative">
                        <span className="absolute inset-0 rounded-full bg-[#2563EB]/40 pulse-halo" />
                        <span className="relative block w-4 h-4 rounded-full bg-[#2563EB] border-[3px] border-white shadow-md" />
                      </div>
                    </AdvancedMarker>

                    {placesList.map((place) => {
                      const resolved = resolvedLocations[place.place_id];
                      const lat = resolved?.lat ?? place.lat;
                      const lng = resolved?.lng ?? place.lng;
                      if (typeof lat !== 'number' || typeof lng !== 'number') return null;
                      const pin = pinFor(place);
                      const selected = selectedPlaceId === place.place_id;
                      return (
                        <AdvancedMarker
                          key={place.place_id}
                          position={{ lat, lng }}
                          onClick={() => setSelectedPlaceId(place.place_id)}
                        >
                          <div
                            className={`px-2.5 py-1 rounded-full text-white font-bold text-[12px] tabular-nums border-2 border-white whitespace-nowrap transition-transform ${
                              selected ? 'scale-110 shadow-pop' : 'shadow-card'
                            }`}
                            style={{ backgroundColor: pin.color }}
                          >
                            {pin.label}
                          </div>
                        </AdvancedMarker>
                      );
                    })}
                  </Map>
                </APIProvider>
              </div>
            ) : (
              <IllustratedMap
                lang={lang}
                center={effectiveCoords}
                places={placesList}
                pinFor={pinFor}
                selectedId={selectedPlaceId}
                onSelect={setSelectedPlaceId}
              />
            )}
            {/* Soft fade so the sheet edge reads cleanly over the map */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent" />
          </div>
        )}

        {/* Floating top navigation bar */}
        <header className="relative z-10 px-4 pt-3.5 pb-2 flex items-center justify-between gap-2">
          <IconButton
            variant="glass"
            onClick={onClose}
            aria-label={lang === 'en' ? 'Back to verdict' : 'Quay lại kết quả'}
            data-testid="nearby-back-btn"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </IconButton>

          <Chip variant="glass" data-testid="nearby-area-chip">
            <MapPin className="w-3.5 h-3.5 text-white/90" />
            <span>
              {areaName
                ? `${lang === 'en' ? 'Near' : 'Gần'} ${areaName}`
                : lang === 'en'
                ? 'Near Hàng Bạc'
                : 'Gần Hàng Bạc'}
            </span>
          </Chip>

          <div className="w-[44px]" aria-hidden="true" />
        </header>
      </div>

      {/* Bottom List Sheet matching Screenshot 08 */}
      <Sheet
        variant="bg"
        aria-label={
          lang === 'en' ? `Cheaper ${dishVi} nearby` : `${dishVi} giá hợp lý gần đây`
        }
        className="max-h-[78vh] overflow-y-auto"
      >
        {/* Sheet Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[22px] leading-tight text-ink">
              {lang === 'en'
                ? `Cheaper ${dishVi} nearby`
                : `${dishVi} giá tốt gần đây`}
            </h2>
            <p className="text-[13px] text-ink-2 mt-1 flex flex-wrap items-center gap-1.5">
              {fromGuide ? (
                <span>
                  {lang === 'en'
                    ? 'From our Old Quarter price guide · tap a pin to compare'
                    : 'Từ bảng giá Phố cổ của chúng tôi · chạm ghim để so sánh'}
                </span>
              ) : lang === 'en' ? (
                <span>
                  From <span translate="no">Google Maps</span> · prices from reviews &amp; reports
                </span>
              ) : (
                <span>
                  Từ <span translate="no">Google Maps</span> · giá từ đánh giá &amp; cộng đồng
                </span>
              )}
            </p>
          </div>
        </div>

        {/* STATE 1: No Location */}
        {!locationAllowed && !demoMode && (
          <div
            data-testid="nearby-no-location"
            className="mt-4 p-5 rounded-[18px] bg-surface border border-line text-center"
          >
            <p className="text-[14.5px] font-semibold text-ink">
              {lang === 'en'
                ? 'Allow location to see nearby places.'
                : 'Cho phép vị trí để xem quán gần đây.'}
            </p>
            <div className="mt-3 flex justify-center">
              <Button
                variant="primary"
                onClick={onRequestLocation}
                data-testid="nearby-allow-location-btn"
              >
                <MapPin className="w-4 h-4" />
                <span>{lang === 'en' ? 'Allow location' : 'Cho phép vị trí'}</span>
              </Button>
            </div>
          </div>
        )}

        {/* STATE 2: Loading (3 skeleton rows while /nearby runs) */}
        {(locationAllowed || demoMode) && loading && (
          <div data-testid="nearby-loading" className="mt-4 space-y-2.5">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-[18px] bg-surface border border-line flex items-center justify-between gap-3 animate-pulse"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-[14px] bg-surface-2 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-36 bg-surface-2 rounded" />
                    <div className="h-3 w-24 bg-surface-2 rounded" />
                  </div>
                </div>
                <div className="w-16 h-8 bg-surface-2 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* STATE 3: Unavailable ({ unavailable: true }) */}
        {(locationAllowed || demoMode) && !loading && result?.unavailable && (
          <div
            data-testid="nearby-unavailable"
            className="mt-4 p-5 rounded-[18px] bg-surface border border-line text-center"
          >
            <p className="text-[14.5px] font-semibold text-ink">
              {lang === 'en'
                ? "Couldn't load nearby places right now"
                : 'Hiện chưa tải được các quán gần đây'}
            </p>
            <a
              href={mapsSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="nearby-fallback-search-link"
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[14px] bg-brand text-white text-[13.5px] font-semibold hover:bg-brand/90 transition-colors"
            >
              <span>
                {lang === 'en' ? (
                  <>
                    Search on <span translate="no">Google Maps</span>
                  </>
                ) : (
                  <>
                    Tìm trên <span translate="no">Google Maps</span>
                  </>
                )}
              </span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* STATE 4: Places List */}
        {(locationAllowed || demoMode) &&
          !loading &&
          result &&
          !result.unavailable &&
          placesList.length > 0 && (
            <div className="mt-3.5">
              <div data-testid="nearby-places-list" className="space-y-2.5">
                {placesList.map((place) => {
                  const resolvedDist = resolvedLocations[place.place_id]?.distance_m;
                  const distLabel = formatDistanceMeters(resolvedDist ?? place.distance_m);
                  const comparePrice = place.price_high ?? place.price_low;
                  const isTypical =
                    comparePrice !== null &&
                    typicalHigh !== null &&
                    comparePrice <= typicalHigh;
                  const priceStr = formatPriceRange(place.price_low, place.price_high);

                  return (
                    <a
                      key={place.place_id}
                      href={place.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="nearby-place-row"
                      onMouseEnter={() => setSelectedPlaceId(place.place_id)}
                      className={`p-3.5 rounded-[18px] bg-surface hover:bg-surface-2/70 border flex items-center justify-between gap-3 transition-colors ${
                        selectedPlaceId === place.place_id ? 'border-ink/40 shadow-card' : 'border-line'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <DishThumb
                          refId={ref?.id}
                          name={ref?.name_vi ?? place.name}
                          category={ref?.category}
                          className="w-12 h-12 rounded-[14px] text-[18px]"
                        />

                        <div className="min-w-0">
                          <div className="font-bold text-[15.5px] text-ink leading-snug truncate flex items-center gap-1.5">
                            <span className="truncate">{place.name}</span>
                          </div>

                          <div className="text-[13px] text-ink-2 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {distLabel && (
                              <>
                                <span>{distLabel}</span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            {place.rating !== null && (
                              <span>★ {place.rating.toFixed(1)}</span>
                            )}
                            {place.open_now !== null && place.open_now !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    place.open_now
                                      ? 'text-fair font-semibold'
                                      : 'text-ink-3'
                                  }
                                >
                                  {place.open_now
                                    ? lang === 'en'
                                      ? 'open'
                                      : 'đang mở'
                                    : lang === 'en'
                                    ? 'closed'
                                    : 'đã đóng'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right side: price range & typical badge */}
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <div className="font-mono font-bold text-[16px] text-ink tabular-nums">
                          {priceStr}
                        </div>
                        {isTypical && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-fair-soft text-fair">
                            {lang === 'en' ? 'typical' : 'phổ biến'}
                          </span>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>

              {/* Attribution rule: sources sit directly under the list they support */}
              {result.sources && result.sources.length > 0 && (
                <div
                  data-testid="nearby-maps-sources"
                  className="mt-2.5 pt-2 border-t border-line/60 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3"
                >
                  <span className="font-semibold text-ink-2">
                    <span translate="no">Google Maps</span>{' '}
                    {lang === 'en' ? 'sources:' : 'nguồn:'}
                  </span>
                  {result.sources.map((src, i) => (
                    <a
                      key={`${src.uri}-${i}`}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-ink transition-colors truncate max-w-[180px]"
                    >
                      {src.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* Disclaimer at the bottom */}
        <p
          data-testid="nearby-disclaimer"
          className="text-[12px] text-ink-3 text-center mt-4 pt-2 border-t border-line"
        >
          {lang === 'en' ? (
            <>
              Places and ratings from <span translate="no">Google Maps</span>. Prices are estimates.
            </>
          ) : (
            <>
              Địa điểm và đánh giá từ <span translate="no">Google Maps</span>. Giá chỉ là ước tính.
            </>
          )}
        </p>
      </Sheet>
    </div>
  );
};
