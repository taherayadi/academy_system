import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Plus,
  Search,
  MapPin,
  UserPlus,
  Printer,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  CreditCard,
  Bus,
  Gift,
  Sparkles,
  FileText,
  X
} from 'lucide-react';
import {
  SchoolEvent,
  EventParticipant,
  EventCategory,
  EventStatus,
  EventParticipantType,
  eventPriceFor,
  generateEventReceiptNumber
} from '../types';
import { Student, CenterSettings, getCurrentAcademicYear, DEFAULT_ACADEMIC_YEARS } from '../types';
import DateField from './DateField';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

interface EventsModuleProps {
  events: SchoolEvent[];
  onUpdateEvents: (events: SchoolEvent[]) => void;
  students?: Student[];
  settings?: CenterSettings | null;
  sidebarCollapsed?: boolean;
}

const CATEGORY_CONFIG: Record<EventCategory, { label: string; icon: React.ElementType }> = {
  trip: { label: 'الرحلات والخرجات', icon: Bus },
  party: { label: 'الحفلات والمناسبات', icon: Gift },
  workshop: { label: 'الورشات والأنشطة', icon: Sparkles },
  other: { label: 'أخرى', icon: Calendar },
};

const CATEGORY_ORDER: EventCategory[] = ['trip', 'party', 'workshop', 'other'];

const STATUS_CONFIG: Record<EventStatus, { label: string; badge: string }> = {
  planned: { label: 'مخطط لها', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
  confirmed: { label: 'مؤكدة', badge: 'bg-[#257C86]/[0.06] text-[#1e626b] border-[#257C86]/20' },
  completed: { label: 'مكتملة', badge: 'bg-slate-50 text-slate-500 border-slate-200' },
  cancelled: { label: 'ملغاة', badge: 'bg-red-50 text-red-700 border-red-200' },
};

const STATUS_ORDER: EventStatus[] = ['planned', 'confirmed', 'completed', 'cancelled'];

const PARTICIPANT_TYPES: { type: EventParticipantType; label: string; priceField: keyof SchoolEvent }[] = [
  { type: 'student', label: 'تلميذ', priceField: 'priceStudent' },
  { type: 'parent', label: 'ولي أمر', priceField: 'priceParent' },
  { type: 'sibling', label: 'أخ/أخت', priceField: 'priceSibling' },
  { type: 'external', label: 'خارجي', priceField: 'priceExternal' },
];

/** Chèque pas encore encaissé par le module Finance : exclu du « المحصل ». */
const isChequePending = (p: EventParticipant) => p.paymentMethod === 'Chèque' && p.chequePaid !== true;

export default function EventsModule({
  events,
  onUpdateEvents,
  students = [],
  settings
}: EventsModuleProps) {
  const { success, error, info } = useToast();
  const centerName = settings?.centerName || 'المركز';
  // --- State ---
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<EventCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<EventStatus | 'all'>('all');

  const [participantSearch, setParticipantSearch] = useState('');
  const [participantStatusFilter, setParticipantStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  // Modals
  const [eventModal, setEventModal] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [participantModal, setParticipantModal] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; participantId: string | null }>({ open: false, participantId: null });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false, title: '', message: '', onConfirm: () => {}
  });

  // Print states
  const [printReceipt, setPrintReceipt] = useState<{ open: boolean; participantId: string | null }>({ open: false, participantId: null });
  const [printAttendance, setPrintAttendance] = useState<{ open: boolean; eventId: string | null }>({ open: false, eventId: null });

  // Form States
  const [eventForm, setEventForm] = useState<Partial<SchoolEvent>>({});
  const [participantForm, setParticipantForm] = useState<Partial<EventParticipant>>({});
  const [paymentForm, setPaymentForm] = useState({ amount: 0, method: 'Espèces' as 'Espèces' | 'Chèque', chequeNumber: '', chequeDate: '' });

  // --- Helpers ---
  const todayIso = new Date().toISOString().split('T')[0];

  const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

  const getStudentFullName = (s: Student) => `${s.firstName} ${s.lastName}`;

  const getStudentPhone = (s: Student) => s.father?.phoneMobile || s.father?.phoneFixed || s.mother?.phoneMobile || s.mother?.phoneFixed || '';

  // --- Derived ---
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || e.location.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesYear = !filterYear || !e.schoolYear || e.schoolYear === filterYear;
      const matchesCat = filterCategory === 'all' || e.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || e.status === filterStatus;
      return matchesSearch && matchesYear && matchesCat && matchesStatus;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [events, searchQuery, filterYear, filterCategory, filterStatus]);

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedId), [events, selectedId]);

  useEffect(() => {
    if (selectedId && !events.find(e => e.id === selectedId)) {
      setSelectedId(null);
    }
  }, [events, selectedId]);

  const filteredParticipants = useMemo(() => {
    if (!selectedEvent) return [];
    return selectedEvent.participants.filter(p => {
      const matchesSearch = p.participantName.toLowerCase().includes(participantSearch.toLowerCase());
      const matchesStatus = participantStatusFilter === 'all' || (participantStatusFilter === 'paid' ? p.paid : !p.paid);
      return matchesSearch && matchesStatus;
    });
  }, [selectedEvent, participantSearch, participantStatusFilter]);

  const stats = useMemo(() => {
    if (!selectedEvent) return null;
    const participants = selectedEvent.participants;
    const total = participants.length;
    const capacity = selectedEvent.maxCapacity || Infinity;
    const collected = participants.filter(p => !isChequePending(p)).reduce((sum, p) => sum + p.amountPaid, 0);
    const expected = participants.reduce((sum, p) => sum + p.totalRequired, 0);
    const unpaid = expected - collected;
    const attendedCount = participants.filter(p => p.attended).length;
    const attendanceRate = total > 0 ? (attendedCount / total) * 100 : 0;

    return { total, capacity, overCapacity: total > capacity, collected, expected, unpaid, attendanceRate };
  }, [selectedEvent]);

  // --- Mutations ---
  const patchEvent = (id: string, updater: (e: SchoolEvent) => SchoolEvent) => {
    const idx = events.findIndex(e => e.id === id);
    if (idx === -1) return;
    const newEvents = [...events];
    newEvents[idx] = updater(newEvents[idx]);
    onUpdateEvents(newEvents);
  };

  const handleSubmitEvent = async () => {
    if (!eventForm.name || !eventForm.date || !eventForm.location) {
      error('يرجى ملء الحقول المطلوبة');
      return;
    }
    if (eventModal.id) {
      patchEvent(eventModal.id, e => ({ ...e, ...eventForm }));
    } else {
      const newEvent: SchoolEvent = {
        id: 'evt_' + crypto.randomUUID(),
        name: eventForm.name || '',
        description: eventForm.description,
        category: (eventForm.category as EventCategory) || 'other',
        date: eventForm.date || todayIso,
        time: eventForm.time,
        location: eventForm.location || '',
        priceStudent: eventForm.priceStudent || 0,
        priceParent: eventForm.priceParent || 0,
        priceSibling: eventForm.priceSibling || 0,
        priceExternal: eventForm.priceExternal || 0,
        maxCapacity: eventForm.maxCapacity,
        busIncluded: !!eventForm.busIncluded,
        status: (eventForm.status as EventStatus) || 'planned',
        schoolYear: eventForm.schoolYear || getCurrentAcademicYear(),
        participants: [],
        createdAt: new Date().toISOString(),
      };
      onUpdateEvents([...events, newEvent]);
      setSelectedId(newEvent.id);
    }
    setEventModal({ open: false, id: null });
    success('تم حفظ الفعالية بنجاح');
  };

  const handleDeleteEvent = (id: string) => {
    onUpdateEvents(events.filter(e => e.id !== id));
    setSelectedId(null);
    success('تم حذف الفعالية');
  };

  const patchParticipant = (eventId: string, partId: string, updater: (p: EventParticipant) => EventParticipant) => {
    patchEvent(eventId, e => ({
      ...e,
      participants: e.participants.map(p => p.id === partId ? updater(p) : p)
    }));
  };

  const handleSubmitParticipant = async () => {
    if (!participantForm.participantName) {
      error('يرجى إدخال اسم المشارك');
      return;
    }
    if (!selectedEvent) return;

    const phone = (participantForm.contactPhone || '').replace(/\D/g, '');
    if (phone && phone.length !== 8) {
      error('رقم الهاتف يجب أن يتكون من 8 أرقام بالضبط');
      return;
    }

    const type = (participantForm.participantType as EventParticipantType) || 'student';
    const method = participantForm.paymentMethod || 'Espèces';
    const isCheque = method === 'Chèque';
    if (isCheque && !(participantForm.chequeNumber || '').trim()) {
      error('يرجى إدخال رقم الشيك');
      return;
    }

    // المبلغ المطلوب يُحتسب تلقائياً من نوع المشارك ناقص التخفيض.
    const price = eventPriceFor(selectedEvent, type);
    const disc = Math.max(0, participantForm.discount || 0);
    if (price > 0 && disc >= price) {
      error(`قيمة التخفيض (${disc} د.ت) يجب أن تكون أقل تماماً من مبلغ المشاركة (${price} د.ت)!`);
      return;
    }
    const effectiveRequired = Math.max(0, price - disc);
    const amountPaid = Math.max(0, participantForm.amountPaid || 0);
    const remaining = round2(Math.max(0, effectiveRequired - amountPaid));

    if (participantModal.id) {
      patchParticipant(selectedEvent.id, participantModal.id, p => ({
        ...p,
        participantName: participantForm.participantName ?? p.participantName,
        participantType: type,
        linkedStudentId: participantForm.linkedStudentId,
        contactPhone: phone,
        notes: participantForm.notes,
        paymentMethod: method,
        chequeNumber: isCheque ? participantForm.chequeNumber : undefined,
        chequeDate: isCheque ? participantForm.chequeDate : undefined,
        discount: disc > 0 ? disc : undefined,
        amountPaid,
        totalRequired: effectiveRequired,
        remainingBalance: remaining,
        // الشيك يبقى غير مخلّص حتى تحصيله من وحدة المالية.
        paid: isCheque ? (p.chequePaid === true && remaining <= 0) : remaining <= 0,
        paidAt: remaining <= 0 && (!isCheque || p.chequePaid === true) ? (p.paidAt || new Date().toISOString()) : undefined,
      }));
    } else {
      const newPart: EventParticipant = {
        id: 'prt_' + crypto.randomUUID(),
        participantName: participantForm.participantName || '',
        participantType: type,
        linkedStudentId: participantForm.linkedStudentId,
        contactPhone: phone,
        amountPaid,
        totalRequired: effectiveRequired,
        remainingBalance: remaining,
        paymentMethod: method,
        chequeNumber: isCheque ? participantForm.chequeNumber : undefined,
        chequeDate: isCheque ? participantForm.chequeDate : undefined,
        discount: disc > 0 ? disc : undefined,
        // الشيك يبقى غير مخلّص حتى تحصيله من وحدة المالية.
        paid: isCheque ? false : remaining <= 0,
        paidAt: !isCheque && remaining <= 0 ? new Date().toISOString() : undefined,
        attended: false,
        notes: participantForm.notes,
        receiptNumber: amountPaid > 0 ? generateEventReceiptNumber(events) : undefined,
      };
      patchEvent(selectedEvent.id, e => ({ ...e, participants: [...e.participants, newPart] }));
    }
    setParticipantModal({ open: false, id: null });
    success('تم حفظ المشارك بنجاح');
  };

  const handleDeleteParticipant = (eventId: string, partId: string) => {
    patchEvent(eventId, e => ({
      ...e,
      participants: e.participants.filter(p => p.id !== partId)
    }));
    success('تم حذف المشارك');
  };

  const handleSubmitPayment = async () => {
    if (!selectedEvent || !paymentModal.participantId) return;

    const part = selectedEvent.participants.find(p => p.id === paymentModal.participantId);
    if (!part) return;

    if (paymentForm.amount <= 0) {
      error('يرجى إدخال مبلغ الدفعة');
      return;
    }

    const remainingBefore = round2(Math.max(0, part.totalRequired - part.amountPaid));
    if (paymentForm.amount > remainingBefore) {
      error(`عذراً، مبلغ الدفعة (${paymentForm.amount} د.ت) يتجاوز المتبقي المستحق (${remainingBefore} د.ت)!`);
      return;
    }

    const isCheque = paymentForm.method === 'Chèque';
    if (isCheque && !paymentForm.chequeNumber.trim()) {
      error('يرجى إدخال رقم الشيك');
      return;
    }

    const newPaidAmount = round2(part.amountPaid + paymentForm.amount);
    const total = part.totalRequired;
    const remaining = round2(Math.max(0, total - newPaidAmount));
    const receiptNumber = part.receiptNumber || generateEventReceiptNumber(events);

    patchParticipant(selectedEvent.id, part.id, p => ({
      ...p,
      amountPaid: newPaidAmount,
      remainingBalance: remaining,
      paymentMethod: paymentForm.method,
      chequeNumber: isCheque ? paymentForm.chequeNumber : undefined,
      chequeDate: isCheque ? paymentForm.chequeDate : undefined,
      // الشيك يبقى معلقاً (غير مخلّص) حتى تحصيله من وحدة المالية.
      paid: isCheque ? false : remaining <= 0,
      paidAt: !isCheque && remaining <= 0 ? new Date().toISOString() : p.paidAt,
      receiptNumber: receiptNumber
    }));

    setPaymentModal({ open: false, participantId: null });
    success('تم تسجيل الدفعة بنجاح');
  };

  const toggleAttendance = (eventId: string, partId: string) => {
    patchParticipant(eventId, partId, p => ({ ...p, attended: !p.attended }));
  };

  // --- Renderers ---
  return (
    <div className="space-y-6" dir="rtl">

      {/* Module Banner */}
      <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-[#257C86]/[0.06] text-[#1e626b] text-xs font-bold rounded-lg border border-[#257C86]/20">
              الفعاليات والخرجات
            </span>
            <span className="text-xs text-slate-400 font-bold">الرحلات والحفلات والورشات</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-[#257C86]" />
            إدارة الفعاليات والخرجات
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            تنظيم الفعاليات، تسجيل المشاركين ومتابعة الحضور والمحاصيل المالية.
          </p>
        </div>

        <button
          onClick={() => {
            setEventForm({ schoolYear: getCurrentAcademicYear() });
            setEventModal({ open: true, id: null });
          }}
          className="px-4 py-2.5 bg-[#257C86] hover:bg-[#1e626b] text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" />
          فعالية جديدة
        </button>
      </div>

      {/* Main Grid: Left List (Events) & Right Panel (Detail & Participants) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* Left Events List */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200/70 p-4 shadow-lg shadow-slate-900/5 space-y-3 no-print">
          <span className="text-xs font-black text-slate-900 flex items-center gap-1.5 px-1">
            <Calendar className="h-4 w-4 text-[#257C86]" />
            قائمة الفعاليات ({filteredEvents.length})
          </span>

          {/* Filter bar: school year + category */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              title="السنة الدراسية"
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
            >
              <option value="">السنة: الكل</option>
              {[...DEFAULT_ACADEMIC_YEARS].sort().reverse().map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value as any)}
              title="الفئة"
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
            >
              <option value="all">الفئة: الكل</option>
              {CATEGORY_ORDER.map(cat => (
                <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
              ))}
            </select>
          </div>

          {/* Search event */}
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث عن فعالية..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
            />
          </div>

          {/* Status segmented filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(['all', ...STATUS_ORDER] as const).map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(filterStatus === st ? 'all' : (st as any))}
                className={`px-2 py-1 text-[11px] font-extrabold rounded-lg transition cursor-pointer flex-1 ${
                  filterStatus === st
                    ? 'bg-white text-slate-900 shadow-lg shadow-slate-900/5'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {st === 'all' ? 'الكل' : STATUS_CONFIG[st as EventStatus].label}
              </button>
            ))}
          </div>

          {/* Events Cards */}
          <div className="space-y-2.5 max-h-[calc(100vh-420px)] overflow-y-auto pr-0.5 no-scrollbar">
            {filteredEvents.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-xs font-bold text-slate-400">لا توجد فعاليات مطابقة</p>
                <button
                  onClick={() => {
                    setEventForm({ schoolYear: getCurrentAcademicYear() });
                    setEventModal({ open: true, id: null });
                  }}
                  className="mt-3 px-3 py-1.5 bg-[#257C86]/10 text-[#257C86] rounded-xl text-xs font-extrabold hover:bg-[#257C86]/20 transition cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  إنشاء أول فعالية
                </button>
              </div>
            ) : (
              filteredEvents.map(e => {
                const isSelected = selectedId === e.id;
                const Icon = CATEGORY_CONFIG[e.category].icon;
                const collected = e.participants.filter(p => !isChequePending(p)).reduce((sum, p) => sum + p.amountPaid, 0);
                const registrationRate = e.maxCapacity ? (e.participants.length / e.maxCapacity) * 100 : 0;

                return (
                  <div
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-right relative ${
                      isSelected
                        ? 'bg-[#257C86]/[0.06] border-[#257C86] shadow-sm ring-1 ring-[#257C86]/30'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h3 className="text-xs font-black text-slate-900 leading-snug line-clamp-1 flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-[#257C86] shrink-0" />
                        {e.name}
                      </h3>
                      <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${STATUS_CONFIG[e.status].badge}`}>
                        {STATUS_CONFIG[e.status].label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold mb-1.5">
                      <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                      <span>{e.date}{e.time ? ` — ${e.time}` : ''}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-bold mb-1.5">
                      <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="truncate">{e.location}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2 font-bold text-slate-600">
                        <span>{CATEGORY_CONFIG[e.category].label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#257C86] font-extrabold">{e.participants.length}{e.maxCapacity ? ` / ${e.maxCapacity}` : ''} مشارك</span>
                        <span className="font-mono font-black text-[#257C86] bg-white px-2 py-0.5 rounded-md border border-[#257C86]/20">
                          {round2(collected)} د.ت
                        </span>
                      </div>
                    </div>

                    {e.maxCapacity && (
                      <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${registrationRate > 90 ? 'bg-amber-500' : 'bg-[#257C86]'}`}
                          style={{ width: `${Math.min(100, registrationRate)}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Panel */}
        <div className="lg:col-span-8 space-y-5">
          {!selectedEvent ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 p-4 bg-[#257C86]/[0.06] text-[#257C86] rounded-2xl border border-[#257C86]/20 flex items-center justify-center">
                <Calendar className="h-7 w-7" />
              </div>
              <h3 className="text-sm font-black text-slate-900">لم يتم اختيار فعالية</h3>
              <p className="text-xs font-bold text-slate-400 mt-1">
                اختر فعالية من القائمة لإدارة المشاركين والمدفوعات والحضور
              </p>
            </div>
          ) : (
            <>
              {/* Event Overview Card */}
              <div className="bg-white rounded-3xl border border-slate-200/70 p-5 shadow-lg shadow-slate-900/5 space-y-4 no-print">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-[#257C86]/[0.06] text-[#257C86] rounded-xl border border-[#257C86]/20 shrink-0">
                      {(() => {
                        const CategoryIcon = CATEGORY_CONFIG[selectedEvent.category].icon;
                        return <CategoryIcon className="h-5 w-5" />;
                      })()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-black text-slate-900">{selectedEvent.name}</h2>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${STATUS_CONFIG[selectedEvent.status].badge}`}>
                          {STATUS_CONFIG[selectedEvent.status].label}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {selectedEvent.date}
                        </span>
                        {selectedEvent.time && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {selectedEvent.time}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {selectedEvent.location}
                        </span>
                        {selectedEvent.busIncluded && (
                          <span className="flex items-center gap-1 text-[#257C86] font-black">
                            <Bus className="h-3.5 w-3.5" />
                            حافلة متوفرة
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setEventForm(selectedEvent);
                        setEventModal({ open: true, id: selectedEvent.id });
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      تعديل
                    </button>
                    <button
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          title: 'حذف الفعالية',
                          message: `هل أنت متأكد من حذف ${selectedEvent.name}؟ سيتم حذف جميع سجلات المشاركين المرتبطة.`,
                          onConfirm: () => handleDeleteEvent(selectedEvent.id)
                        });
                      }}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </button>
                  </div>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/60">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">المشاركون</span>
                    <span className="font-mono text-base font-black text-slate-900">
                      {stats?.total}{stats && stats.capacity !== Infinity ? ` / ${stats.capacity}` : ''}
                    </span>
                    {stats?.overCapacity && (
                      <span className="text-[10px] text-amber-700 font-black flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3" />
                        تجاوز السعة المحددة
                      </span>
                    )}
                  </div>
                  <div className="bg-[#257C86]/[0.06] rounded-2xl p-3 border border-[#257C86]/20">
                    <span className="text-[11px] font-bold text-[#1e626b] block mb-1">المحصل (د.ت)</span>
                    <span className="font-mono text-base font-black text-[#257C86]">{round2(stats?.collected || 0)}</span>
                    <span className="text-[10px] font-bold text-slate-400 block mt-0.5">من {round2(stats?.expected || 0)} د.ت</span>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200/70">
                    <span className="text-[11px] font-bold text-amber-700 block mb-1">المتبقي (د.ت)</span>
                    <span className="font-mono text-base font-black text-amber-800">{round2(stats?.unpaid || 0)}</span>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/60">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">نسبة الحضور</span>
                    <span className="font-mono text-base font-black text-slate-900">{round2(stats?.attendanceRate || 0)}%</span>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="h-full bg-[#257C86] transition-all"
                        style={{ width: `${stats?.attendanceRate || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Participants Section */}
              <div className="bg-white rounded-3xl border border-slate-200/70 p-5 shadow-lg shadow-slate-900/5 space-y-4 no-print">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-[#257C86]" />
                      المشاركون ({filteredParticipants.length})
                    </h3>
                    <p className="text-xs font-bold text-slate-400 mt-0.5">
                      قائمة المشاركين، الحضور والمدفوعات وتفاصيل الاستخلاص
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setParticipantForm({});
                      setParticipantModal({ open: true, id: null });
                    }}
                    className="px-4 py-2 bg-[#257C86] hover:bg-[#1e626b] text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <UserPlus className="h-4 w-4" />
                    إضافة مشارك
                  </button>
                </div>

                {/* Filter & Search Participants */}
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={participantSearch}
                      onChange={e => setParticipantSearch(e.target.value)}
                      placeholder="بحث عن مشارك..."
                      className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                    {(['all', 'paid', 'unpaid'] as const).map(st => {
                      const labels = { all: 'الكل', paid: 'مدفوع', unpaid: 'غير مدفوع' };
                      return (
                        <button
                          key={st}
                          onClick={() => setParticipantStatusFilter(st)}
                          className={`px-3 py-1 text-[11px] font-extrabold rounded-lg transition cursor-pointer flex-1 sm:flex-initial ${
                            participantStatusFilter === st
                              ? 'bg-white text-slate-900 shadow-lg shadow-slate-900/5'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {labels[st]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Participants Table */}
                <div className="overflow-auto max-h-[60vh] rounded-2xl border border-slate-100 no-scrollbar">
                  <table className="min-w-[760px] w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 text-slate-500 font-black border-b border-slate-100">
                        <th className="p-3 text-center">حضور</th>
                        <th className="p-3">المشارك</th>
                        <th className="p-3 text-center">النوع</th>
                        <th className="p-3 text-center">المبلغ المطلوب</th>
                        <th className="p-3 text-center">المدفوع</th>
                        <th className="p-3 text-center">المتبقي</th>
                        <th className="p-3 text-center">الحالة</th>
                        <th className="p-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {filteredParticipants.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                            لا يوجد مشاركين مطابقين
                          </td>
                        </tr>
                      ) : (
                        filteredParticipants.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/60 transition">
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={p.attended}
                                onChange={() => toggleAttendance(selectedEvent.id, p.id)}
                                className="h-4 w-4 accent-[#257C86] cursor-pointer"
                                title="تسجيل الحضور"
                              />
                            </td>
                            <td className="p-3">
                              <span className="font-bold text-slate-900 block">{p.participantName}</span>
                              {p.contactPhone && (
                                <span className="text-[10px] text-slate-400 font-bold font-mono flex items-center gap-1 mt-0.5">
                                  {p.contactPhone}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-extrabold inline-block">
                                {PARTICIPANT_TYPES.find(t => t.type === p.participantType)?.label}
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-700">
                              {round2(p.totalRequired)} د.ت
                            </td>
                            <td className="p-3 text-center font-mono font-black text-[#1e626b]">
                              {round2(p.amountPaid)} د.ت
                            </td>
                            <td className="p-3 text-center font-mono font-black">
                              {p.remainingBalance > 0 ? (
                                <span className="text-red-600">{round2(p.remainingBalance)} د.ت</span>
                              ) : (
                                <span className="text-slate-300">0 د.ت</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {p.paid ? (
                                <span className="px-2.5 py-0.5 bg-[#257C86]/[0.06] text-[#1e626b] border border-[#257C86]/20 rounded-full text-[10px] font-black inline-flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  مدفوع
                                </span>
                              ) : p.paymentMethod === 'Chèque' ? (
                                <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-black inline-flex items-center gap-1" title="بانتظار التحصيل من وحدة المالية">
                                  <Clock className="h-3 w-3" />
                                  شيك معلق
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-black inline-flex items-center gap-1">
                                  <XCircle className="h-3 w-3" />
                                  غير مدفوع
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setPaymentModal({ open: true, participantId: p.id })}
                                  disabled={p.remainingBalance <= 0}
                                  title={p.remainingBalance <= 0 ? 'تم الخلاص بالكامل — لا توجد دفعات مطلوبة' : 'تسجيل دفعة'}
                                  className={`p-1 rounded-lg transition ${
                                    p.remainingBalance <= 0
                                      ? 'text-slate-300 cursor-not-allowed'
                                      : 'text-slate-400 hover:text-[#257C86] hover:bg-[#257C86]/[0.06] cursor-pointer'
                                  }`}
                                >
                                  <CreditCard className="h-3.5 w-3.5" />
                                </button>
                                {p.receiptNumber && (
                                  <button
                                    onClick={() => setPrintReceipt({ open: true, participantId: p.id })}
                                    title="طباعة وصل"
                                    className="p-1 text-slate-400 hover:text-[#257C86] hover:bg-[#257C86]/[0.06] rounded-lg transition cursor-pointer"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setParticipantForm(p);
                                    setParticipantModal({ open: true, id: p.id });
                                  }}
                                  title="تعديل"
                                  className="p-1 text-slate-400 hover:text-[#257C86] hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setConfirmDialog({
                                      open: true,
                                      title: 'حذف مشارك',
                                      message: `هل أنت متأكد من حذف ${p.participantName}؟`,
                                      onConfirm: () => handleDeleteParticipant(selectedEvent.id, p.id)
                                    });
                                  }}
                                  title="حذف"
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setPrintAttendance({ open: true, eventId: selectedEvent.id })}
                    className="px-3 py-1.5 bg-[#257C86]/10 hover:bg-[#257C86]/20 text-[#257C86] font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    طباعة كشف الحضور (A4)
                  </button>
                  <span className="text-xs font-bold text-slate-400">
                    إجمالي المشاركين: {filteredParticipants.length}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {eventModal.open && (
          <Modal
            title={eventModal.id ? 'تعديل الفعالية' : 'فعالية جديدة'}
            onClose={() => setEventModal({ open: false, id: null })}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="event-name">اسم الفعالية *</label>
                  <input
                    id="event-name"
                    type="text"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    value={eventForm.name || ''}
                    onChange={e => setEventForm({ ...eventForm, name: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="event-description">الوصف</label>
                  <textarea
                    id="event-description"
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    value={eventForm.description || ''}
                    onChange={e => setEventForm({ ...eventForm, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="event-category">الفئة</label>
                  <select
                    id="event-category"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    value={eventForm.category || 'other'}
                    onChange={e => setEventForm({ ...eventForm, category: e.target.value as any })}
                  >
                    {CATEGORY_ORDER.map(cat => (
                      <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="event-status">الحالة</label>
                  <select
                    id="event-status"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    value={eventForm.status || 'planned'}
                    onChange={e => setEventForm({ ...eventForm, status: e.target.value as any })}
                  >
                    {STATUS_ORDER.map(status => (
                      <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="event-date">التاريخ *</label>
                  <DateField
                    id="event-date"
                    value={eventForm.date || ''}
                    onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 h-[38px]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="event-time">الوقت</label>
                  <input
                    id="event-time"
                    type="time"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    value={eventForm.time || ''}
                    onChange={e => setEventForm({ ...eventForm, time: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="event-location">الموقع *</label>
                  <input
                    id="event-location"
                    type="text"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    value={eventForm.location || ''}
                    onChange={e => setEventForm({ ...eventForm, location: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="event-capacity">السعة القصوى</label>
                  <input
                    id="event-capacity"
                    type="number"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    value={eventForm.maxCapacity || ''}
                    onChange={e => setEventForm({ ...eventForm, maxCapacity: parseInt(e.target.value) || undefined })}
                  />
                </div>
                <div className="flex items-center gap-2 self-end pb-0.5">
                  <input
                    type="checkbox"
                    id="bus-included"
                    className="h-4 w-4 accent-[#257C86] cursor-pointer"
                    checked={!!eventForm.busIncluded}
                    onChange={e => setEventForm({ ...eventForm, busIncluded: e.target.checked })}
                  />
                  <label htmlFor="bus-included" className="text-xs font-bold text-slate-600 cursor-pointer">تشمل الحافلة</label>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="event-year">السنة الدراسية</label>
                  <select
                    id="event-year"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    value={eventForm.schoolYear || getCurrentAcademicYear()}
                    onChange={e => setEventForm({ ...eventForm, schoolYear: e.target.value })}
                  >
                    {[...DEFAULT_ACADEMIC_YEARS].sort().reverse().map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-[#257C86]/[0.06] rounded-2xl border border-[#257C86]/20 space-y-3">
                <div className="text-xs font-black text-[#1e626b]">تسعيرة المشاركين (د.ت)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1" htmlFor="price-student">تلميذ</label>
                    <input
                      id="price-student"
                      type="number"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      value={eventForm.priceStudent || 0}
                      onChange={e => setEventForm({ ...eventForm, priceStudent: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1" htmlFor="price-parent">ولي أمر</label>
                    <input
                      id="price-parent"
                      type="number"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      value={eventForm.priceParent || 0}
                      onChange={e => setEventForm({ ...eventForm, priceParent: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1" htmlFor="price-sibling">أخ / أخت</label>
                    <input
                      id="price-sibling"
                      type="number"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      value={eventForm.priceSibling || 0}
                      onChange={e => setEventForm({ ...eventForm, priceSibling: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1" htmlFor="price-external">خارجي</label>
                    <input
                      id="price-external"
                      type="number"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      value={eventForm.priceExternal || 0}
                      onChange={e => setEventForm({ ...eventForm, priceExternal: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setEventModal({ open: false, id: null })}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleSubmitEvent}
                className="px-5 py-2 bg-[#257C86] hover:bg-[#1e626b] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                حفظ الفعالية
              </button>
            </div>
          </Modal>
        )}

        {participantModal.open && (
          <Modal
            title={participantModal.id ? 'تعديل مشارك' : 'إضافة مشارك'}
            onClose={() => setParticipantModal({ open: false, id: null })}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="part-name">اسم المشارك *</label>
                  <div className="flex gap-2">
                    <input
                      id="part-name"
                      type="text"
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      value={participantForm.participantName || ''}
                      onChange={e => setParticipantForm({ ...participantForm, participantName: e.target.value })}
                    />
                    {students.length > 0 && (
                      <button
                        onClick={() => {
                          setParticipantModal({ open: true, id: null });
                          info('يرجى اختيار التلميذ من قائمة الأسماء إذا كان مسجلاً');
                        }}
                        className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer shrink-0"
                        title="اختيار تلميذ مسجل"
                      >
                        <UserPlus size={18} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">نوع المشارك</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PARTICIPANT_TYPES.map(t => (
                        <button
                          key={t.type}
                          onClick={() => setParticipantForm({ ...participantForm, participantType: t.type })}
                          className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            participantForm.participantType === t.type
                              ? 'bg-[#257C86] text-white border-[#257C86]'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="part-phone">رقم الهاتف (8 أرقام)</label>
                    <input
                      id="part-phone"
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                      value={participantForm.contactPhone || ''}
                      onChange={e => setParticipantForm({ ...participantForm, contactPhone: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">طريقة الدفع</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Espèces', 'Chèque'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setParticipantForm({ ...participantForm, paymentMethod: m })}
                        className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          (participantForm.paymentMethod || 'Espèces') === m
                            ? 'bg-[#257C86] text-white border-[#257C86]'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {m === 'Espèces' ? 'نقداً (Espèces)' : 'شيك (Par Chèque)'}
                      </button>
                    ))}
                  </div>
                </div>
                {(participantForm.paymentMethod || 'Espèces') === 'Chèque' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-[#257C86]/[0.06] rounded-xl border border-[#257C86]/20">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1" htmlFor="part-cheque-num">رقم الشيك *</label>
                      <input
                        id="part-cheque-num"
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 h-[38px] focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                        value={participantForm.chequeNumber || ''}
                        onChange={e => setParticipantForm({ ...participantForm, chequeNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1" htmlFor="part-cheque-date">تاريخ الشيك</label>
                      <DateField
                        id="part-cheque-date"
                        value={participantForm.chequeDate || ''}
                        onChange={e => setParticipantForm({ ...participantForm, chequeDate: e.target.value })}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 h-[38px]"
                      />
                    </div>
                  </div>
                )}
                {selectedEvent && (() => {
                  const price = eventPriceFor(selectedEvent, (participantForm.participantType as EventParticipantType) || 'student');
                  const maxDiscount = Math.max(0, price - 1);
                  const remainingAfter = round2(Math.max(0, price - (participantForm.discount || 0) - (participantForm.amountPaid || 0)));
                  return (
                    <div className="p-4 bg-[#257C86]/[0.06] rounded-2xl border border-[#257C86]/20 grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-[#1e626b] block mb-1" htmlFor="part-discount">التخفيض (د.ت)</label>
                        <input
                          id="part-discount"
                          type="number"
                          min="0"
                          max={maxDiscount}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                          value={participantForm.discount || 0}
                          onChange={e => setParticipantForm({ ...participantForm, discount: Math.max(0, Math.min(maxDiscount, parseFloat(e.target.value) || 0)) })}
                        />
                        {price > 0 && (
                          <p className="text-[10px] font-bold text-slate-400 mt-1">
                            يجب أن يكون أقل تماماً من مبلغ المشاركة ({price} د.ت)
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-[#1e626b] block mb-1" htmlFor="part-paid">المبلغ المدفوع (د.ت)</label>
                        <input
                          id="part-paid"
                          type="number"
                          min="0"
                          max={Math.max(0, price - (participantForm.discount || 0))}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                          value={participantForm.amountPaid || 0}
                          onChange={e => setParticipantForm({
                            ...participantForm,
                            amountPaid: Math.min(Math.max(0, price - (participantForm.discount || 0)), Math.max(0, parseFloat(e.target.value) || 0))
                          })}
                        />
                      </div>
                      <div className={`col-span-2 p-2.5 rounded-xl border text-xs flex justify-between items-center font-bold ${remainingAfter > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-[#257C86]/20 text-[#1e626b]'}`}>
                        <span>{remainingAfter > 0 ? 'المتبقي بعد الدفع (Reste):' : 'حالة الخلاص:'}</span>
                        <span className="font-mono font-black">
                          {remainingAfter > 0 ? `${remainingAfter} د.ت` : 'خلاص كامل ✓'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="part-notes">ملاحظات</label>
                  <input
                    id="part-notes"
                    type="text"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                    value={participantForm.notes || ''}
                    onChange={e => setParticipantForm({ ...participantForm, notes: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setParticipantModal({ open: false, id: null })}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleSubmitParticipant}
                className="px-5 py-2 bg-[#257C86] hover:bg-[#1e626b] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                حفظ المشارك
              </button>
            </div>
          </Modal>
        )}

        {paymentModal.open && (
          <Modal
            title="تسجيل دفعة مالية"
            onClose={() => setPaymentModal({ open: false, participantId: null })}
          >
            <div className="space-y-4">
              {selectedEvent && paymentModal.participantId && (
                <div className="p-3.5 bg-[#257C86]/[0.06] rounded-2xl border border-[#257C86]/20 flex justify-between items-center text-xs font-bold text-[#1e626b]">
                  <span className="font-black text-sm">
                    {selectedEvent.participants.find(p => p.id === paymentModal.participantId)?.participantName}
                  </span>
                  <span className="font-mono">
                    المتبقي: {round2(selectedEvent.participants.find(p => p.id === paymentModal.participantId)?.remainingBalance || 0)} د.ت
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4">
                {(() => {
                  const part = selectedEvent && paymentModal.participantId
                    ? selectedEvent.participants.find(p => p.id === paymentModal.participantId)
                    : null;
                  const remainingBefore = part ? round2(Math.max(0, part.totalRequired - part.amountPaid)) : 0;
                  const remainingAfter = part ? round2(Math.max(0, remainingBefore - (paymentForm.amount || 0))) : 0;
                  return (
                    <>
                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1" htmlFor="pay-amount">المبلغ (د.ت)</label>
                        <input
                          id="pay-amount"
                          type="number"
                          min="0"
                          max={part ? remainingBefore : undefined}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-[#1e626b] font-mono focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                          value={paymentForm.amount || ''}
                          onChange={e => setPaymentForm({
                            ...paymentForm,
                            amount: Math.min(remainingBefore, Math.max(0, parseFloat(e.target.value) || 0))
                          })}
                        />
                        {part && remainingBefore > 0 && (
                          <p className="text-[10px] font-bold text-slate-400 mt-1">
                            الحد الأقصى لهذه الدفعة: {remainingBefore} د.ت (المتبقي المستحق)
                          </p>
                        )}
                      </div>
                      {part && (
                        <div className={`p-3 rounded-2xl border text-xs flex justify-between items-center font-bold ${remainingAfter > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-[#257C86]/[0.06] border-[#257C86]/20 text-[#1e626b]'}`}>
                          <span>{remainingAfter > 0 ? 'المتبقي بعد هذه الدفعة (Reste):' : 'بعد هذه الدفعة:'}</span>
                          <span className="font-mono font-black">
                            {remainingAfter > 0 ? `${remainingAfter} د.ت` : 'خلاص كامل ✓'}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">طريقة الدفع</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Espèces', 'Chèque'].map(m => (
                      <button
                        key={m}
                        onClick={() => setPaymentForm({ ...paymentForm, method: m as any })}
                        className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          paymentForm.method === m
                            ? 'bg-[#257C86] text-white border-[#257C86]'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {m === 'Espèces' ? 'نقداً (Espèces)' : 'شيك (Par Chèque)'}
                      </button>
                    ))}
                  </div>
                </div>
                {paymentForm.method === 'Chèque' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-[#257C86]/[0.06] rounded-xl border border-[#257C86]/20">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1" htmlFor="pay-cheque-num">رقم الشيك</label>
                      <input
                        id="pay-cheque-num"
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 h-[38px] focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                        value={paymentForm.chequeNumber || ''}
                        onChange={e => setPaymentForm({ ...paymentForm, chequeNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1" htmlFor="pay-cheque-date">تاريخ الشيك</label>
                      <DateField
                        id="pay-cheque-date"
                        value={paymentForm.chequeDate || ''}
                        onChange={e => setPaymentForm({ ...paymentForm, chequeDate: e.target.value })}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 h-[38px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setPaymentModal({ open: false, participantId: null })}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleSubmitPayment}
                className="px-5 py-2 bg-[#257C86] hover:bg-[#1e626b] text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <CreditCard className="h-4 w-4" />
                تسجيل الدفعة
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* PRINT RECEIPT MODAL (نفس نظام الطباعة في وحدة المتابعة والمكتبة) */}
      <AnimatePresence>
        {printReceipt.open && selectedEvent && printReceipt.participantId && (() => {
          const part = selectedEvent.participants.find(p => p.id === printReceipt.participantId);
          if (!part) return null;
          const receiptRemaining = round2(Math.max(0, part.remainingBalance || 0));
          return (
            <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-8"
              >
                <div className="p-4 bg-[#257C86] text-white flex justify-between items-center no-print">
                  <span className="font-bold text-sm">وصل خلاص رسمي — فعالية {selectedEvent.name}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="px-4 py-2 bg-[#257C86] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="h-4 w-4" />
                      طباعة الوصل 🖨️
                    </button>
                    <button
                      onClick={() => setPrintReceipt({ open: false, participantId: null })}
                      className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto">
                  {/* RECEIPT PRINT TEMPLATE */}
                  <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col">
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-950">{centerName} — وصل خلاص فعالية</h2>
                        <p className="text-[10px] text-slate-500 font-mono">رقم الوصل: {part.receiptNumber || '—'}</p>
                        <p className="text-[10px] text-slate-400">تاريخ آخر دفعة: {part.paidAt ? part.paidAt.split('T')[0] : todayIso}</p>
                      </div>
                      <div className="text-left font-mono font-bold text-xs bg-slate-100 p-2 rounded border border-slate-300">
                        <p>الخدمة: <strong>فعالية / خرجة</strong></p>
                        <p className="text-[11px] text-[#1e626b] mt-0.5">الفعالية: {selectedEvent.name}</p>
                        <p className="text-[11px] text-slate-500">{selectedEvent.date}{selectedEvent.location ? ` — ${selectedEvent.location}` : ''}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-bold">اسم المشارك(ة):</span>
                        <span className="font-extrabold text-slate-900">
                          {part.participantName} ({PARTICIPANT_TYPES.find(t => t.type === part.participantType)?.label})
                        </span>
                      </div>

                      <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-bold">رقم الهاتف:</span>
                        <span className="font-bold text-slate-800 font-mono" dir="ltr">{part.contactPhone || 'غير مدون'}</span>
                      </div>

                      {/* Payment record table */}
                      <div className="space-y-1.5 pt-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex justify-between items-center">
                          <span>سجل الدفعات المسجلة:</span>
                          <span className="text-[10px] text-slate-500 font-normal">عدد الدفعات: 1</span>
                        </h4>

                        <div className="border border-slate-300 rounded-xl overflow-x-auto">
                          <table className="min-w-[560px] w-full text-right text-[11px]">
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
                              <tr>
                                <td className="p-2 font-bold text-slate-400">1</td>
                                <td className="p-2 font-mono text-slate-700">{part.paidAt ? part.paidAt.split('T')[0] : todayIso}</td>
                                <td className="p-2 font-mono text-slate-500 text-[10px]">{part.receiptNumber || '—'}</td>
                                <td className="p-2 text-slate-800 font-medium">
                                  <span className="font-bold">{part.paymentMethod === 'Chèque' ? 'Chèque' : 'Espèces'}</span>
                                  {part.chequeNumber && (
                                    <span className="text-slate-500 text-[10px] block">
                                      شيك رقم: {part.chequeNumber}{part.chequeDate ? ` — ${part.chequeDate}` : ''}
                                    </span>
                                  )}
                                  {part.discount ? <span className="text-[#1e626b] text-[10px] block font-bold">التخفيض: {part.discount} د.ت</span> : null}
                                  {part.notes && <span className="text-slate-500 text-[10px] block">{part.notes}</span>}
                                </td>
                                <td className="p-2 text-left font-black font-mono text-[#1e626b]">{round2(part.amountPaid)} د.ت</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-300">
                          <span className="text-[10px] text-slate-600 block font-bold">مبلغ المشاركة:</span>
                          <span className="text-base font-black text-slate-900 font-mono">{round2(part.totalRequired)} د.ت</span>
                        </div>

                        <div className="p-2.5 bg-[#257C86]/[0.06] rounded-xl border border-[#257C86]/30">
                          <span className="text-[10px] text-[#1e626b] block font-bold">المسدد حتى الآن:</span>
                          <span className="text-base font-black text-[#1e626b] font-mono">{round2(part.amountPaid)} د.ت</span>
                        </div>

                        <div className={`p-2.5 rounded-xl border ${receiptRemaining === 0 ? 'bg-slate-50 border-slate-200' : 'bg-[#257C86]/[0.06] border-[#257C86]/20'}`}>
                          <span className="text-[10px] text-[#1e626b] block font-bold">الرصيد المتبقي:</span>
                          <span className={`text-base font-black font-mono ${receiptRemaining === 0 ? 'text-slate-400' : 'text-red-700'}`}>{receiptRemaining} د.ت</span>
                        </div>
                      </div>

                      {part.discount ? (
                        <div className="p-2.5 bg-[#257C86]/[0.06] rounded-xl border border-[#257C86]/20 flex justify-between items-center">
                          <span className="text-[10px] text-[#1e626b] font-bold">التخفيض الممنوح:</span>
                          <span className="text-base font-black text-[#1e626b] font-mono">-{part.discount} د.ت</span>
                        </div>
                      ) : null}

                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center font-bold">
                        {receiptRemaining === 0 ? (
                          <span className="text-[#1e626b] text-xs flex items-center justify-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            حالة المشاركة: مسدد بالكامل
                          </span>
                        ) : part.paymentMethod === 'Chèque' ? (
                          <span className="text-amber-700 text-xs flex items-center justify-center gap-1">
                            <Clock className="h-4 w-4" />
                            حالة المشاركة: شيك معلق — بانتظار التحصيل من وحدة المالية
                          </span>
                        ) : (
                          <span className="text-[#1e626b] text-xs">
                            حالة المشاركة: خلاص جزئي — باقي: {receiptRemaining} د.ت
                          </span>
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
                </div>
              </motion.div>
            </div>
          );
        })()}

        {/* PRINT ATTENDANCE MODAL (نفس نظام الطباعة في التطبيق) */}
        {printAttendance.open && selectedEvent && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-8"
            >
              <div className="p-4 bg-[#257C86] text-white flex justify-between items-center no-print">
                <span className="font-bold text-sm">كشف حضور ومغادرة — {selectedEvent.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#257C86] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    طباعة الكشف (A4) 🖨️
                  </button>
                  <button
                    onClick={() => setPrintAttendance({ open: false, eventId: null })}
                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto">
                {/* ATTENDANCE PRINT TEMPLATE */}
                <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 w-full mx-auto text-xs font-sans flex flex-col">
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                    <div>
                      <h2 className="text-lg font-black text-slate-950">{centerName} — كشف حضور ومغادرة</h2>
                      <p className="text-[10px] text-slate-500 font-bold">الفعالية: {selectedEvent.name} | التاريخ: {selectedEvent.date}{selectedEvent.time ? ` — ${selectedEvent.time}` : ''}</p>
                    </div>
                    <div className="text-left font-mono font-bold text-[11px] bg-slate-100 p-2 rounded border border-slate-300">
                      <p>الوجهة: {selectedEvent.location}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">السنة الدراسية: {selectedEvent.schoolYear || getCurrentAcademicYear()}</p>
                    </div>
                  </div>

                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border border-slate-900">
                        <th className="border border-slate-900 px-4 py-2 w-12">#</th>
                        <th className="border border-slate-900 px-4 py-2">اسم المشارك</th>
                        <th className="border border-slate-900 px-4 py-2 w-24 text-center">النوع</th>
                        <th className="border border-slate-900 px-4 py-2 w-20 text-center">ذهاب</th>
                        <th className="border border-slate-900 px-4 py-2 w-20 text-center">إياب</th>
                        <th className="border border-slate-900 px-4 py-2">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEvent.participants.map((p, i) => (
                        <tr key={p.id} className="border border-slate-900">
                          <td className="border border-slate-900 px-4 py-2 text-center">{i + 1}</td>
                          <td className="border border-slate-900 px-4 py-2">{p.participantName}</td>
                          <td className="border border-slate-900 px-4 py-2 text-center">{PARTICIPANT_TYPES.find(t => t.type === p.participantType)?.label}</td>
                          <td className="border border-slate-900 px-4 py-2"></td>
                          <td className="border border-slate-900 px-4 py-2"></td>
                          <td className="border border-slate-900 px-4 py-2"></td>
                        </tr>
                      ))}
                      {Array.from({ length: Math.max(0, 20 - selectedEvent.participants.length) }).map((_, i) => (
                        <tr key={`filler-${i}`} className="border border-slate-900">
                          <td className="border border-slate-900 px-4 py-2 text-center"></td>
                          <td className="border border-slate-900 px-4 py-2"></td>
                          <td className="border border-slate-900 px-4 py-2"></td>
                          <td className="border border-slate-900 px-4 py-2"></td>
                          <td className="border border-slate-900 px-4 py-2"></td>
                          <td className="border border-slate-900 px-4 py-2"></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-8 pt-4 border-t border-slate-300">
                    <div className="flex justify-between items-center text-[10px] text-slate-500 mb-8">
                      <p>عدد المشاركين المسجلين: {selectedEvent.participants.length}</p>
                      <p className="font-bold text-slate-900">ختم وإدارة مركز {centerName}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-8">
                      <div className="text-center">
                        <div className="text-xs font-black mb-8">توقيع المرافق(ة)</div>
                        <div className="border-b-2 border-dotted border-slate-400 w-full h-8 mx-auto"></div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-black mb-8">توقيع السائق</div>
                        <div className="border-b-2 border-dotted border-slate-400 w-full h-8 mx-auto"></div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-black mb-8">ختم الإدارة</div>
                        <div className="border-b-2 border-dotted border-slate-400 w-full h-8 mx-auto"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ open: false, title: '', message: '', onConfirm: () => {} });
        }}
        onCancel={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: () => {} })}
      />
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden my-8"
      >
        <div className="p-6 bg-[#257C86] text-white flex justify-between items-center">
          <h3 className="text-lg font-black">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
