import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bus,
  Search,
  CreditCard,
  CheckCircle2,
  Clock,
  Printer,
  X,
  UserPlus,
  Calendar,
  Users,
  AlertCircle,
  Trash2,
  Wallet,
  CircleDollarSign,
} from 'lucide-react';
import {
  Student,
  StudentUpdate,
  PaymentRecord,
  CenterSettings,
  AcademicMonth,
  ACADEMIC_MONTHS,
  ARABIC_ACADEMIC_MONTHS,
  getCurrentAcademicYear,
  getCurrentAcademicIndex,
  getFeesForYear,
  generateReceiptNumber,
  paymentMethodLabel,
} from '../types';
import { useToast } from './Toast';

interface TransportSubscriptionModuleProps {
  students: Student[];
  settings?: CenterSettings | null;
  /** Enrollment-only mutation (enrolledServices + fees). */
  onUpdateStudent: (student: StudentUpdate) => void;
  /** Payment-only mutation: POST /api/payments (the student is never rewritten). */
  onRecordPayment: (studentId: string, payment: PaymentRecord) => void;
}

type MonthStatus = {
  status: 'paid' | 'advance' | 'unpaid';
  paidAmount: number;
  remaining: number;
  discount: number;
  paymentRecord?: PaymentRecord;
};

const EMPTY_SUIVI_FEES = { annualRegistrationFee: 0, monthlyFee: 0 };
const EMPTY_MEAL_SUBSCRIPTION = {
  mode: 'subscription' as const,
  monthlyPrice: 0,
  unitPrice: 0,
  prepaidMeals: 0,
  consumedMealsCount: 0,
  active: false,
};

/**
 * Abonnements Transport — même logique de gestion que la Moutaba'a:
 *  - uniquement les élèves inscrits au service transport ;
 *  - grille mensuelle Septembre → Mai ;
 *  - paiement mensuel via POST /api/payments (service « Transport ») ;
 *  - inscription / désinscription via les inscriptions de services de l'élève.
 */
export default function TransportSubscriptionModule({
  students,
  settings,
  onUpdateStudent,
  onRecordPayment,
}: TransportSubscriptionModuleProps) {
  const toast = useToast();
  const centerName = settings?.centerName || 'EduSphère';
  const [searchTerm, setSearchTerm] = useState('');
  const [schoolYear, setSchoolYear] = useState<string>(getCurrentAcademicYear());
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [unenrollStudent, setUnenrollStudent] = useState<Student | null>(null);

  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState<Student | null>(null);
  const [paymentMonth, setPaymentMonth] = useState<AcademicMonth>('Septembre');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'Espèces' | 'Chèque'>('Espèces');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState<{ student: Student; payment: PaymentRecord } | null>(null);

  const currentMonth: AcademicMonth = useMemo(() => {
    const idx = getCurrentAcademicIndex();
    return ACADEMIC_MONTHS[idx >= 0 ? idx : 0];
  }, []);

  const years = useMemo(() => {
    const set = new Set<string>([getCurrentAcademicYear(), schoolYear]);
    students.forEach(st => { if (st.academicYear) set.add(st.academicYear); });
    return Array.from(set).filter(Boolean).sort().reverse();
  }, [students, schoolYear]);

  const studentYear = (st: Student) => st.academicYear || schoolYear;
  const matchesYear = (st: Student) => schoolYear === 'all' || studentYear(st) === schoolYear;
  const matchesSearch = (st: Student) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return `${st.firstName} ${st.lastName} ${st.grade || ''}`.toLowerCase().includes(q);
  };

  const monthlyFeeFor = (st: Student): number => {
    if (settings) return getFeesForYear(settings, studentYear(st)).fraisTransportMensuel || 0;
    return st.transportFees?.monthlyFee || 0;
  };

  const transportStudents = useMemo(
    () => students.filter(st => st.enrolledServices?.transport === true && matchesYear(st) && matchesSearch(st)),
    [students, schoolYear, searchTerm]
  );

  const nonEnrolledStudents = useMemo(
    () => students.filter(st => st.enrolledServices?.transport !== true && matchesYear(st)),
    [students, schoolYear]
  );

  const enrollmentSearchResults = useMemo(() => {
    const q = enrollSearch.trim().toLowerCase();
    return nonEnrolledStudents.filter(st => !q || `${st.firstName} ${st.lastName} ${st.grade || ''}`.toLowerCase().includes(q));
  }, [nonEnrolledStudents, enrollSearch]);

  const getMonthStatus = (st: Student, month: AcademicMonth): MonthStatus => {
    const monthLabel = `${month} (${studentYear(st)})`;
    const monthPayments = (st.payments || []).filter(
      p => p.service === 'Transport' && p.month === monthLabel
    );
    const storedDiscount = monthPayments.reduce((max, p) => Math.max(max, p.discount || 0), 0);
    const required = Math.max(0, monthlyFeeFor(st) - storedDiscount);
    if (monthPayments.length === 0) {
      return { status: 'unpaid', paidAmount: 0, remaining: required, discount: storedDiscount };
    }
    const paidAmount = monthPayments.reduce((sum, p) => sum + p.amountPaid, 0);
    const lastPayment = monthPayments[monthPayments.length - 1];
    if (paidAmount >= required) {
      return { status: 'paid', paidAmount, remaining: 0, discount: storedDiscount, paymentRecord: lastPayment };
    }
    return {
      status: 'advance',
      paidAmount,
      remaining: Math.max(0, required - paidAmount),
      discount: storedDiscount,
      paymentRecord: lastPayment,
    };
  };

  const openPayment = (st: Student, month: AcademicMonth) => {
    const fee = monthlyFeeFor(st);
    if (fee <= 0) {
      toast.error('حدد رسوم النقل الشهرية في الإعدادات قبل تسجيل أي دفعة!');
      return;
    }
    const status = getMonthStatus(st, month);
    if (status.status === 'paid' && status.paymentRecord) {
      setPrintingReceipt({ student: st, payment: status.paymentRecord });
      return;
    }
    setSelectedStudentForPayment(st);
    setPaymentMonth(month);
    setDiscount(status.discount);
    setAmountPaid(status.status === 'advance' ? status.remaining : Math.max(0, fee - status.discount));
    setPaymentMethod('Espèces');
    setChequeNumber('');
    setChequeDate(new Date().toISOString().split('T')[0]);
    setNotes(status.status === 'advance'
      ? `تكملة خلاص باقي شهر ${ARABIC_ACADEMIC_MONTHS[month]} — اشتراك النقل (${studentYear(st)})`
      : `خلاص اشتراك النقل لشهر ${ARABIC_ACADEMIC_MONTHS[month]} (${studentYear(st)})`);
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForPayment || isSubmitting) return;
    setIsSubmitting(true);

    if (paymentMethod === 'Chèque' && (!chequeNumber.trim() || !chequeDate)) {
      toast.error('يجب إدخال رقم الشيك وتاريخ الدفع عند الدفع بالشيك!');
      setIsSubmitting(false);
      return;
    }

    const st = selectedStudentForPayment;
    const fee = monthlyFeeFor(st);
    const status = getMonthStatus(st, paymentMonth);
    const numDiscount = Math.max(0, Number(discount) || 0);

    if (fee <= 0) {
      toast.error('حدد رسوم النقل الشهرية في الإعدادات قبل تسجيل أي دفعة!');
      setIsSubmitting(false);
      return;
    }
    if (numDiscount >= fee) {
      toast.error('قيمة التخفيض يجب أن تكون أقل من المبلغ المستوجب!');
      setIsSubmitting(false);
      return;
    }

    const effectiveRequired = Math.max(0, fee - numDiscount);
    const maxPayable = Math.max(0, effectiveRequired - status.paidAmount);
    const paid = Math.max(0, Number(amountPaid) || 0);
    if (paid <= 0) {
      toast.error('المبلغ المدفوع يجب أن يكون أكبر من صفر!');
      setIsSubmitting(false);
      return;
    }
    if (paid > maxPayable) {
      toast.error(`المبلغ المدفوع أكبر من باقي المبلغ المستوجب (${maxPayable} د.ت)!`);
      setIsSubmitting(false);
      return;
    }

    const totalPaidAfterThis = status.paidAmount + paid;
    const newPayment: PaymentRecord = {
      id: 'pay_' + crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      amountPaid: paid,
      totalRequired: effectiveRequired,
      remainingBalance: Math.max(0, effectiveRequired - totalPaidAfterThis),
      service: 'Transport',
      month: `${paymentMonth} (${studentYear(st)})`,
      paymentType: totalPaidAfterThis >= effectiveRequired ? 'full' : 'balance',
      method: paymentMethod,
      chequeNumber: paymentMethod === 'Chèque' ? chequeNumber : undefined,
      chequeDate: paymentMethod === 'Chèque' ? chequeDate : undefined,
      receiptNumber: generateReceiptNumber(students, 'REC-'),
      notes: notes || `اشتراك النقل — ${paymentMonth} (${studentYear(st)})`,
      discount: numDiscount > 0 ? numDiscount : undefined,
    };

    onRecordPayment(st.id, newPayment);
    setSelectedStudentForPayment(null);
    setPrintingReceipt({ student: { ...st, payments: [...(st.payments || []), newPayment] }, payment: newPayment });
    setIsSubmitting(false);
  };

  const enrollmentPayload = (st: Student, enrolled: boolean, monthlyFee: number): StudentUpdate => ({
    id: st.id,
    enrolledServices: {
      suivi: st.enrolledServices?.suivi ?? false,
      etude: st.enrolledServices?.etude ?? false,
      library: st.enrolledServices?.library ?? false,
      meals: st.enrolledServices?.meals ?? false,
      gouterMatin: st.enrolledServices?.gouterMatin ?? false,
      gouterSoir: st.enrolledServices?.gouterSoir ?? false,
      gouterBoth: st.enrolledServices?.gouterBoth ?? false,
      transport: enrolled,
    },
    // Le PUT remplace les inscriptions quand `enrolledServices` est fourni :
    // on renvoie donc les frais des autres services pour ne pas les remettre à 0.
    suiviFees: st.suiviFees || EMPTY_SUIVI_FEES,
    etudeFees: st.etudeFees || EMPTY_SUIVI_FEES,
    libraryFees: st.libraryFees || EMPTY_SUIVI_FEES,
    transportFees: { monthlyFee },
    mealSubscription: st.mealSubscription || EMPTY_MEAL_SUBSCRIPTION,
  });

  const handleEnrollStudent = (st: Student) => {
    onUpdateStudent(enrollmentPayload(st, true, monthlyFeeFor(st)));
    setIsEnrollModalOpen(false);
    setEnrollSearch('');
    toast.success(`تم إلحاق التلميذ (${st.firstName} ${st.lastName}) بخدمة النقل.`);
  };

  const handleUnenrollStudent = () => {
    if (!unenrollStudent) return;
    const st = unenrollStudent;
    onUpdateStudent(enrollmentPayload(st, false, st.transportFees?.monthlyFee || monthlyFeeFor(st)));
    setUnenrollStudent(null);
    toast.success(`تم إلغاء اشتراك النقل للتلميذ (${st.firstName} ${st.lastName}).`);
  };

  const stats = useMemo(() => {
    let paid = 0;
    let advance = 0;
    let unpaid = 0;
    let expected = 0;
    transportStudents.forEach(st => {
      const fee = monthlyFeeFor(st);
      expected += fee;
      const status = getMonthStatus(st, currentMonth);
      if (status.status === 'paid') paid += 1;
      else if (status.status === 'advance') advance += 1;
      else unpaid += 1;
    });
    return { paid, advance, unpaid, expected };
  }, [transportStudents, currentMonth, settings, schoolYear]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-brand-600/[0.06] text-brand-700 text-xs font-bold rounded-lg border border-brand-600/20">
              اشتراك النقل
            </span>
            <span className="text-xs text-slate-400 font-bold">إدارة التلاميذ المسجلين في خدمة النقل</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <Bus className="h-6 w-6 text-brand-600" />
            اشتراك النقل المدرسي
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            متابعة الاشتراكات الشهرية للتلاميذ المُلحقين بخدمة النقل وتسجيل دفعاتهم.
          </p>
        </div>

        {nonEnrolledStudents.length > 0 && (
          <button
            onClick={() => { setIsEnrollModalOpen(true); setEnrollSearch(''); }}
            data-testid="transport-enroll-open"
            className="px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs rounded-2xl shadow-md cursor-pointer flex items-center gap-2 shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            إلحاق تلميذ بالنقل
          </button>
        )}
      </div>

      {monthlyFeeFor({ academicYear: schoolYear } as Student) <= 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 no-print">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-800">
            رسوم النقل الشهرية غير محددة في الإعدادات. حدد «رسوم النقل الشهرية» قبل تسجيل الدفعات.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 no-print">
        <StatCard icon={<Users className="h-4 w-4" />} label="تلاميذ النقل" value={String(transportStudents.length)} tone="brand" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label={`مسددون — ${ARABIC_ACADEMIC_MONTHS[currentMonth]}`} value={String(stats.paid)} tone="emerald" />
        <StatCard icon={<Clock className="h-4 w-4" />} label="خلاص جزئي" value={String(stats.advance)} tone="amber" />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="غير مسددين" value={String(stats.unpaid)} tone="red" />
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/70 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between no-print">
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم التلميذ أو المستوى..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Calendar className="h-4 w-4 text-brand-600 shrink-0" />
          <label className="text-xs font-black text-slate-700">السنة الدراسية:</label>
          <select
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-600"
          >
            {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5 no-print">
        <div className="p-5 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">شبكة اشتراكات النقل ({schoolYear})</h3>
            <p className="text-xs text-slate-500">اضغط على شهر لتسجيل دفعة أو معاينة الوصل.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold whitespace-nowrap">
            <Legend color="bg-emerald-500" label="مسدد" />
            <Legend color="bg-amber-500" label="خلاص جزئي" />
            <Legend color="bg-red-400" label="غير مسدد" />
          </div>
        </div>

        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1050px] text-right text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">التلميذ</th>
                <th className="p-4">الاشتراك الشهري</th>
                {ACADEMIC_MONTHS.map(m => (
                  <th key={m} className="p-3 text-center">{ARABIC_ACADEMIC_MONTHS[m]}</th>
                ))}
                <th className="p-3 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transportStudents.length === 0 ? (
                <tr>
                  <td colSpan={ACADEMIC_MONTHS.length + 3} className="p-10 text-center text-slate-400 font-bold">
                    لا يوجد تلاميذ مسجلون في خدمة النقل.
                  </td>
                </tr>
              ) : (
                transportStudents.map(st => {
                  const fee = monthlyFeeFor(st);
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition" data-testid={`transport-student-${st.id}`}>
                      <td className="p-4 font-extrabold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-xl bg-brand-600/[0.08] text-brand-700 flex items-center justify-center shrink-0">
                            <Bus className="h-4 w-4" />
                          </span>
                          <div>
                            <div>{st.firstName} {st.lastName}</div>
                            <div className="text-[10px] text-slate-400 font-bold">{st.grade || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-mono font-black text-slate-800">{fee} د.ت</td>
                      {ACADEMIC_MONTHS.map(m => {
                        const status = getMonthStatus(st, m);
                        const disabled = fee <= 0;
                        return (
                          <td key={m} className="p-2 text-center">
                            <button
                              type="button"
                              data-testid={`transport-month-${st.id}-${m}`}
                              disabled={disabled}
                              onClick={() => openPayment(st, m)}
                              title={disabled ? 'حدد رسوم النقل أولاً' : `${m} — ${status.status}`}
                              className={`w-full min-w-[72px] px-2 py-2 rounded-xl border text-[10px] font-black transition ${
                                disabled
                                  ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                                  : status.status === 'paid'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : status.status === 'advance'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                      : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                              } cursor-pointer`}
                            >
                              {disabled ? '—' : status.status === 'paid'
                                ? '✓ مسدد'
                                : status.status === 'advance'
                                  ? `باقي ${status.remaining}`
                                  : 'غير مسدد'}
                            </button>
                          </td>
                        );
                      })}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => setUnenrollStudent(st)}
                          data-testid={`transport-unenroll-${st.id}`}
                          title="إلغاء اشتراك النقل"
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ENROLL MODAL */}
      <AnimatePresence>
        {isEnrollModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden"
            >
              <div className="p-5 bg-brand-600 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  <div>
                    <h3 className="font-black text-sm">إلحاق تلميذ بخدمة النقل</h3>
                    <p className="text-[10px] text-white/70 font-bold">الاشتراك الشهري: {monthlyFeeFor({ academicYear: schoolYear } as Student)} د.ت</p>
                  </div>
                </div>
                <button onClick={() => setIsEnrollModalOpen(false)} className="p-2 hover:bg-white/10 rounded-xl cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={enrollSearch}
                    onChange={(e) => setEnrollSearch(e.target.value)}
                    placeholder="بحث عن تلميذ..."
                    className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-600"
                  />
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                  {enrollmentSearchResults.length === 0 ? (
                    <p className="p-6 text-center text-xs font-bold text-slate-400">لا يوجد تلاميذ متاحون للإلحاق.</p>
                  ) : enrollmentSearchResults.map(st => (
                    <div key={st.id} className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{st.firstName} {st.lastName}</p>
                        <p className="text-[10px] font-bold text-slate-400">{st.grade || '—'} — {studentYear(st)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEnrollStudent(st)}
                        data-testid={`transport-enroll-${st.id}`}
                        className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-black rounded-xl transition cursor-pointer flex items-center gap-1"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        إلحاق
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* UNENROLL CONFIRM */}
      <AnimatePresence>
        {unenrollStudent && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 bg-red-600 text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-black text-sm">إلغاء اشتراك النقل</h3>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm font-bold text-slate-700 leading-relaxed">
                  هل تريد إلغاء اشتراك النقل للتلميذ{' '}
                  <strong className="text-slate-950">{unenrollStudent.firstName} {unenrollStudent.lastName}</strong>؟
                </p>
                <p className="text-[11px] font-bold text-slate-400">
                  سيبقى سجل الدفعات محفوظاً في المنظومة المالية، لكن التلميذ لن يظهر بعد الآن في خطة الحافلة ولا في شبكة الاشتراكات.
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setUnenrollStudent(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">
                    إلغاء
                  </button>
                  <button
                    onClick={handleUnenrollStudent}
                    data-testid="transport-unenroll-confirm"
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl cursor-pointer"
                  >
                    تأكيد الإلغاء
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PAYMENT MODAL */}
      <AnimatePresence>
        {selectedStudentForPayment && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-5 bg-brand-600 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  <div>
                    <h3 className="font-black text-sm">دفع اشتراك النقل</h3>
                    <p className="text-[10px] text-white/70 font-bold">
                      {selectedStudentForPayment.firstName} {selectedStudentForPayment.lastName} — {paymentMonth} ({studentYear(selectedStudentForPayment)})
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedStudentForPayment(null)} className="p-2 hover:bg-white/10 rounded-xl cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitPayment} className="p-5 space-y-4 text-xs">
                {(() => {
                  const st = selectedStudentForPayment;
                  const fee = monthlyFeeFor(st);
                  const status = getMonthStatus(st, paymentMonth);
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] text-slate-500 font-bold block">المبلغ الشهري</span>
                        <strong className="text-sm font-black text-slate-900 font-mono">{fee} د.ت</strong>
                      </div>
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <span className="text-[10px] text-emerald-700 font-bold block">المسدد</span>
                        <strong className="text-sm font-black text-emerald-700 font-mono">{status.paidAmount} د.ت</strong>
                      </div>
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                        <span className="text-[10px] text-red-600 font-bold block">الباقي</span>
                        <strong className="text-sm font-black text-red-700 font-mono">{status.remaining} د.ت</strong>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-black text-slate-600 block mb-1">التخفيض (د.ت)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-slate-600 block mb-1">المبلغ المدفوع (د.ت)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
                      data-testid="transport-pay-amount"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-600 block mb-1">طريقة الدفع</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'Espèces' | 'Chèque')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-600"
                  >
                    <option value="Espèces">Espèces</option>
                    <option value="Chèque">Chèque</option>
                  </select>
                </div>

                {paymentMethod === 'Chèque' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-black text-slate-600 block mb-1">رقم الشيك</label>
                      <input
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-slate-600 block mb-1">تاريخ الشيك</label>
                      <input
                        type="date"
                        value={chequeDate}
                        onChange={(e) => setChequeDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-black text-slate-600 block mb-1">ملاحظات</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentForPayment(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="transport-pay-submit"
                    className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-black rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <CircleDollarSign className="h-4 w-4" />
                    تسجيل الدفعة
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RECEIPT MODAL */}
      <AnimatePresence>
        {printingReceipt && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-8"
            >
              <div className="p-5 bg-slate-900 text-white flex justify-between items-center no-print">
                <div className="flex items-center gap-2">
                  <Printer className="h-5 w-5 text-brand-500" />
                  <h3 className="font-black text-sm">وصل خلاص اشتراك النقل</h3>
                </div>
                <button onClick={() => setPrintingReceipt(null)} className="p-2 hover:bg-white/10 rounded-xl cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 overflow-y-auto">
                {(() => {
                  const { student, payment } = printingReceipt;
                  const monthPayments = (student.payments || []).filter(p => p.service === 'Transport' && p.month === payment.month);
                  const totalPaid = monthPayments.reduce((sum, p) => sum + p.amountPaid, 0);
                  const totalRequired = payment.totalRequired || 0;
                  const remaining = Math.max(0, totalRequired - totalPaid);
                  const totalDiscount = monthPayments.reduce((max, p) => Math.max(max, p.discount || 0), 0);
                  return (
                    <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col">
                      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                        <div>
                          <h2 className="text-lg font-black text-slate-950">{centerName} — وصل خلاص اشتراك النقل</h2>
                          <p className="text-[10px] text-slate-500 font-mono">رقم الوصل: {payment.receiptNumber}</p>
                          <p className="text-[10px] text-slate-400">تاريخ الدفعة: {payment.date}</p>
                        </div>
                        <div className="text-left font-mono font-bold text-xs bg-slate-100 p-2 rounded border border-slate-300">
                          <p>الخدمة: <strong>النقل المدرسي</strong></p>
                          <p className="text-[11px] text-brand-700 mt-0.5">الشهر: {payment.month}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="text-slate-500 font-bold">اسم التلميذ(ة):</span>
                          <span className="font-extrabold text-slate-900">{student.firstName} {student.lastName}{student.grade ? ` (${student.grade})` : ''}</span>
                        </div>
                        <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="text-slate-500 font-bold">اسم الولي المسجل:</span>
                          <span className="font-bold text-slate-800">{student.father?.name || student.mother?.name || 'غير مدون'}</span>
                        </div>

                        <div className="space-y-1.5 pt-2">
                          <h4 className="font-extrabold text-xs text-slate-900 flex justify-between items-center">
                            <span>سجل دفعات هذا الشهر:</span>
                            <span className="text-[10px] text-slate-500 font-normal">عدد الدفعات: {monthPayments.length}</span>
                          </h4>
                          <div className="border border-slate-300 rounded-xl overflow-x-auto">
                            <table className="min-w-[520px] w-full text-right text-[11px]">
                              <thead className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                                <tr>
                                  <th className="p-2">#</th>
                                  <th className="p-2">التاريخ</th>
                                  <th className="p-2">رقم الوصل</th>
                                  <th className="p-2">طريقة الدفع</th>
                                  <th className="p-2 text-left">المبلغ</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 bg-white">
                                {monthPayments.map((p, idx) => (
                                  <tr key={p.id || idx}>
                                    <td className="p-2 font-bold text-slate-400">{idx + 1}</td>
                                    <td className="p-2 font-mono text-slate-700">{p.date}</td>
                                    <td className="p-2 font-mono text-slate-500 text-[10px]">{p.receiptNumber}</td>
                                    <td className="p-2 font-bold">{paymentMethodLabel(p.method)}</td>
                                    <td className="p-2 text-left font-black font-mono text-brand-700">{p.amountPaid} د.ت</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2">
                          <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-300">
                            <span className="text-[10px] text-slate-600 block font-bold">مبلغ الشهر:</span>
                            <span className="text-base font-black text-slate-900 font-mono">{totalRequired} د.ت</span>
                          </div>
                          <div className="p-2.5 bg-brand-600/[0.06] rounded-xl border border-brand-600/30">
                            <span className="text-[10px] text-brand-700 block font-bold">المسدد حتى الآن:</span>
                            <span className="text-base font-black text-brand-700 font-mono">{totalPaid} د.ت</span>
                          </div>
                          <div className={`p-2.5 rounded-xl border ${remaining === 0 ? 'bg-slate-50 border-slate-200' : 'bg-brand-600/[0.06] border-brand-600/20'}`}>
                            <span className="text-[10px] text-brand-700 block font-bold">الرصيد المتبقي:</span>
                            <span className={`text-base font-black font-mono ${remaining === 0 ? 'text-slate-400' : 'text-red-700'}`}>{remaining} د.ت</span>
                          </div>
                        </div>

                        {totalDiscount > 0 && (
                          <div className="p-2.5 bg-brand-600/[0.06] rounded-xl border border-brand-600/20 flex justify-between items-center">
                            <span className="text-[10px] text-brand-700 font-bold">إجمالي التخفيض:</span>
                            <span className="text-base font-black text-brand-700 font-mono">-{totalDiscount} د.ت</span>
                          </div>
                        )}

                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center font-bold">
                          {remaining === 0 ? (
                            <span className="text-brand-700 text-xs flex items-center justify-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />
                              حالة الشهر: مسدد بالكامل
                            </span>
                          ) : (
                            <span className="text-brand-700 text-xs">حالة الشهر: خلاص جزئي — باقي: {remaining} د.ت</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-8 pt-4 border-t border-slate-300">
                        <div className="flex justify-between items-center text-[10px] text-slate-500 mb-8">
                          <p>نشكركم على ثقتكم في مركز {centerName}.</p>
                          <p className="font-bold text-slate-900">ختم وإدارة مركز {centerName}</p>
                        </div>
                        <div className="w-1/2 text-center mr-auto">
                          <div className="border-b-2 border-dotted border-slate-400 h-20 mb-1"></div>
                          <p className="text-[10px] text-slate-500 font-bold">ختم وإمضاء إدارة المركز</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 no-print">
                <button onClick={() => setPrintingReceipt(null)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">
                  إغلاق
                </button>
                <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-black rounded-xl cursor-pointer flex items-center gap-1.5">
                  <Printer className="h-4 w-4" />
                  طباعة الوصل
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'brand' | 'emerald' | 'amber' | 'red' }) {
  const tones = {
    brand: 'bg-brand-600/[0.06] text-brand-700 border-brand-600/20',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  };
  return (
    <div className={`p-4 rounded-2xl border ${tones[tone]} flex items-center justify-between gap-2`}>
      <div>
        <span className="text-[10px] font-bold block opacity-80">{label}</span>
        <strong className="text-xl font-black font-mono">{value}</strong>
      </div>
      <span className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center shrink-0">{icon}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-slate-600">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
      {label}
    </span>
  );
}
