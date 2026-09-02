import { GoogleGenAI } from '@google/genai';
import type { PageImage } from './pdfExtract';
import { digitsOnlyPhone, normalizeExtractedGrade, parseExtractedDate } from './extractMapping';

const buildSystemPrompt = (centerName: string) => `You are a data extraction assistant. You receive SCANNED IMAGES of handwritten Tunisian student registration forms (فصح التسجيل) from a student support center called "${centerName}".

The forms are in Arabic and/or French, handwritten on paper, then scanned. Read the handwriting carefully from ALL pages — the form often spans 2+ pages.

PAGE 1 typically contains: student identity, parents (mother/father), siblings, authorized pickup persons, allergies.
PAGE 2 (or later) typically contains: "Inscription aux services scolaires" / "التسجيل في الخدمات المدرسية" with checkboxes for center services (Suivi Scolaire, Étude ${centerName}, Bibliothèque, Repas).

Extract the student information and return a JSON object with EXACTLY this structure. Use empty strings / defaults for any field you cannot find:

{
  "firstName": "string — first name (الاسم)",
  "lastName": "string — last name (اللقب)",
  "birthDate": "string — date of birth DD/MM/YYYY (تاريخ الميلاد)",
  "birthPlace": "string — place of birth (مكان الميلاد)",
  "grade": "string — current school grade. Use EXACTLY one of: Primaire 1ère Année, Primaire 2ème Année, Primaire 3ème Année, Primaire 4ème Année, Primaire 5ème Année, Primaire 6ème Année, Collège 7ème Année, Collège 8ème Année, Collège 9ème Année, Lycée 1ère Année, Lycée 2ème Année, Lycée 3ème Année, Baccalauréat",
  "mother": {
    "name": "string",
    "birthDate": "string — DD/MM/YYYY or empty",
    "profession": "string",
    "phoneFixed": "string",
    "phoneMobile": "string",
    "address": "string",
    "email": "string"
  },
  "father": {
    "name": "string",
    "birthDate": "string — DD/MM/YYYY or empty",
    "profession": "string",
    "phoneFixed": "string",
    "phoneMobile": "string",
    "address": "string",
    "email": "string"
  },
  "parentalSituation": "mariés | séparés_garde_mere | séparés_garde_pere | séparés_garde_alternee",
    "parentalComments": "string",
 

  "siblings": [{"name": "string", "age": 0, "grade": "string"}],
  "authorizedPersons": [{"name": "string", "phone": "string", "relation": "string"}],
  "allergies": "string — medical allergies or empty string",
  "academicHistory": {
    "nMinus1": {"school": "string", "grade": "string"},
    "nMinus2": {"school": "string", "grade": "string"},
    "nMinus3": {"school": "string", "grade": "string"}
  },
  "vaccinationCopyAttached": "boolean",
  "enrolledServices": {
    "suivi": true,
    "etude": true,
    "library": false,
    "meals": true
  },
    "signatureDetails": {
    "place": "string",
    "date": "string",
    "signedByName": "string"
  }
}

For enrolledServices: read the "Inscription aux services scolaires" section on page 2+. Set each boolean to true ONLY if the checkbox/tick is clearly marked for that service:
- suivi = Suivi Scolaire / المتابعة المدرسية
- etude = Étude ${centerName} / دراسة ${centerName}
- library = Bibliothèque / المكتبة
- meals = Repas / المطعم / وجبات
If the section is missing or unreadable, default: suivi=true, etude=true, library=false, meals=true.

RULES:
- Return ONLY the raw JSON object. No markdown, no \`\`\` fences, no explanation.
- Phone numbers: keep the exact digits as written (Tunisian format usually +216 or 71/72/73/74/75/78/79 numbers).
- If a name is in Arabic script, transliterate it to Latin characters (e.g. "محمد" → "Mohamed", " ben Ali" → "Ben Ali").
- Arabic grade mapping: "أولى ابتدائي" = "Primaire 1ère Année", "ثانية ابتدائي" = "Primaire 2ème Année", "ثالثة ابتدائي" = "Primaire 3ème Année", "رابعة ابتدائي" = "Primaire 4ème Année", "خامسة ابتدائي" = "Primaire 5ème Année", "سادسة ابتدائي" = "Primaire 6ème Année", "أولى ثانوي" = "Lycée 1ère Année", "ثانية ثانوي" = "Lycée 2ème Année", "ثالثة ثانوي" = "Lycée 3ème Année", "رابعة ثانوي" = "Lycée 4ème" → map to "Lycée 3ème Année" or "Baccalauréat" if Bac, "ثالثة متوسطة" = "Collège 9ème Année", "ثامنة متوسطة" = "Collège 8ème Année", "سابعة متوسطة" = "Collège 7ème Année".
- Parental situation: "متزوجان" = "mariés", "مطلق/ة" or "منفصلان" = "séparés_garde_mere", nothing visible = "mariés".
- Extract ALL siblings listed, ALL authorized persons listed.
- Extract parent birth dates (تاريخ الميلاد) and emails (البريد الإلكتروني / e-mail) when visible.
- If you truly cannot read a field, use empty string.`;

export interface ExtractedParentData {
  name: string;
  birthDate?: string;
  profession: string;
  phoneFixed: string;
  phoneMobile: string;
  address: string;
  email?: string;
}

export interface ExtractedStudentData {
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  grade: string;
  mother: ExtractedParentData;
  father: ExtractedParentData;
  parentalSituation: string;
   parentalComments: string;
  siblings: { name: string; age: number; grade: string }[];
  authorizedPersons?: { name: string; phone: string; relation: string }[];
  allergies: string;
 
  academicHistory: {
    nMinus1: { school: string; grade: string };
    nMinus2: { school: string; grade: string };
    nMinus3: { school: string; grade: string };
  };
    vaccinationCopyAttached: boolean;
  enrolledServices?: {
    suivi: boolean;
    etude: boolean;
    library: boolean;
    meals: boolean;
  };
   signatureDetails: {
    place: string;
    date: string;
    signedByName: string;
  };
}

function normalizeExtractedData(data: ExtractedStudentData): ExtractedStudentData {
  const normParent = (p: ExtractedParentData | undefined): ExtractedParentData => ({
    name: p?.name || '',
    birthDate: parseExtractedDate(p?.birthDate),
    profession: p?.profession || '',
    phoneFixed: digitsOnlyPhone(p?.phoneFixed),
    phoneMobile: digitsOnlyPhone(p?.phoneMobile),
    address: p?.address || '',
    email: p?.email || '',
  });

  return {
    ...data,
    birthDate: parseExtractedDate(data.birthDate),
    grade: normalizeExtractedGrade(data.grade),
    mother: normParent(data.mother),
    father: normParent(data.father),
    parentalComments:data.parentalComments,
    authorizedPersons: (data.authorizedPersons || []).map(ap => ({
      name: ap.name || '',
      phone: digitsOnlyPhone(ap.phone),
      relation: ap.relation || '',
    })),
    enrolledServices: data.enrolledServices ?? {
      suivi: false,
      etude: false,
      library: false,
      meals: false,
    },
  };
}

export async function extractStudentFromPages(pages: PageImage[], apiKeyOverride?: string, centerName = 'المركز'): Promise<ExtractedStudentData> {
  const apiKey = apiKeyOverride;
  if (!apiKey) throw new Error('مفتاح Gemini API غير مهيأ. أدخل المفتاح في صفحة الإعدادات');

  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: buildSystemPrompt(centerName) },
  ];
  for (let i = 0; i < pages.length; i++) {
    parts.push({ text: `--- Page ${i + 1} of ${pages.length} ---` });
    parts.push({ inlineData: { mimeType: pages[i].mime, data: pages[i].data } });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts }],
    config: {
      temperature: 0.1,
    },
  });

  const raw = response.text?.trim() || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('لم يتمكن الذكاء الاصطناعي من قراءة الصور. تأكد من وضوح الصورة.');

  const data = JSON.parse(jsonMatch[0]) as ExtractedStudentData;
  return normalizeExtractedData(data);
}
