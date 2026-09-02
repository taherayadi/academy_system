import { GoogleGenAI } from '@google/genai';

export interface AnalysisStats {
  period: string;
  schoolYear: string;
  totalStudents: number;
  studentsByGrade: Record<string, number>;
  totalStaff: number;
  staffByRole: Record<string, number>;
  slotsCount: number;
  activeCourses: number;
  mealDaysCount: number;
  totalMealAttendances: number;
  mealAttendanceByDish: Record<string, { count: number; unitPaid: number; subscriptionCount: number }>;
  weeklyMealPlan: Record<string, { dish: string; attendees: number; date: string }[]>;
  incomeByService: Record<string, number>;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  expensesByCategory: Record<string, number>;
  totalRevisionSessions: number;
  revisionRevenue: number;
  revisionStudentsCount: number;
  externalCourseStudents: number;
  externalCourseRevenue: number;
  externalCourseSessions: number;
  paymentMethodBreakdown: Record<string, number>;
  avgIncomePerStudent: number;
  monthlyIncomeByMonth: Record<string, number>;
}

const buildSystemPrompt = (centerName: string) => `أنت محلل أعمال محترف متخصص في إدارة مراكز التعليم وال戕벌 في تونس.
المستخدم يدير مركزاً تعليمياً اسمه "${centerName}" في صفاقس.
يحتوي المركز على:
- تسجيل تلاميذ داخليين ( suivi, étude, مكتبة, وجبات)
- دروس خصوصية مع تلاميذ خارجيين
- حصص مراجعة مع أساتذة خارجيين
- إدارة موظفين

حلل البيانات المقدمة وقدم تحليلاً شاملاً بالعربية (الدارجة التونسية + الفصحى).

قدم التحليل بالشكل التالي:
1. **ملخص تنفيذي** — إجمالي الدخل والمصاريف وصافي الربح
2. **تحليل كل وحدة** — عدد المستفيدين والمدخول لكل خدمة (suivi, étude, مكتبة, وجبات, دروس خصوصية, مراجعة)
3. **تحليل الوجبات** — أكثر الأطباق طلباً والأقل طلباً + خطة الأسبوع
4. **المؤشرات الرئيسية** — مدخول لكل تلميذ، تكلفة الموظفين نسبة للدخل
5. **توصيات عملية** — 5-8 توصيات محددة لزيادة الدخل وتحسين الخدمة
6. **نقاط ضعف** — ما الذي يحتاج تحسين

استخدم جداول وأرقام محددة. كن عملياً ومقتراحاً.`;

export async function analyzeCenterData(stats: AnalysisStats, apiKey?: string, centerName = 'المركز'): Promise<string> {
  if (!apiKey) throw new Error('مفتاح Gemini API غير مهيأ. أدخل المفتاح في صفحة الإعدادات');

  const ai = new GoogleGenAI({ apiKey });

  const dataSummary = JSON.stringify(stats, null, 2);

  const userMessage = `فترة التحليل: ${stats.period}
السنة الدراسية: ${stats.schoolYear}

--- بيانات المركز ---
${dataSummary}

---

حلل هذه البيانات واقدم توصيات عملية لزيادة الدخل وتحسين الخدمة.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [{ role: 'user', parts: [{ text: buildSystemPrompt(centerName) + '\n\n' + userMessage }] }],
    config: { temperature: 0.3 },
  });

  return response.text?.trim() || 'لم يتمكن الذكاء الاصطناعي من إنشاء التحليل.';
}
