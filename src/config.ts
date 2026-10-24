// Flash-Lite reads a dense 27-item menu in ~7s; full Flash took 100s+ under load for the same result.
export const GEMINI_MODEL = 'gemini-flash-lite-latest';
// Tried when the main model is overloaded (503/429) or too slow.
export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_TIMEOUT_MS = 20000;

// Placeholder for future external backend swap (unused for in-app pipeline)
export const API_BASE_URL = '';

// Fixed USD conversion rate for 2026 Hanoi display
export const USD_VND_RATE = 26150;
