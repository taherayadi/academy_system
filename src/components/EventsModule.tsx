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
  Filter,
  ChevronLeft,
  ChevronRight,
  FileText
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
import { ToastProvider, useToast } from './Toast';

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

const STATUS_CONFIG: Record<EventStatus, { label: string; color: string }> = {
  planned: { label: 'مخطط لها', color: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'مؤكدة', color: 'bg-green-100 text-green-700' },
  completed: { label: 'مكتملة', color: 'bg-gray-100 text-gray-700' },
  cancelled: { label: 'ملغاة', color: 'bg-red-100 text-red-700' },
};

const STATUS_ORDER: EventStatus[] = ['planned', 'confirmed', 'completed', 'cancelled'];

const PARTICIPANT_TYPES: { type: EventParticipantType; label: string; priceField: keyof SchoolEvent }[] = [
  { type: 'student', label: 'تلميذ', priceField: 'priceStudent' },
  { type: 'parent', label: 'ولي أمر', priceField: 'priceParent' },
  { type: 'sibling', label: 'أخ/أخت', priceField: 'priceSibling' },
  { type: 'external', label: 'خارجي', priceField: 'priceExternal' },
];

export default function EventsModule({
  events,
  onUpdateEvents,
  students = [],
  settings,
  sidebarCollapsed
}: EventsModuleProps) {
  const { success, error, info } = useToast();
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
    const collected = participants.reduce((sum, p) => sum + p.amountPaid, 0);
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

    const type = (participantForm.participantType as EventParticipantType) || 'student';
    const price = eventPriceFor(selectedEvent, type);

    if (participantModal.id) {
      patchParticipant(selectedEvent.id, participantModal.id, p => ({ ...p, ...participantForm }));
    } else {
      const newPart: EventParticipant = {
        id: 'prt_' + crypto.randomUUID(),
        participantName: participantForm.participantName || '',
        participantType: type,
        linkedStudentId: participantForm.linkedStudentId,
        contactPhone: participantForm.contactPhone || '',
        amountPaid: participantForm.amountPaid || 0,
        totalRequired: price,
        remainingBalance: price - (participantForm.amountPaid || 0),
        paymentMethod: participantForm.paymentMethod,
        chequeNumber: participantForm.chequeNumber,
        chequeDate: participantForm.chequeDate,
        paid: (participantForm.amountPaid || 0) >= price,
        paidAt: participantForm.paidAt,
        attended: false,
        notes: participantForm.notes,
        receiptNumber: (participantForm.amountPaid || 0) > 0 ? generateEventReceiptNumber(events) : undefined,
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

    const newPaidAmount = round2(part.amountPaid + paymentForm.amount);
    const total = part.totalRequired;
    const paid = newPaidAmount >= total;
    const receiptNumber = part.receiptNumber || generateEventReceiptNumber(events);

    patchParticipant(selectedEvent.id, part.id, p => ({
      ...p,
      amountPaid: newPaidAmount,
      remainingBalance: round2(total - newPaidAmount),
      paid,
      paidAt: paid ? new Date().toISOString() : p.paidAt,
      paymentMethod: paymentForm.method,
      chequeNumber: paymentForm.chequeNumber,
      chequeDate: paymentForm.chequeDate,
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
    <div className="flex h-full w-full bg-gray-50 text-right" dir="rtl">
      {/* Sidebar */}
      <div className={`flex flex-col border-l bg-white transition-all ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-80'}`}>
        <div className="p-4 border-b space-y-4">
          <button
            onClick={() => {
              setEventForm({ schoolYear: getCurrentAcademicYear() });
              setEventModal({ open: true, id: null });
            }}
            className="w-full flex items-center justify-center gap-2 py-2 bg-[#257C86] text-white rounded-lg hover:bg-[#1e626b] transition-colors font-medium"
          >
            <Plus size={18} />
            <span>فعالية جديدة</span>
          </button>

          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="بحث عن فعالية..."
              className="w-full pr-9 pl-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-[#257C86] outline-none"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium uppercase tracking-wider">
              <Filter size={12} />
              <span>تصفية</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <select
                className="text-xs border rounded px-2 py-1 bg-gray-50 outline-none"
                value={filterYear}
                onChange={e => setFilterYear(e.target.value)}
              >
                <option value="">كل السنوات</option>
                {[...DEFAULT_ACADEMIC_YEARS].sort().reverse().map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                className="text-xs border rounded px-2 py-1 bg-gray-50 outline-none"
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value as any)}
              >
                <option value="all">كل الفئات</option>
                {CATEGORY_ORDER.map(cat => (
                  <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {STATUS_ORDER.map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
                  className={`px-2 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                    filterStatus === status
                      ? 'bg-[#257C86] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {STATUS_CONFIG[status].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">لا توجد فعاليات مطابقة</div>
          ) : (
            filteredEvents.map(e => {
              const Icon = CATEGORY_CONFIG[e.category].icon;
              const collected = e.participants.reduce((sum, p) => sum + p.amountPaid, 0);
              const registrationRate = e.maxCapacity ? (e.participants.length / e.maxCapacity) * 100 : 0;

              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-right p-3 rounded-xl border transition-all ${
                    selectedId === e.id
                      ? 'border-[#257C86] bg-[#257C86]/[0.06] ring-1 ring-[#257C86]'
                      : 'border-gray-200 bg-white hover:border-[#257C86]/50 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-1.5 bg-[#257C86]/10 text-[#257C86] rounded-lg">
                      <Icon size={16} />
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[e.status].color}`}>
                      {STATUS_CONFIG[e.status].label}
                    </span>
                  </div>
                  <div className="font-bold text-sm text-gray-800 truncate mb-1">{e.name}</div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                    <MapPin size={12} />
                    <span className="truncate">{e.location}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                    <div className="text-left">
                      <div className="text-[10px] text-gray-400 uppercase">المشاركين</div>
                      <div className="text-xs font-bold text-gray-700">{e.participants.length} {e.maxCapacity ? `/ ${e.maxCapacity}` : ''}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-gray-400 uppercase">المحصل</div>
                      <div className="text-xs font-bold text-[#257C86]">{round2(collected)} د.ت</div>
                    </div>
                  </div>
                  {e.maxCapacity && (
                    <div className="mt-2 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${registrationRate > 90 ? 'bg-amber-500' : 'bg-[#257C86]'}`}
                        style={{ width: `${Math.min(100, registrationRate)}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {!selectedEvent ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-400">
            <div className="p-4 bg-gray-100 rounded-full mb-4 text-gray-300">
              <Calendar size={48} />
            </div>
            <h3 className="text-lg font-medium text-gray-600">لم يتم اختيار فعالية</h3>
            <p className="text-sm max-w-xs">اختر فعالية من القائمة الجانبية لإدارة المشاركين والمدفوعات</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#257C86] text-white rounded-2xl shadow-lg shadow-[#257C86]/20">
                  {React.createElement(CATEGORY_CONFIG[selectedEvent.category].icon, { size: 24 })}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold text-gray-800">{selectedEvent.name}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[selectedEvent.status].color}`}>
                      {STATUS_CONFIG[selectedEvent.status].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />
                      <span>{selectedEvent.date}</span>
                    </div>
                    {selectedEvent.time && (
                      <div className="flex items-center gap-1">
                        <Clock size={14} />
                        <span>{selectedEvent.time}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <MapPin size={14} />
                      <span>{selectedEvent.location}</span>
                    </div>
                    {selectedEvent.busIncluded && (
                      <div className="flex items-center gap-1 text-[#257C86] font-medium">
                        <Bus size={14} />
                        <span>حافلة متوفرة</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEventForm(selectedEvent);
                    setEventModal({ open: true, id: selectedEvent.id });
                  }}
                  className="p-2 text-gray-500 hover:text-[#257C86] hover:bg-[#257C86]/[0.06] rounded-lg transition-all border border-transparent hover:border-[#257C86]/40"
                  title="تعديل الفعالية"
                >
                  <Edit3 size={20} />
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
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-200"
                  title="حذف الفعالية"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 shrink-0">
              <div className="bg-white p-4 rounded-2xl border shadow-sm flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <UserPlus size={24} />
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-medium uppercase">المشاركون</div>
                  <div className="text-lg font-bold text-gray-800">
                    {stats?.total} <span className="text-sm font-normal text-gray-400">/ {stats?.capacity}</span>
                  </div>
                  {stats?.overCapacity && (
                    <div className="text-[10px] text-amber-600 flex items-center gap-1 mt-1 font-medium">
                      <AlertCircle size={10} />
                      <span>تجاوز السعة المحددة</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CreditCard size={24} />
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-medium uppercase">المالية (د.ت)</div>
                  <div className="text-lg font-bold text-gray-800">
                    {round2(stats?.collected || 0)} <span className="text-sm font-normal text-gray-400">من {round2(stats?.expected || 0)}</span>
                  </div>
                  <div className="text-[10px] text-red-500 mt-1 font-medium">
                    متبقي: {round2(stats?.unpaid || 0)} د.ت
                  </div>
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border shadow-sm flex items-center gap-4">
                <div className="p-3 bg-[#257C86]/10 text-[#257C86] rounded-xl">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-medium uppercase">نسبة الحضور</div>
                  <div className="text-lg font-bold text-gray-800">
                    {round2(stats?.attendanceRate || 0)}%
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-[#257C86] transition-all"
                      style={{ width: `${stats?.attendanceRate || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Participants Section */}
            <div className="flex-1 flex flex-col overflow-hidden p-4 pt-0 gap-4">
              <div className="bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 border-b flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="بحث عن مشارك..."
                        className="w-full pr-9 pl-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#257C86] outline-none"
                        value={participantSearch}
                        onChange={e => setParticipantSearch(e.target.value)}
                      />
                    </div>
                    <select
                      className="text-xs border rounded-lg px-3 py-2 bg-gray-50 outline-none"
                      value={participantStatusFilter}
                      onChange={e => setParticipantStatusFilter(e.target.value as any)}
                    >
                      <option value="all">كل الحالات</option>
                      <option value="paid">مدفوع</option>
                      <option value="unpaid">غير مدفوع</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      setParticipantForm({});
                      setParticipantModal({ open: true, id: null });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#257C86] text-white rounded-lg hover:bg-[#1e626b] transition-all text-sm font-medium shadow-sm"
                  >
                    <UserPlus size={16} />
                    <span>إضافة مشارك</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs">حضور</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs">المشارك</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs">النوع</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs text-left">المبلغ المطلوب</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs text-left">المدفوع</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs text-left">المتبقي</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs text-center">الحالة</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredParticipants.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-gray-400">لا يوجد مشاركين مطابقين</td>
                        </tr>
                      ) : (
                        filteredParticipants.map(p => (
                          <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={p.attended}
                                onChange={() => toggleAttendance(selectedEvent.id, p.id)}
                                className="w-4 h-4 rounded text-[#257C86] focus:ring-[#257C86]"
                              />
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-800">{p.participantName}</td>
                            <td className="px-4 py-3">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                {PARTICIPANT_TYPES.find(t => t.type === p.participantType)?.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-left font-mono">{round2(p.totalRequired)}</td>
                            <td className="px-4 py-3 text-left font-mono">{round2(p.amountPaid)}</td>
                            <td className="px-4 py-3 text-left font-mono text-red-500">{round2(p.remainingBalance)}</td>
                            <td className="px-4 py-3 text-center">
                              {p.paid ? (
                                <span className="inline-flex items-center gap-1 text-green-600 text-[10px] font-bold">
                                  <CheckCircle2 size={12} />
                                  مدفوع
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-500 text-[10px] font-bold">
                                  <XCircle size={12} />
                                  غير مدفوع
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center gap-1">
                                <button
                                  onClick={() => setPaymentModal({ open: true, participantId: p.id })}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="تسجيل دفعة"
                                >
                                  <CreditCard size={16} />
                                </button>
                                {p.receiptNumber && (
                                  <button
                                    onClick={() => setPrintReceipt({ open: true, participantId: p.id })}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="طباعة وصل"
                                >
                                    <Printer size={16} />
                                </button>
                                )}
                                <button
                                  onClick={() => {
                                    setParticipantForm(p);
                                    setParticipantModal({ open: true, id: p.id });
                                  }}
                                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors" title="تعديل"
                                >
                                  <Edit3 size={16} />
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
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors" title="حذف"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPrintAttendance({ open: true, eventId: selectedEvent.id })}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium"
                    >
                      <FileText size={16} />
                      <span>طباعة كشف الحضور (A4)</span>
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 font-medium">
                    إجمالي المشاركين: {filteredParticipants.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modals */}
        <AnimatePresence>
          {eventModal.open && (
            <Modal
              title={eventModal.id ? 'تعديل الفعالية' : 'فعالية جديدة'}
              onClose={() => setEventModal({ open: false, id: null })}
            >
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="event-name">اسم الفعالية *</label>
                    <input
                      id="event-name"
                      type="text"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                      value={eventForm.name || ''}
                      onChange={e => setEventForm({ ...eventForm, name: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="event-description">الوصف</label>
                    <textarea
                      id="event-description"
                      rows={3}
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                      value={eventForm.description || ''}
                      onChange={e => setEventForm({ ...eventForm, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="event-category">الفئة</label>
                    <select
                      id="event-category"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                      value={eventForm.category || 'other'}
                      onChange={e => setEventForm({ ...eventForm, category: e.target.value as any })}
                    >
                      {CATEGORY_ORDER.map(cat => (
                        <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="event-status">الحالة</label>
                    <select
                      id="event-status"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                      value={eventForm.status || 'planned'}
                      onChange={e => setEventForm({ ...eventForm, status: e.target.value as any })}
                    >
                      {STATUS_ORDER.map(status => (
                        <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="event-date">التاريخ *</label>
                    <DateField
                      id="event-date"
                      value={eventForm.date || ''}
                      onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="event-time">الوقت</label>
                    <input
                      id="event-time"
                      type="time"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                      value={eventForm.time || ''}
                      onChange={e => setEventForm({ ...eventForm, time: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="event-location">الموقع *</label>
                    <input
                      id="event-location"
                      type="text"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                      value={eventForm.location || ''}
                      onChange={e => setEventForm({ ...eventForm, location: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="event-capacity">سعة الحد الأقصى</label>
                    <input
                      id="event-capacity"
                      type="number"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                      value={eventForm.maxCapacity || ''}
                      onChange={e => setEventForm({ ...eventForm, maxCapacity: parseInt(e.target.value) || undefined })}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="bus-included"
                      className="w-4 h-4 text-[#257C86] rounded"
                      checked={!!eventForm.busIncluded}
                      onChange={e => setEventForm({ ...eventForm, busIncluded: e.target.checked })}
                    />
                    <label htmlFor="bus-included" className="text-sm text-gray-700">تشمل الحافلة</label>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="event-year">السنة الدراسية</label>
                    <select
                      id="event-year"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                      value={eventForm.schoolYear || getCurrentAcademicYear()}
                      onChange={e => setEventForm({ ...eventForm, schoolYear: e.target.value })}
                    >
                      {[...DEFAULT_ACADEMIC_YEARS].sort().reverse().map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl border space-y-3">
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">تسعيرة المشاركين (د.ت)</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1" htmlFor="price-student">تلميذ</label>
                      <input
                        id="price-student"
                        type="number"
                        className="w-full px-3 py-1.5 border rounded-md text-sm outline-none"
                        value={eventForm.priceStudent || 0}
                        onChange={e => setEventForm({ ...eventForm, priceStudent: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1" htmlFor="price-parent">ولي أمر</label>
                      <input
                        id="price-parent"
                        type="number"
                        className="w-full px-3 py-1.5 border rounded-md text-sm outline-none"
                        value={eventForm.priceParent || 0}
                        onChange={e => setEventForm({ ...eventForm, priceParent: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1" htmlFor="price-sibling">أخ / أخت</label>
                      <input
                        id="price-sibling"
                        type="number"
                        className="w-full px-3 py-1.5 border rounded-md text-sm outline-none"
                        value={eventForm.priceSibling || 0}
                        onChange={e => setEventForm({ ...eventForm, priceSibling: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1" htmlFor="price-external">خارجي</label>
                      <input
                        id="price-external"
                        type="number"
                        className="w-full px-3 py-1.5 border rounded-md text-sm outline-none"
                        value={eventForm.priceExternal || 0}
                        onChange={e => setEventForm({ ...eventForm, priceExternal: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setEventModal({ open: false, id: null })}
                  className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSubmitEvent}
                  className="px-4 py-2 text-sm bg-[#257C86] text-white rounded-lg hover:bg-[#1e626b] transition-colors font-medium"
                >
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
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="part-name">اسم المشارك *</label>
                    <div className="flex gap-2">
                      <input
                        id="part-name"
                        type="text"
                        className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                        value={participantForm.participantName || ''}
                        onChange={e => setParticipantForm({ ...participantForm, participantName: e.target.value })}
                      />
                      {students.length > 0 && (
                        <button
                          onClick={() => {
                            setParticipantModal({ open: true, id: null });
                            info('يرجى اختيار التلميذ من قائمة الأسماء إذا كان مسجلاً');
                          }}
                          className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                          title="اختيار تلميذ مسجل"
                        >
                          <UserPlus size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">نوع المشارك</label>
                      <div className="flex flex-wrap gap-2">
                        {PARTICIPANT_TYPES.map(t => (
                          <button
                            key={t.type}
                            onClick={() => setParticipantForm({ ...participantForm, participantType: t.type })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                              participantForm.participantType === t.type
                                ? 'bg-[#257C86] text-white border-[#257C86] shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-[#257C86]/50'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="part-phone">رقم الهاتف</label>
                      <input
                        id="part-phone"
                        type="text"
                        className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                        value={participantForm.contactPhone || ''}
                        onChange={e => setParticipantForm({ ...participantForm, contactPhone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl border grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1" htmlFor="part-required">المبلغ المطلوب (د.ت)</label>
                      <input
                        id="part-required"
                        type="number"
                        className="w-full px-3 py-1.5 border rounded-md text-sm outline-none font-mono"
                        value={participantForm.totalRequired || (selectedEvent ? eventPriceFor(selectedEvent, (participantForm.participantType as EventParticipantType) || 'student') : 0)}
                        onChange={e => setParticipantForm({ ...participantForm, totalRequired: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1" htmlFor="part-paid">المبلغ المدفوع (د.ت)</label>
                      <input
                        id="part-paid"
                        type="number"
                        className="w-full px-3 py-1.5 border rounded-md text-sm outline-none font-mono"
                        value={participantForm.amountPaid || 0}
                        onChange={e => setParticipantForm({ ...participantForm, amountPaid: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="part-notes">ملاحظات</label>
                    <input
                      id="part-notes"
                      type="text"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                      value={participantForm.notes || ''}
                      onChange={e => setParticipantForm({ ...participantForm, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setParticipantModal({ open: false, id: null })}
                  className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSubmitParticipant}
                  className="px-4 py-2 text-sm bg-[#257C86] text-white rounded-lg hover:bg-[#1e626b] transition-colors font-medium"
                >
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
              <div className="space-y-4 py-2">
                {selectedEvent && paymentModal.participantId && (
                  <div className="p-3 bg-[#257C86]/10 rounded-lg border border-[#257C86]/10 flex justify-between items-center">
                    <div className="text-sm font-bold text-[#1e626b]">
                      {selectedEvent.participants.find(p => p.id === paymentModal.participantId)?.participantName}
                    </div>
                    <div className="text-xs text-[#257C86]">
                      المتبقي: {round2(selectedEvent.participants.find(p => p.id === paymentModal.participantId)?.remainingBalance || 0)} د.ت
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="pay-amount">المبلغ (د.ت)</label>
                    <input
                      id="pay-amount"
                      type="number"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86] font-mono"
                      value={paymentForm.amount || ''}
                      onChange={e => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">طريقة الدفع</label>
                    <div className="flex gap-2">
                      {['Espèces', 'Chèque'].map(m => (
                        <button
                          key={m}
                          onClick={() => setPaymentForm({ ...paymentForm, method: m as any })}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                            paymentForm.method === m
                              ? 'bg-[#257C86] text-white border-[#257C86] shadow-sm'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-[#257C86]/50'
                          }`}
                        >
                          {m === 'Espèces' ? 'نقداً' : 'شيك'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {paymentForm.method === 'Chèque' && (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="pay-cheque-num">رقم الشيك</label>
                        <input
                          id="pay-cheque-num"
                          type="text"
                          className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                          value={paymentForm.chequeNumber || ''}
                          onChange={e => setPaymentForm({ ...paymentForm, chequeNumber: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="pay-cheque-date">تاريخ الشيك</label>
                        <input
                          id="pay-cheque-date"
                          type="date"
                          className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#257C86]"
                          value={paymentForm.chequeDate || ''}
                          onChange={e => setPaymentForm({ ...paymentForm, chequeDate: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setPaymentModal({ open: false, participantId: null })}
                  className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSubmitPayment}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                >
                  تسجيل الدفعة
                </button>
              </div>
            </Modal>
          )}
        </AnimatePresence>

        {/* Print Overlays */}
        <AnimatePresence>
          {printReceipt.open && selectedEvent && printReceipt.participantId && (
            <PrintOverlay onClose={() => setPrintReceipt({ open: false, participantId: null })}>
              <div className="bg-white p-8 w-[100mm] mx-auto text-right font-sans border shadow-sm">
                <div className="text-center border-b-2 border-double pb-4 mb-6">
                  <h1 className="text-xl font-bold">وصل استلام مالي</h1>
                  <p className="text-sm text-gray-500">فعالية: {selectedEvent.name}</p>
                </div>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">رقم الوصل:</span>
                    <span>{selectedEvent.participants.find(p => p.id === printReceipt.participantId)?.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold">تاريخ الاستلام:</span>
                    <span>{new Date().toLocaleDateString('ar-TN')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold">اسم المشارك:</span>
                    <span>{selectedEvent.participants.find(p => p.id === printReceipt.participantId)?.participantName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold">المبلغ المستلم:</span>
                    <span className="font-bold text-lg">{round2(selectedEvent.participants.find(p => p.id === printReceipt.participantId)?.amountPaid || 0)} د.ت</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold">طريقة الدفع:</span>
                    <span>{selectedEvent.participants.find(p => p.id === printReceipt.participantId)?.paymentMethod}</span>
                  </div>
                </div>
                <div className="mt-12 flex justify-between items-end">
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-8">توقيع الإدارة</div>
                    <div className="w-32 border-b border-gray-300 h-8"></div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-8">توقيع المستلم</div>
                    <div className="w-32 border-b border-gray-300 h-8"></div>
                  </div>
                </div>
              </div>
            </PrintOverlay>
          )}

          {printAttendance.open && selectedEvent && (
            <PrintOverlay onClose={() => setPrintAttendance({ open: false, eventId: null })}>
              <div className="bg-white p-8 w-[210mm] mx-auto text-right font-sans">
                <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
                  <div>
                    <h1 className="text-2xl font-bold">كشف حضور ومغادرة</h1>
                    <p className="text-sm">الفعالية: {selectedEvent.name} | التاريخ: {selectedEvent.date}</p>
                  </div>
                  <div className="text-left text-sm">
                    <div>الوجهة: {selectedEvent.location}</div>
                    <div>السنة الدراسية: {selectedEvent.schoolYear || getCurrentAcademicYear()}</div>
                  </div>
                </div>
                <table className="w-full text-right text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border border-black">
                      <th className="border border-black px-4 py-2 w-12">#</th>
                      <th className="border border-black px-4 py-2">اسم المشارك</th>
                      <th className="border border-black px-4 py-2 w-24 text-center">النوع</th>
                      <th className="border border-black px-4 py-2 w-20 text-center">ذهاب</th>
                      <th className="border border-black px-4 py-2 w-20 text-center">إياب</th>
                      <th className="border border-black px-4 py-2">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEvent.participants.map((p, i) => (
                      <tr key={p.id} className="border border-black">
                        <td className="border border-black px-4 py-2 text-center">{i + 1}</td>
                        <td className="border border-black px-4 py-2">{p.participantName}</td>
                        <td className="border border-black px-4 py-2 text-center">{PARTICIPANT_TYPES.find(t => t.type === p.participantType)?.label}</td>
                        <td className="border border-black px-4 py-2"></td>
                        <td className="border border-black px-4 py-2"></td>
                        <td className="border border-black px-4 py-2"></td>
                      </tr>
                    ))}
                    {Array.from({ length: Math.max(0, 20 - selectedEvent.participants.length) }).map((_, i) => (
                      <tr key={`filler-${i}`} className="border border-black">
                        <td className="border border-black px-4 py-2 text-center"></td>
                        <td className="border border-black px-4 py-2"></td>
                        <td className="border border-black px-4 py-2"></td>
                        <td className="border border-black px-4 py-2"></td>
                        <td className="border border-black px-4 py-2"></td>
                        <td className="border border-black px-4 py-2"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-12 grid grid-cols-3 gap-8">
                  <div className="text-center">
                    <div className="text-sm font-bold mb-8">توقيع المرافق(ة)</div>
                    <div className="border-b border-black w-full h-8 mx-auto"></div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold mb-8">توقيع السائق</div>
                    <div className="border-b border-black w-full h-8 mx-auto"></div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold mb-8">ختم الإدارة</div>
                    <div className="border-b border-black w-full h-8 mx-auto"></div>
                  </div>
                </div>
              </div>
            </PrintOverlay>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
            <XCircle size={20} className="text-gray-400" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function PrintOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-800/90 overflow-auto">
      <div className="absolute top-6 left-6 flex gap-3">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-[#257C86] text-white rounded-lg hover:bg-[#1e626b] transition-all font-medium"
        >
          <Printer size={18} />
          <span>طباعة الآن</span>
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-all font-medium"
        >
          إغلاق
        </button>
      </div>
      <div className="print-area print-one">
        {children}
      </div>
    </div>
  );
}
