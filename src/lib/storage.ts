import { CrowdReport } from '../agent/types';

const REPORTS_KEY = 'cho_price_lens_crowd_reports_v1';
const PASSPORT_KEY = 'cho_price_lens_passport_v2';
const ONBOARDING_KEY = 'onboardingDone';

export function getOnboardingDone(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return true;
    }
    const val = localStorage.getItem(ONBOARDING_KEY);
    return val === 'true' || val === '1';
  } catch {
    return false;
  }
}

export function setOnboardingDone(done = true): void {
  try {
    if (done) {
      localStorage.setItem(ONBOARDING_KEY, 'true');
    } else {
      localStorage.removeItem(ONBOARDING_KEY);
    }
  } catch {
    // Ignore localStorage security or quota errors
  }
}

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

const DEFAULT_CROWD_REPORTS: CrowdReport[] = [
  { id: 'seed_rep_1', item_id: 'bun_cha', name_vi: 'Bún chả', paid_vnd: 50000, street: 'Hàng Mành', timestamp: 1760000001000 },
  { id: 'seed_rep_2', item_id: 'bun_cha', name_vi: 'Bún chả', paid_vnd: 50000, street: 'Hàng Quạt', timestamp: 1760000002000 },
  { id: 'seed_rep_3', item_id: 'bun_cha', name_vi: 'Bún chả', paid_vnd: 55000, street: 'Hàng Bạc', timestamp: 1760000003000 },
  { id: 'seed_rep_4', item_id: 'bun_cha', name_vi: 'Bún chả', paid_vnd: 55000, street: 'Hàng Đào', timestamp: 1760000004000 },
  { id: 'seed_rep_5', item_id: 'bun_cha', name_vi: 'Bún chả', paid_vnd: 60000, street: 'Hàng Than', timestamp: 1760000005000 },
  { id: 'seed_rep_6', item_id: 'bun_cha', name_vi: 'Bún chả', paid_vnd: 60000, street: 'Cầu Gỗ', timestamp: 1760000006000 },
];

export function getCrowdReports(): CrowdReport[] {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_CROWD_REPORTS;
    const raw = localStorage.getItem(REPORTS_KEY);
    if (!raw) {
      localStorage.setItem(REPORTS_KEY, JSON.stringify(DEFAULT_CROWD_REPORTS));
      return DEFAULT_CROWD_REPORTS;
    }
    return JSON.parse(raw) as CrowdReport[];
  } catch {
    return DEFAULT_CROWD_REPORTS;
  }
}

export function getCrowdStatsForItem(
  itemId: string | null | undefined
): { count: number; median_vnd: number } | null {
  if (!itemId) return null;
  const reports = getCrowdReports().filter((r) => r.item_id === itemId && r.paid_vnd > 0);
  if (reports.length === 0) return null;
  const sorted = reports.map((r) => r.paid_vnd).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2 / 1000) * 1000;
  return { count: reports.length, median_vnd: median };
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
