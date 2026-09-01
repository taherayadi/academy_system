import { GoogleGenAI } from '@google/genai';
import { Formation } from '../types';

export interface FormationSeanceProposal {
  day: string;
  startTime: string;
  endTime: string;
  matiere: string;
}

export const FORMATION_WORK_DAYS = ['الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

export const FORMATION_WORK_START = '08:00';
export const FORMATION_WORK_END = '17:00';

/**
 * Parse a Gemini response that should contain a JSON array of sessions.
 * Handles markdown code fences and trailing text gracefully.
 */
function parseScheduleJson(text: string): FormationSeanceProposal[] {
  // Strip markdown code fences if present
  let clean = text
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  // Find the first '[' and last ']' to isolate the JSON array
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('لم يتمكن الذكاء الاصطناعي من إرجاع جدول صالح.');
  }
  clean = clean.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Try to repair common JSON issues (e.g. trailing commas in arrays/objects)
    const repaired = clean
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']');
    parsed = JSON.parse(repaired);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('لم يتمكن الذكاء الاصطناعي من إرجاع جدول صالح.');
  }

  const validDays = FORMATION_WORK_DAYS as readonly string[];

  return parsed
    .map((item): FormationSeanceProposal | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const day = String(r.day ?? '').trim();
      const startTime = String(r.startTime ?? '').trim();
      const endTime = String(r.endTime ?? '').trim();
      const matiere = String(r.matiere ?? '').trim();
      if (!day || !startTime || !endTime || !matiere) return null;
      // Validate the times are within working hours (08:00 - 17:00) and consistent
      const toMin = (t: string) => {
        const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return NaN;
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      };
      const sMin = toMin(startTime);
      const eMin = toMin(endTime);
      const workStart = toMin(FORMATION_WORK_START);
      const workEnd = toMin(FORMATION_WORK_END);
      if (
        Number.isNaN(sMin) || Number.isNaN(eMin) ||
        sMin < workStart || eMin > workEnd || sMin >= eMin
      ) return null;
      // Normalize the day label (allow "الأحد" to be dropped, keep only work days it returned)
      const normalizedDay = validDays.find(d => day.includes(d.slice(0, Math.min(2, d.length)))) ?? '';
      if (!normalizedDay) return null;
      return { day: normalizedDay, startTime, endTime, matiere };
    })
    .filter((s): s is FormationSeanceProposal => s !== null);
}

function hasTimeConflict(items: FormationSeanceProposal[]): boolean {
  const toMin = (t: string) => {
    const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : NaN;
  };
  const byDay = new Map<string, FormationSeanceProposal[]>();
  for (const s of items) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day)!.push(s);
  }
  for (const list of byDay.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const as = toMin(a.startTime);
        const ae = toMin(a.endTime);
        const bs = toMin(b.startTime);
        const be = toMin(b.endTime);
        if (
          !Number.isNaN(as) && !Number.isNaN(ae) &&
          !Number.isNaN(bs) && !Number.isNaN(be) &&
          as < be && bs < ae
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function buildFallbackSchedule(formation: Formation): FormationSeanceProposal[] {
  const matieres = (formation.matieres || []).map(m => m.subject);
  if (matieres.length === 0) return [];
  const days = FORMATION_WORK_DAYS as readonly string[];
  // 4 séances/day, each 90min, 15min break: 08:00, 09:45, 11:30, 13:15
  const slots = [
    { start: '08:00', end: '09:30' },
    { start: '09:45', end: '11:15' },
    { start: '11:30', end: '13:00' },
    { start: '13:15', end: '14:45' },
  ];
  const result: FormationSeanceProposal[] = [];
  days.forEach((day, di) => {
    slots.forEach((slot, si) => {
      const matiere = matieres[(di * slots.length + si) % matieres.length];
      result.push({ day, startTime: slot.start, endTime: slot.end, matiere });
    });
  });
  return result;
}

export async function proposeFormationSchedule(
  formation: Formation,
  studentsSummary: { matiere: string; count: number }[],
  apiKey?: string
): Promise<FormationSeanceProposal[]> {
  if (!apiKey) throw new Error('مفتاح Gemini API غير مهيأ. أدخل المفتاح في صفحة الإعدادات');

  const ai = new GoogleGenAI({ apiKey });

  const allowedTimes: string[] = [];
  for (let m = 8 * 60; m <= 20 * 60; m += 15) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    allowedTimes.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }

  const context = {
    name: formation.name,
    grade: formation.grade || '',
    branch: formation.branch || '',
    schoolYear: formation.schoolYear,
    startDate: formation.startDate,
    endDate: formation.endDate,
    packPrice: formation.packPrice,
    matieres: (formation.matieres || []).map(m => m.subject),
    studentsByMatiere: studentsSummary,
  };

  const prompt = `أنت منسق تكوينات في مركز تعليمي تونسي (Teen Center، صفاقس).
المطلوب: اقتراح جدول حصص أسبوعي للتكوين التالي، موزّع على أيام الأسبوع.

قواعد الجدول (إلزامية):
- أيام العمل: ${FORMATION_WORK_DAYS.join('، ')} (الأحد راحة).
- يوم العمل يبدأ عند ${FORMATION_WORK_START} (08:00).
- مدة كل حصة بالضبط 90 دقيقة (1.5 ساعة).
- فاصل (استراحة) 15 دقيقة بين كل حصتين متتاليتين في نفس اليوم.
- جميع الأوقات تكون بزيادة 15 دقيقة فقط (مثال: 08:00، 08:15، 08:30، 08:45، 09:00، 09:15، 09:30، 09:45، 10:00 ...). الأوقات المسموحة حصراً هي: ${allowedTimes.join('، ')}.
- كل يوم يمكن أن يحتوي على حتى 4 حصص (يفضّل 4 حصص بأربع مواد مختلفة إن توفّرت)، على أن تنتهي آخر حصة قبل ${FORMATION_WORK_END}.
- وزّع الحصص على أيام العمل الستة بالكامل: ضَع 3 إلى 4 حصص في معظم الأيام، ولا تكتفِ بيوم واحد.
- ممنوع تماماً وضع حصتين بأي مادة كانت تتداخلان في التوقيت بنفس اليوم (التلميذ قد يكون مسجّلاً في أكثر من مادة). كل (يوم + توقيت) يخصّ حصة واحدة فقط.
- تأكد من تغطية جميع المواد: ${context.matieres.join('، ') || '(لا توجد مواد محددة)'}.

معلومات التكوين:
${JSON.stringify(context, null, 2)}

أرجِع الناتج على شكل JSON فقط (مصفوفة objects، بدون أي نص أو علامات). كل عنصر بالشكل:
{"day":"الثلاثاء","startTime":"08:00","endTime":"09:30","matiere":"اسم المادة"}

يجب أن يكون الحقل day واحداً من: ${FORMATION_WORK_DAYS.join('، ')}، وأن تكون startTime و endTime من الأوقات المسموحة، وأن يكون الفرق بينهما 90 دقيقة، وأن يكون endTime قبل ${FORMATION_WORK_END}.
أرجِع بين 12 و 24 حصة بحيث يشمل الجدول جميع الأيام الستة (الأثنين..السبت) وبلا أي تداخل زمني في نفس اليوم، مع 3 إلى 4 حصص في كل يوم.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.5 },
  });

  const text = response.text?.trim() || '';
  const parsed = parseScheduleJson(text);
  // Guard against invalid AI output: time overlaps on the same day (a student
  // can't attend two seances at once) or a plan that doesn't cover the full week.
  const distinctDays = new Set(parsed.map(p => p.day)).size;
  if (hasTimeConflict(parsed) || distinctDays < FORMATION_WORK_DAYS.length) {
    return buildFallbackSchedule(formation);
  }
  return parsed;
}
