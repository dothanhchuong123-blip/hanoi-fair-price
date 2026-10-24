import { CrowdReport } from '../agent/types';

const REPORTS_KEY = 'cho_price_lens_crowd_reports_v1';
const PASSPORT_KEY = 'cho_price_lens_passport_v2';

export interface PassportStamp {
  id: string;
  street: string;
  emoji: string;
  collectedAt: number;
}

// Start with an empty passport: every stamp must come from a real report.
const DEFAULT_STAMPS: PassportStamp[] = [];

const OLD_QUARTER_STREETS: Array<{ id: string; street: string; emoji: string }> = [
  { id: 'hang_bac', street: 'Hàng Bạc', emoji: '🏮' },
  { id: 'ta_hien', street: 'Tạ Hiện', emoji: '🍺' },
  { id: 'dong_xuan', street: 'Đồng Xuân', emoji: '🥭' },
  { id: 'hang_buom', street: 'Hàng Buồm', emoji: '🥖' },
  { id: 'hang_dao', street: 'Hàng Đào', emoji: '🍢' },
];

export function getCrowdReports(): CrowdReport[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CrowdReport[];
  } catch {
    return [];
  }
}

export function getPassportStamps(): PassportStamp[] {
  try {
    const raw = localStorage.getItem(PASSPORT_KEY);
    if (!raw) {
      localStorage.setItem(PASSPORT_KEY, JSON.stringify(DEFAULT_STAMPS));
      return DEFAULT_STAMPS;
    }
    return JSON.parse(raw) as PassportStamp[];
  } catch {
    return DEFAULT_STAMPS;
  }
}

export function saveCrowdReport(itemId: string, nameVi: string, paidVnd: number): {
  report: CrowdReport;
  newStamp: PassportStamp;
  allStamps: PassportStamp[];
} {
  const existingReports = getCrowdReports();
  const stamps = getPassportStamps();

  // Pick next Old Quarter street stamp (starting with Hàng Bạc to match Screen 8!)
  const nextStreet =
    OLD_QUARTER_STREETS.find((s) => !stamps.some((st) => st.id === s.id)) || OLD_QUARTER_STREETS[0];

  const report: CrowdReport = {
    id: `rep_${Date.now()}`,
    item_id: itemId,
    name_vi: nameVi,
    paid_vnd: paidVnd,
    street: nextStreet.street,
    timestamp: Date.now(),
  };

  const updatedReports = [report, ...existingReports];
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(updatedReports));
  } catch {
    // Ignore storage quota errors
  }

  let updatedStamps = [...stamps];
  const newStamp: PassportStamp = {
    id: nextStreet.id,
    street: nextStreet.street,
    emoji: nextStreet.emoji,
    collectedAt: Date.now(),
  };

  if (!updatedStamps.some((s) => s.id === nextStreet.id)) {
    updatedStamps.push(newStamp);
    try {
      localStorage.setItem(PASSPORT_KEY, JSON.stringify(updatedStamps));
    } catch {
      // Ignore storage quota errors
    }
  }

  return {
    report,
    newStamp,
    allStamps: updatedStamps,
  };
}
