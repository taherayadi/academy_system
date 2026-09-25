/**
 * Pure planner helpers for the Activités & Planning module (feature 004).
 *
 * No React, no fetching, no storage — everything here is a pure function over
 * plain data so the truth tables can be tested in isolation. The weekly grid
 * (week view) positions activity chips in fixed half-hour bands; the grouping
 * toggle re-buckets the same list without ever mutating it.
 */

import { Activity, ActivityCategory } from '../types';

/**
 * Fixed half-hour bands from 08:00 to 20:00 (24 bands).
 * Revision C (remark 3): the grid starts at 08:00, the activities' real opening
 * hour — pre-08:00 stored times clamp to the first band (no data rewritten).
 */
export const TIME_BANDS: { start: string; end: string; label: string }[] =
  Array.from({ length: 24 }, (_, i) => {
    const startMin = 8 * 60 + i * 30;
    const endMin = startMin + 30;
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { start: fmt(startMin), end: fmt(endMin), label: `${fmt(startMin)}` };
  });

const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 20 * 60;

/**
 * Index of the half-hour band containing `timeStart`; minutes are ignored
 * (10:00–10:29 → the 10:00 band). Times outside 08:00–20:00 clamp to the
 * first/last band so a stray value still renders instead of crashing.
 */
export function bandIndexFor(timeStart: string): number {
  const [h, m] = (timeStart || '').split(':').map(Number);
  const minutes = (h || 0) * 60 + (m || 0);
  const idx = Math.floor((minutes - DAY_START_MIN) / 30);
  if (idx < 0) return 0;
  if (idx > TIME_BANDS.length - 1) return TIME_BANDS.length - 1;
  return idx;
}

/** Start time (HH:MM) of the band at `index` — used to snap a moved chip. */
export function bandStartTime(index: number): string {
  return TIME_BANDS[Math.min(Math.max(index, 0), TIME_BANDS.length - 1)].start;
}

/** Fixed palette per category (data-model render derivation). */
export const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  motricite: 'bg-emerald',
  art: 'bg-violet',
  musique: 'bg-amber',
  jeu: 'bg-sky'
};

const CATEGORY_ENUM: ActivityCategory[] = ['motricite', 'art', 'musique', 'jeu'];

/** Regex-free HH:MM shape check (00:00–23:59). */
function isTimeOfDay(t: string): boolean {
  const parts = (t || '').split(':');
  if (parts.length !== 2) return false;
  const [h, m] = parts.map(Number);
  return (
    Number.isInteger(h) && Number.isInteger(m) &&
    h >= 0 && h <= 23 && m >= 0 && m <= 59
  );
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * The shared validation predicate (data-model): title non-empty, category in
 * enum, weekday ∈ 0–6 XOR date present, timeStart < timeEnd (both well-formed).
 */
export function validateActivity(a: Partial<Activity>): boolean {
  if (!a || typeof a !== 'object') return false;
  if (!a.title || a.title.trim() === '') return false;
  if (!a.category || !CATEGORY_ENUM.includes(a.category)) return false;
  const hasWeekday = a.date == null || a.date === ''
    ? Number.isInteger(a.weekday) && (a.weekday as number) >= 0 && (a.weekday as number) <= 6
    : true;
  const hasDate = typeof a.date === 'string' && a.date !== '';
  if (hasDate && !/^\d{4}-\d{2}-\d{2}$/.test(a.date as string)) return false;
  // weekday XOR date: exactly one of the two day selectors must be active
  if (hasDate) {
    // date mode: weekday is ignored, so any weekday value is acceptable
  } else if (!hasWeekday) {
    return false;
  }
  if (!isTimeOfDay(a.timeStart || '') || !isTimeOfDay(a.timeEnd || '')) return false;
  return toMinutes(a.timeStart!) < toMinutes(a.timeEnd!);
}

export type GroupByKey = 'class' | 'location';

/**
 * View-only grouping: bucket activities by levelClass (class) or location,
 * alphabetically ordered, with the 'unassigned' bucket always last. The input
 * list is never mutated and empty buckets are never emitted.
 */
export function groupActivities(
  list: Activity[],
  by: GroupByKey
): { key: string; items: Activity[] }[] {
  const UNASSIGNED = 'بدون تصنيف';
  const buckets = new Map<string, Activity[]>();
  for (const a of list) {
    const raw = by === 'class' ? a.levelClass : a.location;
    const key = raw && String(raw).trim() !== '' ? String(raw).trim() : UNASSIGNED;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a);
  }
  const unassigned = buckets.get(UNASSIGNED);
  buckets.delete(UNASSIGNED);
  const ordered = Array.from(buckets.entries())
    .sort(([ka], [kb]) => ka.localeCompare(kb))
    .map(([key, items]) => ({ key, items }));
  if (unassigned) ordered.push({ key: UNASSIGNED, items: unassigned });
  return ordered;
}
