// Scout — persistent storage for price history and property marks
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const HISTORY_FILE = join(__dir, 'price-history.json');
const MARKS_FILE   = join(__dir, 'marks.json');

function readJson(file) {
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { return {}; }
}

export const loadHistory = () => readJson(HISTORY_FILE);
export const loadMarks   = () => readJson(MARKS_FILE);

export function saveHistory(history) {
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Merge current listings into history. Adds a price snapshot only when the
 * price changes. Returns the mutated history object.
 */
export function updateHistory(history, listings) {
  const now = new Date().toISOString();
  for (const l of listings) {
    const key = l.mlsNum;
    if (!key) continue;

    if (!history[key]) {
      history[key] = {
        mlsNum:      l.mlsNum,
        address:     l.address,
        firstSeen:   now,
        lastSeen:    now,
        snapshots:   [],           // [{ date, price }]
        schoolDistrict: null,
        schoolRating:   null,
      };
    }

    const h = history[key];
    h.lastSeen = now;
    h.address  = l.address;       // keep address fresh

    const last = h.snapshots[h.snapshots.length - 1];
    if (!last || last.price !== l.price) {
      h.snapshots.push({ date: now, price: l.price });
    }
  }
  return history;
}

/**
 * Return price-change metadata for one listing, or null if never seen before.
 * {
 *   firstPrice, firstSeen,
 *   prevPrice, prevDate,
 *   changeFromFirst,   // negative = price drop
 *   changeFromPrev,
 *   daysSinceFirst,
 *   daysSincePrevChange,
 *   snapshotCount,
 * }
 */
export function getPriceInfo(history, mlsNum) {
  const h = history[mlsNum];
  if (!h || h.snapshots.length === 0) return null;

  const snaps = h.snapshots;
  const first  = snaps[0];
  const latest = snaps[snaps.length - 1];
  const prev   = snaps.length >= 2 ? snaps[snaps.length - 2] : null;

  const daysSince = (isoDate) =>
    Math.round((Date.now() - new Date(isoDate)) / 86_400_000);

  return {
    firstPrice:          first.price,
    firstSeen:           first.date,
    daysSinceFirst:      daysSince(first.date),
    prevPrice:           prev?.price ?? null,
    prevDate:            prev?.date  ?? null,
    daysSincePrevChange: prev ? daysSince(prev.date) : null,
    currentPrice:        latest.price,
    changeFromFirst:     latest.price - first.price,
    changeFromPrev:      prev ? latest.price - prev.price : 0,
    snapshotCount:       snaps.length,
  };
}
