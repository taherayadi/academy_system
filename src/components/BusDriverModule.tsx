import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bus, 
  Search, 
  Printer, 
  MapPin, 
  Clock, 
  Phone, 
  UserCheck, 
  Calendar, 
  School, 
  Users, 
  CheckCircle2, 
  Building2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  X,
  PlusCircle,
  Pencil,
  Loader2
} from 'lucide-react';
import { 
  Student, 
  StaffMember, 
  CenterSettings, 
  TimesheetDay,
  TransportTripRecord,
  TransportTripInput,
  TransportTripPatch
} from '../types';
import { gradeLabelBilingual } from '../types';
import {
  fetchTransportTripsApi,
  createTransportTripApi,
  updateTransportTripApi,
  deleteTransportTripApi
} from '../api';
import { useToast } from './Toast';
import logo from '../assets/logo.png';

interface BusDriverModuleProps {
  students: Student[];
  staff: StaffMember[];
  settings?: CenterSettings;
  sidebarCollapsed?: boolean;
}

const DAY_NAMES_ORDER: TimesheetDay[] = ['الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const timeToMin = (t: string): number => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const weekdayForDay = (day: TimesheetDay): number => DAY_NAMES_ORDER.indexOf(day) + 1;

// ─── LocalStorage for per-day passenger absences ─────────────────────
const STORAGE_KEY = 'bus_driver_edits_v1';

interface DayTripEdit {
  removed?: Record<string, string>;
}

type BusEditsStorage = Record<string, Record<string, DayTripEdit>>;

function loadBusEdits(): BusEditsStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveBusEdits(edits: BusEditsStorage): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(edits)); } catch {}
}

// ─── Interfaces ──────────────────────────────────────────────────────

export interface TransportPassenger {
  student: Student;
  etablissement: string;
  tripType: 'to_school' | 'to_center';
  departureTime: string;
  targetTime: string;
  gradeLevel: string;
}

export interface EtablissementGroup {
  etablissement: string;
  count: number;
  passengers: TransportPassenger[];
}

export interface TransportTrip {
  id: string;
  staffId: string | null;
  departureTime: string;
  tripType: 'to_school' | 'to_center';
  title: string;
  description: string;
  passengers: TransportPassenger[];
  etablissements: string[];
  etabGroups: EtablissementGroup[];
}

// ─── Component ───────────────────────────────────────────────────────

export default function BusDriverModule({
  students,
  staff,
  settings,
}: BusDriverModuleProps) {
  const centerName = settings?.centerName || 'EduSphère';
  const { showToast } = useToast();
  const [selectedDay, setSelectedDay] = useState<TimesheetDay>(() => {
    const jsDay = new Date().getDay();
    if (jsDay >= 1 && jsDay <= 6) return DAY_NAMES_ORDER[jsDay - 1];
    return 'الأثنين';
  });

  const [activeView, setActiveView] = useState<'trips' | 'etablissements'>('trips');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEtabFilter, setSelectedEtabFilter] = useState('all');
  const [tripTypeFilter, setTripTypeFilter] = useState<'all' | 'to_school' | 'to_center'>('all');

  const busDriver = useMemo(() => staff.find(s => s.role === 'chauffeur_bus') || null, [staff]);

  // Le module Transport ne concerne que les élèves inscrits au service
  // transport (student_service_enrollments.service_key = 'transport').
  const transportStudents = useMemo(
    () => students.filter(st => st.enrolledServices?.transport === true),
    [students]
  );

  const [boardedStatus, setBoardedStatus] = useState<Record<string, boolean>>({});
  const toggleBoarded = (key: string) => setBoardedStatus(prev => ({ ...prev, [key]: !prev[key] }));

  // ─── Itinéraires persistés (créés manuellement, jamais déduits des
  //     emplois du temps) ─────────────────────────────────────────────
  const [tripRecords, setTripRecords] = useState<TransportTripRecord[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsLoadError, setTripsLoadError] = useState('');
  const [tripSaving, setTripSaving] = useState(false);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);

  const loadTrips = async (showSpinner = true) => {
    if (showSpinner) setTripsLoading(true);
    setTripsLoadError('');
    try {
      setTripRecords(await fetchTransportTripsApi());
    } catch (err: any) {
      setTripsLoadError(err?.message || 'تعذر تحميل رحلات النقل.');
    } finally {
      if (showSpinner) setTripsLoading(false);
    }
  };

  useEffect(() => { void loadTrips(); }, []);

  // ─── Editable program state (absences journalières uniquement) ────
  const [busEdits, setBusEdits] = useState<BusEditsStorage>(loadBusEdits);
  const [editingRemoval, setEditingRemoval] = useState<{ tripId: string; studentId: string } | null>(null);
  const [removeRemark, setRemoveRemark] = useState('');

  useEffect(() => { saveBusEdits(busEdits); }, [busEdits]);

  // Form state (création + édition d'un trajet)
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualFormType, setManualFormType] = useState<'to_school' | 'to_center'>('to_school');
  const [manualFormTime, setManualFormTime] = useState('07:30');
  const [manualFormStaffId, setManualFormStaffId] = useState('');
  const [manualFormStudentIds, setManualFormStudentIds] = useState<Set<string>>(new Set());
  const [manualStudentSearch, setManualStudentSearch] = useState('');

  const openManualForm = () => {
    setEditingTripId(null);
    setManualFormType('to_school');
    setManualFormTime('07:30');
    setManualFormStaffId(busDriver?.id || '');
    setManualFormStudentIds(new Set());
    setManualStudentSearch('');
    setShowManualForm(true);
  };

  const openEditTrip = (trip: TransportTrip) => {
    setEditingTripId(trip.id);
    setManualFormType(trip.tripType);
    setManualFormTime(trip.departureTime);
    setManualFormStaffId(trip.staffId || busDriver?.id || '');
    setManualFormStudentIds(new Set(trip.passengers.map(p => p.student.id)));
    setManualStudentSearch('');
    setShowManualForm(true);
  };

  const closeManualForm = () => {
    setShowManualForm(false);
    setEditingTripId(null);
  };

  const toggleManualStudent = (id: string) =>
    setManualFormStudentIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submitManualTrip = async () => {
    const studentIds = Array.from(manualFormStudentIds);
    if (studentIds.length === 0 || !manualFormTime || !manualFormStaffId || tripSaving) return;

    setTripSaving(true);
    try {
      if (editingTripId) {
        const patch: TransportTripPatch = {
          id: editingTripId,
          staffId: manualFormStaffId,
          departureTime: manualFormTime,
          tripType: manualFormType,
          studentIds
        };
        await updateTransportTripApi(patch);
        showToast('تم تحديث الرحلة بنجاح.', 'success');
      } else {
        const input: TransportTripInput = {
          staffId: manualFormStaffId,
          weekday: weekdayForDay(selectedDay),
          departureTime: manualFormTime,
          tripType: manualFormType,
          studentIds
        };
        await createTransportTripApi(input);
        showToast('تمت إضافة الرحلة بنجاح.', 'success');
      }
      await loadTrips(false);
      closeManualForm();
    } catch (err: any) {
      showToast(err?.message || 'تعذر حفظ الرحلة.', 'error');
    } finally {
      setTripSaving(false);
    }
  };

  const persistTripPatch = async (tripId: string, patch: Omit<TransportTripPatch, 'id'>) => {
    const previous = tripRecords.find(trip => trip.id === tripId);
    setTripRecords(prev => prev.map(trip => trip.id === tripId ? { ...trip, ...patch } : trip));
    try {
      await updateTransportTripApi({ id: tripId, ...patch });
    } catch (err: any) {
      if (previous) {
        setTripRecords(prev => prev.map(trip => trip.id === tripId ? previous : trip));
      }
      showToast(err?.message || 'تعذر تحديث الرحلة.', 'error');
    }
  };

  const deleteTrip = async (tripId: string) => {
    if (!window.confirm('هل تريد حذف هذه الرحلة نهائياً؟')) return;
    try {
      await deleteTransportTripApi(tripId);
      setTripRecords(prev => prev.filter(trip => trip.id !== tripId));
      setBusEdits(prev => {
        const next: BusEditsStorage = {};
        for (const [day, edits] of Object.entries(prev)) {
          const copy = { ...edits };
          delete copy[tripId];
          next[day] = copy;
        }
        return next;
      });
      showToast('تم حذف الرحلة.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'تعذر حذف الرحلة.', 'error');
    }
  };

  const confirmRemovePassenger = () => {
    if (!editingRemoval) return;
    const remark = removeRemark.trim() || 'غياب بترخيص من الولي';
    setBusEdits(prev => ({
      ...prev,
      [selectedDay]: {
        ...prev[selectedDay],
        [editingRemoval.tripId]: {
          ...prev[selectedDay]?.[editingRemoval.tripId],
          removed: {
            ...(prev[selectedDay]?.[editingRemoval.tripId]?.removed || {}),
            [editingRemoval.studentId]: remark
          }
        }
      }
    }));
    setEditingRemoval(null);
    setRemoveRemark('');
  };

  const restorePassenger = (tripId: string, studentId: string) => {
    setBusEdits(prev => {
      const dayEdits = { ...(prev[selectedDay] || {}) };
      const tripEdit = { ...(dayEdits[tripId] || {}) };
      const removed = { ...(tripEdit.removed || {}) };
      delete removed[studentId];
      tripEdit.removed = Object.keys(removed).length > 0 ? removed : undefined;
      dayEdits[tripId] = tripEdit;
      return { ...prev, [selectedDay]: dayEdits };
    });
  };

  const clearDayEdits = () => {
    setBusEdits(prev => { const next = { ...prev }; delete next[selectedDay]; return next; });
  };

  // ─── Day edit summary ────────────────────────────────────────────
  const dayEdits = busEdits[selectedDay] || {};
  const dayRemovedPassengers = (Object.entries(dayEdits) as [string, DayTripEdit][]).flatMap(([tripId, te]) => {
    if (!te.removed) return [];
    return Object.entries(te.removed).map(([studentId, remark]) => {
      const student = students.find(s => s.id === studentId);
      return { tripId, studentId, studentName: student ? `${student.lastName} ${student.firstName}` : studentId, remark };
    });
  });
  const dayRemovedCount = dayRemovedPassengers.length;

  // ─── Trajets du jour sélectionné (uniquement ceux enregistrés par le
  //     centre ; aucun calcul automatique depuis les emplois du temps) ──
  const selectedWeekday = weekdayForDay(selectedDay);

  const dayRecords = useMemo(
    () => tripRecords
      .filter(record => record.weekday === selectedWeekday)
      .sort((a, b) => timeToMin(a.departureTime) - timeToMin(b.departureTime)),
    [tripRecords, selectedWeekday]
  );

  const { trips, passengersByEtab, allDayPassengers, allEtablissements } = useMemo(() => {
    const dayBusEdits = busEdits[selectedDay] || {};

    const tripsList: TransportTrip[] = dayRecords.map(record => {
      const passengers = record.studentIds
        .map(studentId => {
          const st = transportStudents.find(student => student.id === studentId);
          if (!st) return null;
          const etab = st.etablissement?.trim() || 'المؤسسة غير محددة';
          const passenger: TransportPassenger = {
            student: st,
            etablissement: etab,
            tripType: record.tripType,
            departureTime: record.departureTime,
            targetTime: record.departureTime,
            gradeLevel: st.grade
          };
          return passenger;
        })
        .filter(Boolean) as TransportPassenger[];

      passengers.sort((a, b) => {
        const byEtab = a.etablissement.localeCompare(b.etablissement, 'ar');
        if (byEtab !== 0) return byEtab;
        return a.student.lastName.localeCompare(b.student.lastName, 'ar');
      });

      const etabMap = new Map<string, TransportPassenger[]>();
      passengers.forEach(p => {
        const list = etabMap.get(p.etablissement) || [];
        list.push(p);
        etabMap.set(p.etablissement, list);
      });

      const etabGroups: EtablissementGroup[] = [];
      etabMap.forEach((pList, etabName) => {
        etabGroups.push({ etablissement: etabName, count: pList.length, passengers: pList });
      });

      return {
        id: record.id,
        staffId: record.staffId,
        departureTime: record.departureTime,
        tripType: record.tripType,
        title: record.tripType === 'to_school'
          ? `رحلة الذهاب: من ${centerName} إلى المؤسسات التعليمية`
          : `رحلة العودة: من المؤسسات التعليمية إلى ${centerName}`,
        description: record.notes,
        passengers,
        etablissements: Array.from(etabMap.keys()),
        etabGroups
      };
    });

    tripsList.sort((a, b) => timeToMin(a.departureTime) - timeToMin(b.departureTime));

    const processedTrips: TransportTrip[] = [];
    for (const trip of tripsList) {
      const edit = dayBusEdits[trip.id];
      const removedIds = new Set(edit?.removed ? Object.keys(edit.removed) : []);
      if (removedIds.size === 0) { processedTrips.push(trip); continue; }
      const kept = trip.passengers.filter(p => !removedIds.has(p.student.id));
      if (kept.length === 0) continue;
      const etabMap = new Map<string, TransportPassenger[]>();
      kept.forEach(p => { const l = etabMap.get(p.etablissement) || []; l.push(p); etabMap.set(p.etablissement, l); });
      const etabGroups: EtablissementGroup[] = [];
      etabMap.forEach((pList, etabName) => {
        etabGroups.push({ etablissement: etabName, count: pList.length, passengers: pList });
      });
      processedTrips.push({ ...trip, passengers: kept, etablissements: Array.from(etabMap.keys()), etabGroups });
    }

    const byEtab: Record<string, TransportPassenger[]> = {};
    const etabsSet = new Set<string>();
    processedTrips.forEach(trip => trip.passengers.forEach(p => {
      etabsSet.add(p.etablissement);
      if (!byEtab[p.etablissement]) byEtab[p.etablissement] = [];
      byEtab[p.etablissement].push(p);
    }));

    return {
      trips: processedTrips,
      passengersByEtab: byEtab,
      allDayPassengers: processedTrips.flatMap(t => t.passengers),
      allEtablissements: Array.from(etabsSet).sort()
    };
  }, [dayRecords, transportStudents, busEdits, selectedDay, centerName]);


  const filteredTrips = useMemo(() => {
    return trips.filter(trip => {
      if (tripTypeFilter !== 'all' && trip.tripType !== tripTypeFilter) return false;
      if (selectedEtabFilter !== 'all' && !trip.etablissements.includes(selectedEtabFilter)) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matches = trip.passengers.some(p =>
          `${p.student.firstName} ${p.student.lastName}`.toLowerCase().includes(query) ||
          p.etablissement.toLowerCase().includes(query) ||
          p.gradeLevel.toLowerCase().includes(query) ||
          (p.student.father?.phoneMobile || '').includes(query) ||
          (p.student.mother?.phoneMobile || '').includes(query)
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [trips, tripTypeFilter, selectedEtabFilter, searchTerm]);

  // ─── Print trips (excludes removed passengers) ───────────────────
  const printTrips = useMemo(() => {
    const dayBusEdits = busEdits[selectedDay] || {};
    return trips.map(trip => {
      const edit = dayBusEdits[trip.id];
      const removedIds = new Set(edit?.removed ? Object.keys(edit.removed) : []);
      if (removedIds.size === 0) return trip;
      const kept = trip.passengers.filter(p => !removedIds.has(p.student.id));
      const etabMap = new Map<string, TransportPassenger[]>();
      kept.forEach(p => { const l = etabMap.get(p.etablissement) || []; l.push(p); etabMap.set(p.etablissement, l); });
      const etabGroups: EtablissementGroup[] = [];
      etabMap.forEach((pList, etabName) => {
        etabGroups.push({ etablissement: etabName, count: pList.length, passengers: pList });
      });
      return { ...trip, passengers: kept, etablissements: Array.from(etabMap.keys()), etabGroups };
    }).filter(trip => trip.passengers.length > 0);
  }, [trips, busEdits, selectedDay]);

  const handlePrintRoute = () => window.print();

  const todayArabicFormatted = new Intl.DateTimeFormat('ar-TN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(new Date());

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* TOP HEADER & DRIVER SUMMARY CARD */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-md">
            <Bus className="h-7 w-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-800">مخطط حافلة النقل المدرسي</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-brand-600/[0.05] text-brand-700 text-xs font-bold">
                Transport Scolaire
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              إنشاء وإدارة رحلات الذهاب والإياب يدوياً لنقل التلاميذ بين {centerName} والمؤسسات التربوية
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {busDriver ? (
            <div className="flex items-center gap-2.5 px-4 py-2 bg-brand-600/[0.06] border border-brand-600/20 rounded-2xl">
              <div className="w-8 h-8 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-sm">🚌</div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-bold">سائق الحافلة المعين:</span>
                  <span className="text-xs font-black text-slate-800">{busDriver.firstName} {busDriver.lastName}</span>
                </div>
                {busDriver.phone && (
                  <a href={`tel:${busDriver.phone}`} className="text-xs font-mono font-black text-brand-600 hover:underline flex items-center gap-1 mt-0.5" dir="ltr">
                    <Phone className="h-3 w-3" />
                    <span>{busDriver.phone}</span>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 font-bold">
              <span>⚠️ لم يتم تسجيل سائق حافلة في قائمة الإطار بعد.</span>
            </div>
          )}


          <button
            onClick={handlePrintRoute}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-slate-900/5 transition cursor-pointer shrink-0"
          >
            <Printer className="h-4 w-4" />
            <span>طباعة ورقة المسار (Feuille de Route)</span>
          </button>
        </div>
      </div>

      {/* DAY SELECTOR TABS */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/70 shadow-lg shadow-slate-900/5 flex items-center justify-between gap-2 overflow-x-auto no-print">
        <div className="flex items-center gap-1">
          {DAY_NAMES_ORDER.map(day => {
            const isSelected = selectedDay === day;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer shrink-0 ${
                  isSelected ? 'bg-brand-600 text-white shadow-lg shadow-slate-900/5' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="text-left px-3 text-xs font-bold text-slate-400 shrink-0 hidden md:block">
          {todayArabicFormatted}
        </div>
      </div>

      {/* FILTER & VIEW SELECTOR BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/70 flex flex-col md:flex-row gap-3 items-center justify-between no-print">
        <div className="relative w-full md:w-72">
          <Search className="absolute right-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم التلميذ أو المؤسسة..."
            className="w-full pr-10 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select value={tripTypeFilter} onChange={(e) => setTripTypeFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer">
            <option value="all">كل الاتجاهات (ذهاب وعودة)</option>
            <option value="to_school">الذهاب فقط (من {centerName} إلى المؤسسة)</option>
            <option value="to_center">العودة فقط (من المؤسسة إلى {centerName})</option>
          </select>

          <select value={selectedEtabFilter} onChange={(e) => setSelectedEtabFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer">
            <option value="all">كل المؤسسات التعليمية</option>
            {allEtablissements.map(etab => (
              <option key={etab} value={etab}>{etab}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
            <button onClick={() => setActiveView('trips')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${activeView === 'trips' ? 'bg-white text-brand-600 shadow-lg shadow-slate-900/5' : 'text-slate-600 hover:text-slate-900'}`}>
              الرحلات المجمعة
            </button>
            <button onClick={() => setActiveView('etablissements')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${activeView === 'etablissements' ? 'bg-white text-brand-600 shadow-lg shadow-slate-900/5' : 'text-slate-600 hover:text-slate-900'}`}>
              حسب المؤسسة
            </button>
          </div>

          <button
            onClick={openManualForm}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-brand-600/25 transition cursor-pointer shrink-0"
          >
            <PlusCircle className="h-4 w-4 text-brand-600" />
            <span>إضافة رحلة يدوية</span>
          </button>
        </div>
      </div>

      {/* MODIFICATIONS STRIP (removals for today) */}
      {dayRemovedCount > 0 && activeView === 'trips' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 no-print">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-black text-amber-800">تعديلات اليوم — {dayRemovedCount} تلميذ محذوف{dayRemovedCount > 1 ? 'و' : ''}</span>
            </div>
            <button onClick={clearDayEdits}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs rounded-xl cursor-pointer transition">
              <RotateCcw className="h-3.5 w-3.5" />
              استعادة الكل
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {dayRemovedPassengers.map(({ tripId, studentId, studentName, remark }) => (
              <div key={`${tripId}-${studentId}`} className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-xl px-3 py-1.5 text-[11px]">
                <span className="font-black text-amber-800">{studentName}</span>
                <span className="text-amber-600">— {remark}</span>
                <button onClick={() => restorePassenger(tripId, studentId)}
                  className="text-brand-600 hover:text-brand-700 font-bold cursor-pointer px-1 underline">إعادة</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MAIN CONTENT (INTERACTIVE UI) */}
      <div className="no-print space-y-4">
        {activeView === 'trips' && (
          <div className="space-y-4">
            {tripsLoadError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-red-700">{tripsLoadError}</span>
                <button
                  type="button"
                  onClick={() => { void loadTrips(); }}
                  className="px-3 py-1.5 bg-white border border-red-200 text-red-700 font-bold text-xs rounded-xl cursor-pointer hover:bg-red-100 transition"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}
            {tripsLoading ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400">
                <Loader2 className="h-10 w-10 mx-auto mb-3 text-brand-600 animate-spin" />
                <p className="text-xs font-bold">جارٍ تحميل رحلات النقل...</p>
              </div>
            ) : filteredTrips.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400">
                <Bus className="h-12 w-12 mx-auto mb-3 opacity-40 text-brand-600" />
                <h3 className="text-base font-black text-slate-700">لا توجد رحلات مبرمجة ليوم {selectedDay}</h3>
                <p className="text-xs text-slate-400 mt-1">أضف رحلة يدوية واختر التلاميذ والسائق. لا يتم إنشاء الرحلات تلقائياً.</p>
              </div>
            ) : (
              filteredTrips.map((trip, tripIndex) => {
                const isToSchool = trip.tripType === 'to_school';
                const tripDriver = staff.find(member => member.id === trip.staffId) || null;
                return (
                  <motion.div
                    key={trip.id}



                    className="bg-white rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 overflow-hidden"
                  >
                    {/* Trip Card Header */}
                    <div className={`p-4 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                      isToSchool ? 'bg-brand-600' : 'bg-brand-700'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-xl font-bold">
                          {isToSchool ? '🏫' : '🏠'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] font-black rounded-md">
                              رحلة #{tripIndex + 1}
                            </span>
                            <span className="text-xs font-bold text-white/80">
                              {isToSchool ? `الانطلاق من ${centerName} ← إلى المؤسسات` : `الإحضار من المؤسسات ← إلى ${centerName}`}
                            </span>
                          </div>
                          <h3 className="text-base font-black mt-0.5 flex items-center gap-2">
                            <span>توقيت الانطلاق:</span>
                            <input
                              type="time"
                              value={trip.departureTime}
                              onChange={(e) => { void persistTripPatch(trip.id, { departureTime: e.target.value }); }}
                              className="font-mono bg-white/20 px-2 py-1 rounded-lg text-sm w-24 text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40 border-none"
                              dir="ltr"
                            />
                          </h3>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="bg-white/15 px-3 py-1 rounded-xl">
                          {trip.passengers.length} تلميذ
                        </span>
                        <span className="bg-white/15 px-3 py-1 rounded-xl">
                          {trip.etablissements.length} {trip.etablissements.length === 1 ? 'مؤسسة' : 'مؤسسات'}
                        </span>
                        <span className="bg-white/15 px-3 py-1 rounded-xl flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5" />
                          {tripDriver ? `${tripDriver.firstName} ${tripDriver.lastName}` : 'بدون سائق'}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditTrip(trip)}
                          className="bg-white/15 hover:bg-white/25 p-1.5 rounded-lg cursor-pointer transition"
                          title="تعديل الرحلة والتلاميذ"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { void deleteTrip(trip.id); }}
                          className="bg-white/15 hover:bg-red-500/70 p-1.5 rounded-lg cursor-pointer transition"
                          title="حذف الرحلة"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Establishment Badges Bar */}
                    <div className="bg-brand-50 px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-500 text-[11px]">محطات المسار المبرمجة:</span>
                      {trip.etabGroups.map((grp) => (
                        <span key={grp.etablissement} className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 ${
                          grp.count >= 2
                            ? 'bg-brand-600/10 text-brand-700 border border-brand-600/20'
                            : 'bg-white text-slate-700 border border-slate-200'
                        }`}>
                          <School className="h-3.5 w-3.5 text-brand-600" />
                          <span>{grp.etablissement}</span>
                          <span className="px-1.5 py-0.2 bg-brand-600 text-white text-[10px] rounded-full">{grp.count}</span>
                          {grp.count >= 2 && (
                            <span className="text-[10px] text-brand-600 font-black mr-0.5">(مجموعة)</span>
                          )}
                        </span>
                      ))}
                    </div>

                    {/* Passengers Grouped Table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-[640px] w-full text-xs text-right">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold">
                            <th className="p-3 w-12 text-center">#</th>
                            <th className="p-3">اسم ولقب التلميذ</th>
                            <th className="p-3">المستوى</th>
                            <th className="p-3">المؤسسة التعليمية</th>
                            <th className="p-3">هاتف الولي</th>
                            <th className="p-3 text-center">حالة الصعود</th>
                            <th className="p-3 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {trip.etabGroups.map((grp) => (
                            <React.Fragment key={grp.etablissement}>
                              <tr className="bg-brand-50 border-y border-brand-600/20">
                                <td colSpan={7} className="py-2 px-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 font-black text-brand-700 text-xs">
                                      <School className="h-4 w-4 text-brand-600" />
                                      <span>{grp.etablissement}</span>
                                      {grp.count >= 2 && (
                                        <span className="bg-brand-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                                          نقل جماعي مشترك ({grp.count} تلاميذ)
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-500">
                                      {grp.count} {grp.count === 1 ? 'تلميذ' : 'تلاميذ'}
                                    </span>
                                  </div>
                                </td>
                              </tr>

                              {grp.passengers.map((p, pIdx) => {
                                const checkKey = `${p.student.id}_${trip.id}`;
                                const isBoarded = boardedStatus[checkKey];
                                const phone = p.student.father?.phoneMobile || p.student.mother?.phoneMobile || '—';
                                const isRemoving = editingRemoval?.tripId === trip.id && editingRemoval?.studentId === p.student.id;

                                return (
                                  <React.Fragment key={p.student.id}>
                                    <tr className={`transition ${isBoarded ? 'bg-brand-600/[0.06]' : isRemoving ? 'bg-amber-50/60' : 'hover:bg-slate-50/50'}`}>
                                      <td className="p-3 text-center font-mono text-slate-400">{pIdx + 1}</td>
                                      <td className="p-3">
                                        <span className="font-black text-slate-900 text-xs block">
                                          {p.student.lastName} {p.student.firstName}
                                        </span>
                                      </td>
                                      <td className="p-3">
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold text-[11px]">
                                          {gradeLabelBilingual(p.gradeLevel)}
                                        </span>
                                      </td>
                                      <td className="p-3">
                                        <span className="text-brand-600 font-black flex items-center gap-1">
                                          <School className="h-3.5 w-3.5" />
                                          {p.etablissement}
                                        </span>
                                      </td>
                                      <td className="p-3 font-mono font-bold text-slate-700" dir="ltr">{phone}</td>
                                      <td className="p-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => toggleBoarded(checkKey)}
                                          className={`px-3 py-1 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 mx-auto ${
                                            isBoarded
                                              ? 'bg-brand-600 text-white shadow-lg shadow-slate-900/5'
                                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                          }`}
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          <span>{isBoarded ? 'تم الصعود ✓' : 'في الانتظار'}</span>
                                        </button>
                                      </td>
                                      <td className="p-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => setEditingRemoval({ tripId: trip.id, studentId: p.student.id })}
                                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                          title="تسجيل غياب التلميذ لهذا اليوم"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </td>
                                    </tr>

                                    {isRemoving && (
                                      <tr className="bg-amber-50 border-y border-amber-200">
                                        <td colSpan={7} className="p-3">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                            <span className="text-xs font-bold text-amber-800 shrink-0">سبب الغياب:</span>
                                            <input
                                              type="text"
                                              value={removeRemark}
                                              onChange={(e) => setRemoveRemark(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') { e.preventDefault(); confirmRemovePassenger(); }
                                                if (e.key === 'Escape') { setEditingRemoval(null); setRemoveRemark(''); }
                                              }}
                                              placeholder="مثال: إبلاغ من الولي بالغياب..."
                                              className="flex-1 min-w-[200px] px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-400"
                                              autoFocus
                                            />
                                            <button onClick={confirmRemovePassenger}
                                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl cursor-pointer transition shrink-0">
                                              تأكيد الحذف
                                            </button>
                                            <button onClick={() => { setEditingRemoval(null); setRemoveRemark(''); }}
                                              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition shrink-0">
                                              إلغاء
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}

        {activeView === 'etablissements' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allEtablissements.map(etab => {
              const etabPassengers = passengersByEtab[etab] || [];
              const distinctStudents = Array.from(new Set(etabPassengers.map(p => p.student.id)))
                .map(id => students.find(s => s.id === id))
                .filter(Boolean) as Student[];

              return (
                <div key={etab} className="bg-white rounded-3xl border border-slate-200/70 p-5 shadow-lg shadow-slate-900/5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-brand-600/10 flex items-center justify-center text-xl">🏫</div>
                      <div>
                        <h4 className="font-black text-slate-900 text-sm">{etab}</h4>
                        <span className="text-[11px] text-slate-400 font-bold block">{distinctStudents.length} تلاميذ مسجلين</span>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-brand-600/10 text-brand-600 rounded-xl text-xs font-black">
                      {etabPassengers.length} تنقلات
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {distinctStudents.map(st => (
                      <div key={st.id} className="py-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-black text-slate-800 block">{st.lastName} {st.firstName}</span>
                          <span className="text-[10px] text-slate-400 font-bold">{gradeLabelBilingual(st.grade)}</span>
                        </div>
                        <span className="font-mono text-slate-600 text-[11px]" dir="ltr">
                          {st.father?.phoneMobile || st.mother?.phoneMobile || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MANUAL TRIP MODAL */}
      <AnimatePresence>
        {showManualForm && (
          <motion.div
            key="manual-trip-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print"
            onClick={(e) => { if (e.target === e.currentTarget) closeManualForm(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden"
              style={{ maxHeight: '90vh' }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-brand-600/[0.05] text-brand-600 flex items-center justify-center">
                    {editingTripId ? <Pencil className="h-5 w-5 text-brand-600" /> : <PlusCircle className="h-5 w-5 text-brand-600" />}
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">
                      {editingTripId ? 'تعديل الرحلة' : 'إضافة رحلة يدوية'}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-bold">ليوم: {selectedDay}</p>
                  </div>
                </div>
                <button onClick={closeManualForm}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">

                {/* Direction */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">اتجاه الرحلة</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setManualFormType('to_school')}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer border ${
                        manualFormType === 'to_school'
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-brand-600/50'
                      }`}
                    >
                      🏫 ذهاب — من {centerName} إلى المؤسسة
                    </button>
                    <button
                      onClick={() => setManualFormType('to_center')}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer border ${
                        manualFormType === 'to_center'
                          ? 'bg-brand-700 text-white border-brand-700'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-brand-700/50'
                      }`}
                    >
                      🏠 عودة — من المؤسسة إلى {centerName}
                    </button>
                  </div>
                </div>

                {/* Departure time */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">توقيت الانطلاق</label>
                  <input
                    type="time"
                    value={manualFormTime}
                    onChange={(e) => setManualFormTime(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
                    dir="ltr"
                  />
                </div>

                {/* Driver (staff_id) */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">
                    السائق / الإطار المسؤول
                  </label>
                  {staff.length === 0 ? (
                    <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
                      لا يوجد إطار مسجل. أضف السائق في قائمة الإطار أولاً.
                    </div>
                  ) : (
                    <select
                      value={manualFormStaffId}
                      onChange={(e) => setManualFormStaffId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-600/40 cursor-pointer"
                    >
                      <option value="">اختر السائق...</option>
                      {staff.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.lastName} {member.firstName}
                          {member.role === 'chauffeur_bus' ? ' — سائق حافلة' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Student selector */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">
                    اختر التلاميذ
                    {manualFormStudentIds.size > 0 && (
                      <span className="mr-2 px-2 py-0.5 bg-brand-600/[0.05] text-brand-700 border border-brand-600/20 rounded-full text-[10px] font-black">
                        {manualFormStudentIds.size} محدد
                      </span>
                    )}
                  </label>
                  <div className="relative mb-2">
                    <Search className="absolute right-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={manualStudentSearch}
                      onChange={(e) => setManualStudentSearch(e.target.value)}
                      placeholder="بحث باسم التلميذ أو المؤسسة..."
                      className="w-full pr-8 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-brand-600"
                    />
                  </div>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {transportStudents
                      .filter(st => {
                        if (!manualStudentSearch.trim()) return true;
                        const q = manualStudentSearch.toLowerCase();
                        return (
                          `${st.firstName} ${st.lastName}`.toLowerCase().includes(q) ||
                          (st.etablissement || '').toLowerCase().includes(q) ||
                          (st.grade || '').toLowerCase().includes(q)
                        );
                      })
                      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'ar'))
                      .map(st => {
                        const checked = manualFormStudentIds.has(st.id);
                        return (
                          <label
                            key={st.id}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition text-xs ${
                              checked ? 'bg-brand-600/[0.06] border-r-4 border-r-brand-600' : 'hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleManualStudent(st.id)}
                              className="w-4 h-4 accent-brand-600 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="font-black text-slate-900 block truncate">
                                {st.lastName} {st.firstName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold block truncate">
                                {gradeLabelBilingual(st.grade)} — {st.etablissement || 'مؤسسة غير محددة'}
                              </span>
                            </div>
                            {checked && <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0" />}
                          </label>
                        );
                      })
                    }
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  onClick={closeManualForm}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  onClick={() => { void submitManualTrip(); }}
                  disabled={manualFormStudentIds.size === 0 || !manualFormTime || !manualFormStaffId || tripSaving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl transition cursor-pointer shadow-md shadow-brand-600/25"
                >
                  {tripSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editingTripId ? (
                    <Pencil className="h-4 w-4" />
                  ) : (
                    <PlusCircle className="h-4 w-4" />
                  )}
                  {editingTripId ? 'حفظ التعديلات' : `إضافة ${manualFormStudentIds.size > 0 ? `(${manualFormStudentIds.size} تلميذ)` : ''}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PRINTABLE ROUTE SHEET (FEUILLE DE ROUTE A4) */}
      <div className="print-area bg-white text-slate-900 text-xs font-sans hidden print:block">
        
        {/* Printable Header — shown once on screen, repeats via CSS on every page */}
        <div className="bus-print-header border-b-2 border-slate-900 pb-3 mb-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="w-12 h-12 object-contain" />
            <div>
              <h1 className="text-lg font-black text-slate-900">{centerName}</h1>
              <p className="text-xs font-bold text-slate-600">ورقة مسار حافلة النقل المدرسي (Feuille de Route)</p>
            </div>
          </div>
          <div className="text-left text-xs font-bold">
            <div><span className="text-slate-500">اليوم: </span><span className="font-black">{selectedDay}</span></div>
          </div>
        </div>

        {/* Chauffeur info on top */}
        <div className="bg-slate-100 p-3 rounded-lg border border-slate-300 flex justify-between items-center text-xs mb-4">
          <div>
            <span className="font-bold text-slate-700">سائق الحافلة: </span>
            <span className="font-black text-slate-900 text-sm">
              {busDriver ? `${busDriver.firstName} ${busDriver.lastName}` : 'سائق معتمد'}
            </span>
          </div>
          {busDriver?.phone && (
            <div>
              <span className="font-bold text-slate-700">هاتف السائق: </span>
              <span className="font-mono font-black text-slate-900 text-sm" dir="ltr">{busDriver.phone}</span>
            </div>
          )}
          <div>
            <span className="font-bold text-slate-700">إجمالي الرحلات: </span>
            <span className="font-black text-slate-900">{printTrips.length} رحلات</span>
          </div>
        </div>

        {/* Trips List in Print */}
        <div className="space-y-6">
          {printTrips.map((trip, tripIndex) => {
            const isToSchool = trip.tripType === 'to_school';
            const tripDriver = staff.find(member => member.id === trip.staffId) || null;
            return (
              <div key={trip.id} className={`border border-slate-400 rounded-lg overflow-hidden break-inside-avoid${tripIndex > 0 ? ' bus-trip-block' : ''}`}>
                <div className="bg-slate-800 text-white p-2 flex justify-between items-center text-xs font-bold">
                  <div className="flex items-center gap-2">
                    <span className="bg-white/20 text-white px-2 py-0.5 rounded font-black text-[11px]">
                      رحلة #{tripIndex + 1}
                    </span>
                    <span>{isToSchool ? `← انطلاق إلى المؤسسات` : `← عودة إلى ${centerName}`}</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded font-mono font-black">
                      {trip.departureTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>السائق: {tripDriver ? `${tripDriver.firstName} ${tripDriver.lastName}` : 'غير محدد'}</span>
                    <span>•</span>
                    <span>({trip.passengers.length} تلاميذ)</span>
                    <span>•</span>
                    <span>({trip.etablissements.length} مؤسسات)</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300 font-black text-slate-800">
                          <th className="p-2 border-l border-slate-300 w-8 text-center">#</th>
                          <th className="p-2 border-l border-slate-300">اسم ولقب التلميذ</th>
                          <th className="p-2 border-l border-slate-300">المستوى</th>
                          <th className="p-2 border-l border-slate-300">المؤسسة التعليمية (الوجهة)</th>
                          <th className="p-2 border-l border-slate-300">هاتف الولي للطوارئ</th>
                          <th className="p-2 text-center w-24">صعود التلميذ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {trip.etabGroups.map((grp) => (
                          <React.Fragment key={grp.etablissement}>
                            <tr className="bg-slate-200/80 font-black text-slate-900 border-y border-slate-300">
                              <td colSpan={6} className="p-1.5 px-3">
                                <div className="flex justify-between items-center">
                                  <span>🏫 {grp.etablissement} {grp.count >= 2 ? `(${grp.count} تلاميذ - نقل مشترك)` : ''}</span>
                                  <span className="font-mono text-[11px]">{grp.count} تلاميذ</span>
                                </div>
                              </td>
                            </tr>
                            {grp.passengers.map((p, pIdx) => (
                              <tr key={p.student.id} className={pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                                <td className="p-2 border-l border-slate-300 text-center font-mono">{pIdx + 1}</td>
                                <td className="p-2 border-l border-slate-300 font-black text-slate-950">
                                  {p.student.lastName} {p.student.firstName}
                                </td>
                                <td className="p-2 border-l border-slate-300 font-bold text-slate-700">{gradeLabelBilingual(p.gradeLevel)}</td>
                                <td className="p-2 border-l border-slate-300 font-black text-slate-900">{p.etablissement}</td>
                                <td className="p-2 border-l border-slate-300 font-mono" dir="ltr">
                                  {p.student.father?.phoneMobile || p.student.mother?.phoneMobile || '—'}
                                </td>
                                <td className="p-2 text-center">
                                  <span className="inline-block w-5 h-5 border-2 border-slate-400 rounded"></span>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                </div>
              </div>
            );
          })}
        </div>

        {/* Print Absence Notes */}
        {dayRemovedCount > 0 && (
          <div className="border border-slate-400 rounded-lg p-3 break-inside-avoid">
            <p className="font-bold text-slate-800 mb-2">ملاحظات اليوم — غيابات مسجلة ({dayRemovedCount}):</p>
            <div className="overflow-x-auto">
                <table className="min-w-[320px] w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300">
                      <th className="p-1.5 text-right font-black">التلميذ</th>
                      <th className="p-1.5 text-right font-black">الملاحظة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dayRemovedPassengers.map(({ studentId, studentName, remark }) => (
                      <tr key={studentId}>
                        <td className="p-1.5 font-black text-slate-900">{studentName}</td>
                        <td className="p-1.5 text-slate-700">{remark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {/* Print Signatures Footer - at bottom of last page */}
        <div className="print-footer mt-12 pt-6 border-t-2 border-slate-800 grid grid-cols-2 gap-8 text-xs break-inside-avoid">
          <div>
            <p className="font-bold text-slate-700">ملاحظات سائق الحافلة:</p>
            <div className="h-16 border-b border-dotted border-slate-400 mt-2"></div>
          </div>
          <div className="text-left space-y-6">
            <div>
              <p className="font-black text-slate-900">إمضاء سائق الحافلة</p>
              <div className="h-14 border-b-2 border-dotted border-slate-600 mt-1"></div>
            </div>
            <div>
              <p className="font-black text-slate-900">ختم وإمضاء إدارة {centerName}</p>
              <div className="h-14 border-b-2 border-dotted border-slate-600 mt-1"></div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
