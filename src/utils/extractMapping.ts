const FORM_GRADES = [
  'Collège 7ème Année',
  'Collège 8ème Année',
  'Collège 9ème Année',
  'Lycée 1ère Année',
  'Lycée 2ème Année',
  'Lycée 3ème Année',
  'Baccalauréat',
] as const;

/** Convert DD/MM/YYYY (or similar) to YYYY-MM-DD for DateField. */
export function parseExtractedDate(raw: string | undefined): string {
  if (!raw?.trim()) return '';
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

/** Map Gemini grade labels to form <select> values. */
export function normalizeExtractedGrade(raw: string | undefined, fallback = 'Lycée 1ère Année'): string {
  if (!raw?.trim()) return fallback;
  const s = raw.trim();
  if ((FORM_GRADES as readonly string[]).includes(s)) return s;

  const aliases: Record<string, string> = {
    'collège 3ème': 'Collège 9ème Année',
    'college 3eme': 'Collège 9ème Année',
    '3ème année collège': 'Collège 9ème Année',
    '9ème': 'Collège 9ème Année',
  };
  const lower = s.toLowerCase();
  for (const [key, value] of Object.entries(aliases)) {
    if (lower.includes(key)) return value;
  }

  const withoutStream = s.replace(/\s+(Science|Lettre|Math|Informatique|Économie|Technique|Info).*$/i, '').trim();
  for (const g of FORM_GRADES) {
    const base = g.replace(' Année', '');
    if (withoutStream.toLowerCase() === base.toLowerCase()) return g;
    if (withoutStream.toLowerCase().startsWith(base.toLowerCase())) return g;
  }

  for (const g of FORM_GRADES) {
    if (s.toLowerCase().includes(g.replace(' Année', '').toLowerCase())) return g;
  }

  return fallback;
}

export function digitsOnlyPhone(raw: string | undefined): string {
  return (raw || '').replace(/\D/g, '');
}
