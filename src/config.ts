export const GEMINI_MODEL = 'gemini-3.5-flash-lite';        // main read: fast, stable
export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite'; // when main is overloaded/slow
export const GEMINI_STRONG_MODEL = 'gemini-3.8-flash';       // second pass (Part 4) and Maps (Part 6)
export const GEMINI_TIMEOUT_MS = 20000;
export const VISION_TIMEOUT_MS = 8000;
export const MAPS_TIMEOUT_MS = 10000;

// Placeholder for future external backend swap (unused for in-app pipeline)
export const API_BASE_URL = '';

// Fixed USD conversion rate for 2026 Hanoi display
export const USD_VND_RATE = 26150;
