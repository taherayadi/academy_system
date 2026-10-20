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
  AlertCircle,
  Trash2,
  FileCheck,
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
import DateField from './DateField';

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
 * Abonnements Transport — même logique et même interface que la Moutaba'a:
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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [unenrollStudent, setUnenrollStudent] = useState<Student | null>(null);

  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState<Student | null>(null);
  const [paymentMonth, setPaymentMonth] = useState<AcademicMonth>('Septembre');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [totalRequired, setTotalRequired] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<'full' | 'advance' | 'balance'>('full');
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

  const totalPages = Math.ceil(transportStudents.length / 20) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedStudents = transportStudents.slice((safePage - 1) * 20, safePage * 20);

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
    setTotalRequired(fee);
    setPaymentMethod('Espèces');
    setChequeNumber('');
    setChequeDate(new Date().toISOString().split('T')[0]);
    if (status.status === 'advance') {
      setAmountPaid(status.remaining);
      setPaymentType('balance');
      setNotes(`تكملة خلاص باقي شهر ${month} (السنة ${studentYear(st)})`);
    } else {
      setAmountPaid(Math.max(0, fee - status.discount));
      setPaymentType('full');
      setNotes(`خلاص اشتراك النقل لشهر ${month} (السنة ${studentYear(st)})`);
    }
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
      paymentType: totalPaidAfterThis >= effectiveRequired ? (paymentType === 'balance' ? 'balance' : 'full') : 'advance',
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

  const standardFee = selectedStudentForPayment ? monthlyFeeFor(selectedStudentForPayment) : 0;
  const activeMonthStatus = selectedStudentForPayment ? getMonthStatus(selectedStudentForPayment, paymentMonth) : null;
  const isAdvanceStatus = activeMonthStatus?.status === 'advance';

  return (
    <div className="space-y-6">

      {/* Module Banner */}
      <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-brand-600/[0.06] text-brand-700 text-xs font-bold rounded-lg border border-brand-600/20">
              اشتراك النقل
            </span>
            <span className="text-xs text-slate-400 font-bold">المتابعة الشهرية لخدمة النقل</span>
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

      {/* Filter and Academic Year Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/70 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between no-print">
        <div className="relative w-full sm:w-80">
          <Search className="absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            placeholder="بحث باسم التلميذ أو المستوى..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Calendar className="h-4 w-4 text-brand-600 shrink-0" />
          <label className="text-xs font-black text-slate-700">السنة الدراسية:</label>
          <select
            value={schoolYear}
            onChange={(e) => { setSchoolYear(e.target.value); setCurrentPage(1); }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-600"
          >
            {years.map(yr => <option key={yr} value={yr}>السنة الدراسية {yr}</option>)}
          </select>
        </div>
      </div>

      {/* TRANSPORT MONTH GRID TABLE (Septembre -> Mai) */}
      <div className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5 no-print">
        <div className="p-5 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">شبكة اشتراكات النقل ({schoolYear})</h3>
            <p className="text-xs text-slate-500">اضغط على شهر لتسجيل دفعة أو معاينة الوصل.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-bold whitespace-nowrap">
            <div className="flex items-center gap-1.5 text-amber-700">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span>Payé</span>
            </div>
            <div className="flex items-center gap-1.5 text-brand-700">
              <div className="w-3 h-3 rounded-full bg-brand-600"></div>
              <span>Avance</span>
            </div>
            <div className="flex items-center gap-1.5 text-red-600">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <span>Non payé</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1100px] text-right text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">التلميذ</th>
                <th className="p-4">الاشتراك الشهري</th>
                {ACADEMIC_MONTHS.map(m => (
                  <th key={m} className="p-4 text-center">
                    {ARABIC_ACADEMIC_MONTHS[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedStudents.length === 0 ? (
                <tr>
                  <td colSpan={ACADEMIC_MONTHS.length + 2} className="p-8 text-center text-slate-400 font-bold">
                    لا يوجد تلاميذ مسجلون في خدمة النقل.
                  </td>
                </tr>
              ) : (
                paginatedStudents.map(st => {
                  const fee = monthlyFeeFor(st);
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition" data-testid={`transport-student-${st.id}`}>
                      <td className="p-4 font-extrabold text-slate-900">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setUnenrollStudent(st)}
                            data-testid={`transport-unenroll-${st.id}`}
                            title="إلغاء اشتراك النقل"
                            className="p-1.5 shrink-0 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 transition cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{st.firstName} {st.lastName}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono font-bold">{fee} د.ت</td>

                      {/* Academic months cells */}
                      {ACADEMIC_MONTHS.map(m => {
                        const mStatus = getMonthStatus(st, m);
                        const disabled = fee <= 0;
                        return (
                          <td key={m} className="p-3 text-center">
                            {disabled ? (
                              <button
                                type="button"
                                disabled
                                data-testid={`transport-month-${st.id}-${m}`}
                                title="حدد رسوم النقل أولاً"
                                className="w-full py-1.5 px-2 bg-slate-50 text-slate-300 border border-slate-200 rounded-xl font-bold text-[10px] cursor-not-allowed"
                              >
                                —
                              </button>
                            ) : mStatus.status === 'paid' ? (
                              <button
                                type="button"
                                onClick={() => openPayment(st, m)}
                                data-testid={`transport-month-${st.id}-${m}`}
                                className="w-full py-1.5 px-2 bg-amber-100 text-amber-800 border border-amber-300 rounded-xl font-black text-[10px] flex items-center justify-center gap-1 hover:bg-brand-600/20 transition cursor-pointer"
                                title="طباعة الوصل"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Payé ({mStatus.paidAmount} د.ت) 🖨️
                              </button>
                            ) : mStatus.status === 'advance' ? (
                              <button
                                type="button"
                                onClick={() => openPayment(st, m)}
                                data-testid={`transport-month-${st.id}-${m}`}
                                className="w-full py-1.5 px-2 bg-brand-600/10 text-brand-700 border border-brand-600/20 rounded-xl font-black text-[10px] flex items-center justify-center gap-1 hover:bg-brand-600/20 transition cursor-pointer"
                              >
                                <Clock className="h-3 w-3" />
                                Avance ({mStatus.paidAmount} د.ت)
                                <span className="block text-[9px] font-normal">باقي {mStatus.remaining}د.ت</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openPayment(st, m)}
                                data-testid={`transport-month-${st.id}-${m}`}
                                className="w-full py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-xl font-bold text-[10px] transition cursor-pointer"
                              >
                                Non payé
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls (20 by 20) */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              عرض {((safePage - 1) * 20) + 1} - {Math.min(safePage * 20, transportStudents.length)} من أصل {transportStudents.length} تلميذ
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={safePage === 1}
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                السابقة
              </button>
              <span className="text-xs font-black text-slate-700">
                صفحة {safePage} من {totalPages}
              </span>
              <button
                disabled={safePage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                التالية
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ENROLL STUDENT MODAL */}
      <AnimatePresence>
        {isEnrollModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-brand-600 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-white/80" />
                  <h3 className="text-lg font-black">إلحاق تلميذ بخدمة النقل</h3>
                </div>

                <button
                  onClick={() => setIsEnrollModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500 font-medium">
                  اختر تلميذاً من القائمة العامة لإلحاقه بخدمة النقل (الاشتراك الشهري: {monthlyFeeFor({ academicYear: schoolYear } as Student)} د.ت):
                </p>

                {nonEnrolledStudents.length > 0 && (
                  <div className="relative">
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={enrollSearch}
                      onChange={(e) => setEnrollSearch(e.target.value)}
                      placeholder="بحث باسم التلميذ..."
                      className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                )}

                {nonEnrolledStudents.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
                    جميع التلاميذ مسجلون في خدمة النقل!
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                    {enrollmentSearchResults.length === 0 ? (
                      <p className="p-6 text-center text-xs font-bold text-slate-400">لا يوجد تلاميذ متاحون للإلحاق.</p>
                    ) : enrollmentSearchResults.map(st => (
                      <div key={st.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-xs text-slate-900">{st.firstName} {st.lastName}</p>
                          <p className="text-[10px] text-slate-400">{st.grade || '—'} — ولي الأمر: <span dir="ltr">{st.father?.phoneMobile || st.mother?.phoneMobile || 'لا يوجد'}</span></p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEnrollStudent(st)}
                          data-testid={`transport-enroll-${st.id}`}
                          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-slate-900/5 cursor-pointer flex items-center gap-1"
                        >
                          <FileCheck className="h-3.5 w-3.5" />
                          إلحاق بالنقل
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setIsEnrollModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إغلاق
                  </button>
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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-brand-600 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-300" />
                  <div>
                    <h3 className="text-lg font-black">إلغاء اشتراك النقل</h3>
                    <p className="text-xs text-slate-300">
                      التلميذ(ة): {unenrollStudent.firstName} {unenrollStudent.lastName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setUnenrollStudent(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm font-bold text-slate-700 leading-relaxed">
                  هل تريد إلغاء اشتراك النقل لهذا التلميذ؟
                </p>
                <p className="text-xs font-bold text-slate-400 leading-relaxed bg-slate-50 border border-slate-200 rounded-2xl p-3">
                  سيبقى سجل الدفعات محفوظاً في المنظومة المالية، لكن التلميذ لن يظهر بعد الآن في خطة الحافلة ولا في شبكة الاشتراكات.
                </p>
                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    onClick={() => setUnenrollStudent(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleUnenrollStudent}
                    data-testid="transport-unenroll-confirm"
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="h-4 w-4" />
                    تأكيد الإلغاء
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FRACTIONAL PAYMENT ENTRY MODAL */}
      <AnimatePresence>
        {selectedStudentForPayment && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-8"
            >
              <div className="p-6 bg-brand-600 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-white/80" />
                  <div>
                    <h3 className="text-lg font-black">
                      تنزيل دفعة شهر {paymentMonth} ({studentYear(selectedStudentForPayment)})
                    </h3>
                    <p className="text-xs text-slate-300">
                      التلميذ(ة): {selectedStudentForPayment.firstName} {selectedStudentForPayment.lastName}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedStudentForPayment(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
                {isAdvanceStatus && activeMonthStatus && (
                  <div className="p-3.5 bg-brand-600/[0.06] rounded-2xl border border-brand-600/20 text-xs space-y-1.5 font-bold text-brand-700">
                    <div className="flex justify-between items-center">
                      <span>سبق خلاص تسبقة لشهر {paymentMonth}:</span>
                      <span className="font-mono text-brand-700 font-extrabold text-sm">{activeMonthStatus.paidAmount} د.ت</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-brand-600/25 pt-1.5">
                      <span>المتبقي لاستكمال الشهر (Solde):</span>
                      <span className="font-mono text-red-700 font-black text-sm">{activeMonthStatus.remaining} د.ت</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">نوع الدفعة *</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType('full');
                        const targetVal = isAdvanceStatus ? activeMonthStatus.remaining : Math.max(0, standardFee - (Number(discount) || 0));
                        setAmountPaid(targetVal);
                        setTotalRequired(standardFee);
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        paymentType === 'full'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {isAdvanceStatus
                        ? `خلاص الباقي (${activeMonthStatus?.remaining} د.ت)`
                        : `خلاص كامل (${standardFee} د.ت)`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType('advance');
                        const defaultAdv = isAdvanceStatus
                          ? Math.min(50, activeMonthStatus.remaining)
                          : Math.round(Math.max(0, standardFee - (Number(discount) || 0)) / 2);
                        setAmountPaid(defaultAdv);
                        setTotalRequired(standardFee);
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        paymentType === 'advance'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      تسبقة (Avance)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentType('balance');
                        if (isAdvanceStatus) {
                          setAmountPaid(activeMonthStatus.remaining);
                        }
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        paymentType === 'balance'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      تكملة باقي (Solde)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">طريقة الدفع *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setPaymentMethod('Espèces'); setChequeNumber(''); setChequeDate(new Date().toISOString().split('T')[0]); }}
                      className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        paymentMethod === 'Espèces'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      نقداً (Espèces)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('Chèque')}
                      className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        paymentMethod === 'Chèque'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      شيك (Par Chèque)
                    </button>
                  </div>
                </div>

                {paymentMethod === 'Chèque' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-brand-600/[0.06] rounded-xl border border-brand-600/20">
                    <div className="flex flex-col justify-end">
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">رقم الشيك *</label>
                      <input
                        type="text" required
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value)}
                        placeholder="رقم الشيك"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 h-[38px]"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">تاريخ الدفع *</label>
                      <DateField
                        required
                        value={chequeDate}
                        onChange={(e) => setChequeDate(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 h-[38px]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    التخفيض (د.ت) <span className="text-[10px] text-brand-700/80 font-semibold">(يجب أن يكون أقل من المبلغ)</span>
                  </label>
                  <input
                    type="number" min="0" max={Math.max(0, standardFee - 1)}
                    value={discount}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(standardFee - 1, Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0));
                      setDiscount(val);
                      if (paymentType === 'full') {
                        setAmountPaid(Math.max(0, standardFee - val));
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-brand-700"
                  />
                  <p className="text-[10px] text-slate-400 font-bold mt-1">
                    المستوجب بعد التخفيض: {Math.max(0, standardFee - (Number(discount) || 0))} د.ت
                    {Number(discount) >= standardFee && standardFee > 0 && (
                      <span className="text-red-500 font-black block mt-0.5">⚠️ التخفيض لا يمكن أن يساوي أو يتجاوز {standardFee} د.ت!</span>
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">
                      المبلغ المدفوع (د.ت) *
                    </label>
                    <input
                      type="number" required min="0"
                      value={amountPaid}
                      max={isAdvanceStatus ? activeMonthStatus?.remaining : undefined}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = Math.max(0, Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0);
                        if (isAdvanceStatus && activeMonthStatus && val > activeMonthStatus.remaining) {
                          toast.warning(`عذراً، المبلغ المطلوب لاستكمال الشهر هو ${activeMonthStatus.remaining} د.ت فقط!`);
                          setAmountPaid(activeMonthStatus.remaining);
                        } else {
                          setAmountPaid(val);
                        }
                      }}
                      data-testid="transport-pay-amount"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-brand-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">
                      إجمالي الشهر (د.ت)
                    </label>
                    <input
                      type="number" required value={totalRequired} readOnly
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Remaining calculation banner */}
                <div className="p-3 bg-brand-600/[0.06] rounded-2xl border border-brand-600/20 text-xs flex justify-between font-bold text-brand-700">
                  <span>المبلغ المتبقي بعد هذه الدفعة:</span>
                  <span className="font-mono text-sm font-black text-red-700">
                    {Math.max(0, Math.max(0, Number(totalRequired) - (Number(discount) || 0)) - (activeMonthStatus?.paidAmount || 0) - Number(amountPaid || 0))} د.ت
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">ملاحظات</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setSelectedStudentForPayment(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || standardFee <= 0}
                    title={isSubmitting ? undefined : 'أدخل رسوم النقل في الإعدادات أولاً'}
                    data-testid="transport-pay-submit"
                    className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    تأكيد الدفع وطباعة الوصل
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRINT RECEIPT MODAL */}
      <AnimatePresence>
        {printingReceipt && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-8"
            >
              <div className="p-4 bg-brand-600 text-white flex justify-between items-center no-print">
                <span className="font-bold text-sm">وصل خلاص رسمي</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-brand-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    طباعة الوصل 🖨️
                  </button>
                  <button
                    onClick={() => setPrintingReceipt(null)}
                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto">
                {(() => {
                  const { student, payment } = printingReceipt;
                  const monthPayments = (student.payments || []).filter(p => p.service === 'Transport' && p.month === payment.month);
                  const totalPaid = monthPayments.reduce((sum, p) => sum + p.amountPaid, 0);
                  const fullFeeRequired = payment.totalRequired || 0;
                  const remaining = Math.max(0, fullFeeRequired - totalPaid);
                  const totalDiscount = monthPayments.reduce((max, p) => Math.max(max, p.discount || 0), 0);
                  return (
                    <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col">
                      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                        <div>
                          <h2 className="text-lg font-black text-slate-950">{centerName} — وصل خلاص كشف المدفوعات</h2>
                          <p className="text-[10px] text-slate-500 font-mono">رقم آخر وصل: {payment.receiptNumber}</p>
                          <p className="text-[10px] text-slate-400">تاريخ آخر دفعة: {payment.date}</p>
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
                            <table className="min-w-[640px] w-full text-right text-[11px]">
                              <thead className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                                <tr>
                                  <th className="p-2">#</th>
                                  <th className="p-2">التاريخ</th>
                                  <th className="p-2">رقم الوصل</th>
                                  <th className="p-2">طريقة الدفع / ملاحظات</th>
                                  <th className="p-2 text-left">المبلغ المقبوض</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 bg-white">
                                {monthPayments.map((p, idx) => (
                                  <tr key={p.id || idx}>
                                    <td className="p-2 font-bold text-slate-400">{idx + 1}</td>
                                    <td className="p-2 font-mono text-slate-700">{p.date}</td>
                                    <td className="p-2 font-mono text-slate-500 text-[10px]">{p.receiptNumber}</td>
                                    <td className="p-2 text-slate-800 font-medium">
                                      <span className="font-bold">{paymentMethodLabel(p.method)}</span>
                                      {p.notes && <span className="text-slate-500 text-[10px] block">{p.notes}</span>}
                                      {p.discount ? <span className="text-brand-700 text-[10px] block font-bold">التخفيض: {p.discount} د.ت</span> : null}
                                    </td>
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
                            <span className="text-base font-black text-slate-900 font-mono">{fullFeeRequired} د.ت</span>
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
