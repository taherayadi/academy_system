// Jours de travail utilisés par le planning des formations. Ils restent la
// référence pour les anciennes grilles (séances sans date) et les libellés.
export const FORMATION_WORK_DAYS = ['الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

// Index 0 = dimanche (comme Date#getUTCDay). Les libellés reprennent
// exactement ceux déjà utilisés dans l'application.
const ARABIC_WEEKDAYS = ['الأحد', 'الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

export interface FormationSeanceLike {
  date?: string;      // YYYY-MM-DD (date réelle de la séance)
  day: string;        // libellé du jour (dérivé de la date)
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
}

export interface FormationDateOption {
  date: string;       // YYYY-MM-DD
  day: string;        // الأربعاء
  label: string;      // الأربعاء 21/10/2026
}

export interface FormationDateRange {
  startDate?: string;
  endDate?: string;
}

export interface FormationScheduleGroup<T extends FormationSeanceLike> {
  key: string;
  date?: string;
  day: string;
  label: string;
  seances: T[];
}

/** Parse une date ISO `YYYY-MM-DD` en UTC (pas de décalage de fuseau). */
export function parseIsoDate(iso?: string): Date | null {
  const value = String(iso || '').trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

/** Date UTC → `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Libellé arabe du jour d'une date ISO (vide si la date est invalide). */
export function arabicWeekday(iso?: string): string {
  const date = parseIsoDate(iso);
  return date ? ARABIC_WEEKDAYS[date.getUTCDay()] : '';
}

/** `2026-10-21` → `21/10/2026`. */
export function formatFormationDate(iso?: string): string {
  const date = parseIsoDate(iso);
  if (!date) return String(iso || '');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

/**
 * Toutes les dates réelles d'une formation, de `startDate` à `endDate`.
 * On ne filtre PAS les week-ends : une formation qui commence un dimanche doit
 * pouvoir planifier une séance ce jour-là. Le premier élément est donc
 * exactement le jour + la date de début de la formation.
 */
export function buildFormationDateOptions(
  startDate?: string,
  endDate?: string,
  maxDays: number = 366
): FormationDateOption[] {
  const start = parseIsoDate(startDate);
  if (!start) return [];
  let end = parseIsoDate(endDate);
  if (!end || end.getTime() < start.getTime()) end = start;

  const out: FormationDateOption[] = [];
  for (let i = 0, cursor = start.getTime(); i < maxDays && cursor <= end.getTime(); i++, cursor += 86_400_000) {
    const d = new Date(cursor);
    const date = toIsoDate(d);
    const day = ARABIC_WEEKDAYS[d.getUTCDay()];
    out.push({ date, day, label: `${day} ${formatFormationDate(date)}` });
  }
  return out;
}

/** `HH:MM` → minutes depuis minuit. */
export function timeToMinutes(time: string): number {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

/** Deux créneaux horaires se chevauchent-ils ? */
export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aS = timeToMinutes(aStart), aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart), bE = timeToMinutes(bEnd);
  if (isNaN(aS) || isNaN(aE) || isNaN(bS) || isNaN(bE)) return false;
  return aS < bE && bS < aE;
}

/** Deux périodes `startDate → endDate` se chevauchent-elles ? */
export function dateRangesOverlap(aStart?: string, aEnd?: string, bStart?: string, bEnd?: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Conflit entre deux séances.
 *
 * Le planning est daté : deux séances le même jour de la semaine mais à des
 * dates différentes (ex. mercredi 21/10 et mercredi 28/10) ne se chevauchent
 * PAS. Quand une ancienne séance n'a pas encore de date, on retombe sur
 * l'ancien comportement (même jour de semaine + périodes de formation qui se
 * chevauchent) pour ne pas casser les grilles existantes.
 */
export function seancesConflict(
  a: FormationSeanceLike,
  b: FormationSeanceLike,
  aRange?: FormationDateRange,
  bRange?: FormationDateRange
): boolean {
  if (!timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) return false;
  if (a.date && b.date) return a.date === b.date;
  if (a.day !== b.day) return false;
  if (!aRange || !bRange) return true;
  return dateRangesOverlap(aRange.startDate, aRange.endDate, bRange.startDate, bRange.endDate);
}

/**
 * Groupe les séances par date réelle (ou par jour pour les anciennes lignes),
 * triées chronologiquement, et chaque groupe trié par heure de début.
 */
export function groupFormationSeances<T extends FormationSeanceLike>(
  seances: T[] | undefined | null
): FormationScheduleGroup<T>[] {
  const groups = new Map<string, FormationScheduleGroup<T>>();
  (Array.isArray(seances) ? seances : []).forEach(seance => {
    const date = parseIsoDate(seance.date) ? seance.date : undefined;
    const day = date ? (arabicWeekday(date) || seance.day) : seance.day;
    const key = date ? `date:${date}` : `day:${day}`;
    const existing = groups.get(key);
    if (existing) {
      existing.seances.push(seance);
    } else {
      groups.set(key, {
        key,
        date,
        day,
        label: date ? `${day} — ${formatFormationDate(date)}` : day,
        seances: [seance]
      });
    }
  });

  const weekdayOrder = (day: string) => {
    const index = (ARABIC_WEEKDAYS as readonly string[]).indexOf(day);
    return index < 0 ? 99 : index;
  };

  return [...groups.values()]
    .sort((a, b) => {
      // Les dates réelles d'abord, par ordre chronologique.
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return weekdayOrder(a.day) - weekdayOrder(b.day);
    })
    .map(group => ({
      ...group,
      seances: group.seances
        .slice()
        .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))
    }));
}
