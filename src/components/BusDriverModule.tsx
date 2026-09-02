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
  X
} from 'lucide-react';
import { 
  Student, 
  StaffMember, 
  EtudeSlot,
  StudentTimeSheet, 
  CenterSettings, 
  TIMESHEET_DAYS, 
  TimesheetDay 
} from '../types';
import logo from '../assets/logo.png';

interface BusDriverModuleProps {
  students: Student[];
  staff: StaffMember[];
  slots: EtudeSlot[];
  studentTimeSheets: StudentTimeSheet[];
  settings?: CenterSettings;
  sidebarCollapsed?: boolean;
}

export const ARABIC_DAYS_MAP: Record<string, string> = {
  'Lundi': 'الأثنين',
  'Mardi': 'الثلاثاء',
  'Mercredi': 'الأربعاء',
  'Jeudi': 'الخميس',
  'Vendredi': 'الجمعة',
  'Samedi': 'السبت'
};

const DAY_NAMES_ORDER: TimesheetDay[] = ['الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const timeToMin = (t: string): number => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const computeDepartureTime = (schoolStartTime: string): string => {
  const mins = timeToMin(schoolStartTime) - 30;
  if (mins < 0) return '07:30';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const MERGE_GAP_MIN = 120;

function mergeDaySeances(
  slots: { startTime: string; endTime: string }[],
  gapMin = MERGE_GAP_MIN
): { startTime: string; endTime: string }[] {
  const sorted = slots
    .filter(s => s.startTime && s.endTime && timeToMin(s.startTime) < timeToMin(s.endTime))
    .sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));
  if (sorted.length === 0) return [];
  const blocks: { startTime: string; endTime: string }[] = [];
  for (const s of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && timeToMin(s.startTime) - timeToMin(last.endTime) <= gapMin) {
      if (timeToMin(s.endTime) > timeToMin(last.endTime)) {
        last.endTime = s.endTime;
      }
    } else {
      blocks.push({ startTime: s.startTime, endTime: s.endTime });
    }
  }
  return blocks;
}

// ─── LocalStorage for per-day bus edits ──────────────────────────────
const STORAGE_KEY = 'bus_driver_edits_v1';

interface DayTripEdit {
  departureTime?: string;
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
  timeSheet?: StudentTimeSheet;
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
  slots,
  studentTimeSheets,
  settings,
}: BusDriverModuleProps) {
  const centerName = settings?.centerName || 'المركز';
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

  const [boardedStatus, setBoardedStatus] = useState<Record<string, boolean>>({});
  const toggleBoarded = (key: string) => setBoardedStatus(prev => ({ ...prev, [key]: !prev[key] }));

  // ─── Editable program state ──────────────────────────────────────
  const [busEdits, setBusEdits] = useState<BusEditsStorage>(loadBusEdits);
  const [editingRemoval, setEditingRemoval] = useState<{ tripId: string; studentId: string } | null>(null);
  const [removeRemark, setRemoveRemark] = useState('');

  useEffect(() => { saveBusEdits(busEdits); }, [busEdits]);

  // ─── Edit helpers ────────────────────────────────────────────────
  const overrideDepartureTime = (tripId: string, newTime: string) => {
    setBusEdits(prev => ({
      ...prev,
      [selectedDay]: {
        ...prev[selectedDay],
        [tripId]: { ...prev[selectedDay]?.[tripId], departureTime: newTime || undefined }
      }
    }));
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

  // ─── Main trip computation (merged blocks + edit overrides) ──────
  const { trips, passengersByEtab, allDayPassengers, allEtablissements } = useMemo(() => {
    const passengers: TransportPassenger[] = [];
    const tsMap = new Map<string, StudentTimeSheet>();
    studentTimeSheets.forEach(ts => tsMap.set(ts.id, ts));

    students.forEach(st => {
      const etab = st.etablissement?.trim() || 'المؤسسة غير محددة';
      const stYear = st.academicYear;
      let timeSheet: StudentTimeSheet | undefined;
      if (st.timeSheetId && tsMap.has(st.timeSheetId)) {
        const candidate = tsMap.get(st.timeSheetId)!;
        if (!stYear || !candidate.schoolYear || candidate.schoolYear === stYear) {
          timeSheet = candidate;
        }
      }
      if (!timeSheet) {
        timeSheet = studentTimeSheets.find(ts =>
          ts.gradeLevel === st.grade &&
          (!stYear || !ts.schoolYear || ts.schoolYear === stYear)
        );
      }

      if (timeSheet && timeSheet.weeklySchedule) {
        const daySlots = timeSheet.weeklySchedule.filter(s => s.day === selectedDay);
        const blocks = mergeDaySeances(daySlots);
        blocks.forEach(block => {
          passengers.push({
            student: st, timeSheet, etablissement: etab,
            tripType: 'to_school', departureTime: computeDepartureTime(block.startTime),
            targetTime: block.startTime, gradeLevel: st.grade
          });
          passengers.push({
            student: st, timeSheet, etablissement: etab,
            tripType: 'to_center', departureTime: block.endTime,
            targetTime: block.endTime, gradeLevel: st.grade
          });
        });
      } else {
        const engDay = Object.keys(ARABIC_DAYS_MAP).find(k => ARABIC_DAYS_MAP[k] === selectedDay);
        const centerSlots = slots.filter(s => s.day === engDay && (s.enrolledStudentIds || []).includes(st.id));
        if (centerSlots.length > 0) {
          const blocks = mergeDaySeances(centerSlots);
          blocks.forEach(block => {
            passengers.push({
              student: st, etablissement: etab,
              tripType: 'to_center', departureTime: block.startTime,
              targetTime: block.startTime, gradeLevel: st.grade
            });
            passengers.push({
              student: st, etablissement: etab,
              tripType: 'to_school', departureTime: block.endTime,
              targetTime: block.endTime, gradeLevel: st.grade
            });
          });
        } else if (st.etablissement) {
          passengers.push({
            student: st, etablissement: etab,
            tripType: 'to_school', departureTime: '07:30', targetTime: '08:00', gradeLevel: st.grade
          });
          passengers.push({
            student: st, etablissement: etab,
            tripType: 'to_center', departureTime: '12:00', targetTime: '12:30', gradeLevel: st.grade
          });
        }
      }
    });

    // Group into trips
    const tripGroups = new Map<string, TransportPassenger[]>();
    passengers.forEach(p => {
      const key = `${p.departureTime}__${p.tripType}`;
      if (!tripGroups.has(key)) tripGroups.set(key, []);
      tripGroups.get(key)!.push(p);
    });

    const tripsList: TransportTrip[] = [];
    tripGroups.forEach((groupPassengers, key) => {
      const [depTime, typeStr] = key.split('__');
      const tripType = typeStr as 'to_school' | 'to_center';
      groupPassengers.sort((a, b) => {
        const c = a.etablissement.localeCompare(b.etablissement, 'ar');
        if (c !== 0) return c;
        return a.student.lastName.localeCompare(b.student.lastName, 'ar');
      });
      const etabMap = new Map<string, TransportPassenger[]>();
      groupPassengers.forEach(p => {
        const list = etabMap.get(p.etablissement) || [];
        list.push(p);
        etabMap.set(p.etablissement, list);
      });
      const etabGroups: EtablissementGroup[] = [];
      etabMap.forEach((pList, etabName) => {
        etabGroups.push({ etablissement: etabName, count: pList.length, passengers: pList });
      });
      tripsList.push({
        id: key, departureTime: depTime, tripType,
        title: tripType === 'to_school'
          ? `رحلة الذهاب: من ${centerName} إلى المؤسسات التعليمية`
          : `رحلة العودة: من المؤسسات التعليمية إلى ${centerName}`,
        description: tripType === 'to_school'
          ? `نقل التلاميذ من ${centerName} للالتحاق بصفوفهم (بداية الحصة: ${groupPassengers[0]?.targetTime || depTime})`
          : `إحضار التلاميذ من المدارس إلى ${centerName} بعد انتهاء الحصص (المغادرة: ${depTime})`,
        passengers: groupPassengers,
        etablissements: Array.from(etabMap.keys()),
        etabGroups
      });
    });

    // ─── Apply busEdits: departure overrides + passenger removals ──
    const dayBusEdits = busEdits[selectedDay] || {};
    for (const trip of tripsList) {
      const edit = dayBusEdits[trip.id];
      if (edit?.departureTime) trip.departureTime = edit.departureTime;
    }
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
  }, [students, studentTimeSheets, slots, selectedDay, busEdits]);

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
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2D7282] to-[#174F5A] text-white flex items-center justify-center shadow-md">
            <Bus className="h-7 w-7 text-[#C8D400]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-800">مخطط حافلة النقل المدرسي</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[#EAF3F4] text-[#17555F] text-xs font-bold">
                Transport Scolaire
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              تخطيط رحلات الذهاب والإياب لنقل التلاميذ بين {centerName} والمؤسسات التربوية حسب جداول التوقيت
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {busDriver ? (
            <div className="flex items-center gap-2.5 px-4 py-2 bg-[#F2F8F9] border border-[#A0CBCF]/40 rounded-2xl">
              <div className="w-8 h-8 rounded-xl bg-[#2D7282] text-white flex items-center justify-center font-bold text-sm">🚌</div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-bold">سائق الحافلة المعين:</span>
                  <span className="text-xs font-black text-slate-800">{busDriver.firstName} {busDriver.lastName}</span>
                </div>
                {busDriver.phone && (
                  <a href={`tel:${busDriver.phone}`} className="text-xs font-mono font-black text-[#2D7282] hover:underline flex items-center gap-1 mt-0.5" dir="ltr">
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

          {dayRemovedCount > 0 && (
            <button
              onClick={clearDayEdits}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs rounded-xl transition cursor-pointer shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              استعادة تعديلات اليوم ({dayRemovedCount})
            </button>
          )}

          <button
            onClick={handlePrintRoute}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#2D7282] hover:bg-[#1E6A73] text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer shrink-0"
          >
            <Printer className="h-4 w-4" />
            <span>طباعة ورقة المسار (Feuille de Route)</span>
          </button>
        </div>
      </div>

      {/* DAY SELECTOR TABS */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-2 overflow-x-auto no-print">
        <div className="flex items-center gap-1">
          {DAY_NAMES_ORDER.map(day => {
            const isSelected = selectedDay === day;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer shrink-0 ${
                  isSelected ? 'bg-[#2D7282] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row gap-3 items-center justify-between no-print">
        <div className="relative w-full md:w-72">
          <Search className="absolute right-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم التلميذ أو المؤسسة..."
            className="w-full pr-10 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#2D7282]"
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

        <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
          <button onClick={() => setActiveView('trips')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${activeView === 'trips' ? 'bg-white text-[#2D7282] shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
            الرحلات المجمعة
          </button>
          <button onClick={() => setActiveView('etablissements')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${activeView === 'etablissements' ? 'bg-white text-[#2D7282] shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
            حسب المؤسسة
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
                  className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer px-1 underline">إعادة</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MAIN CONTENT (INTERACTIVE UI) */}
      <div className="no-print space-y-4">
        {activeView === 'trips' && (
          <div className="space-y-4">
            {filteredTrips.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400">
                <Bus className="h-12 w-12 mx-auto mb-3 opacity-40 text-[#2D7282]" />
                <h3 className="text-base font-black text-slate-700">لا توجد رحلات مبرمجة ليوم {selectedDay}</h3>
                <p className="text-xs text-slate-400 mt-1">تأكد من تسجيل المؤسسة التعليمية في بطاقات التلاميذ أو تعيين التايم شيت.</p>
              </div>
            ) : (
              filteredTrips.map((trip, tripIndex) => {
                const isToSchool = trip.tripType === 'to_school';
                return (
                  <motion.div
                    key={trip.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: tripIndex * 0.05 }}
                    className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden"
                  >
                    {/* Trip Card Header */}
                    <div className={`p-4 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                      isToSchool ? 'bg-[#2D7282]' : 'bg-[#1E5763]'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-xl font-bold">
                          {isToSchool ? '🏫' : '🏠'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-[#C8D400] text-slate-900 text-[10px] font-black rounded-md">
                              رحلة #{tripIndex + 1}
                            </span>
                            <span className="text-xs font-bold text-emerald-200">
                              {isToSchool ? `الانطلاق من ${centerName} ← إلى المؤسسات` : `الإحضار من المؤسسات ← إلى ${centerName}`}
                            </span>
                          </div>
                          <h3 className="text-base font-black mt-0.5 flex items-center gap-2">
                            <span>توقيت الانطلاق:</span>
                            <input
                              type="time"
                              value={trip.departureTime}
                              onChange={(e) => overrideDepartureTime(trip.id, e.target.value)}
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
                        {busEdits[selectedDay]?.[trip.id]?.departureTime && (
                          <button
                            onClick={() => overrideDepartureTime(trip.id, '')}
                            className="bg-white/30 hover:bg-white/40 px-2 py-1 rounded-xl text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                          >
                            <RotateCcw className="h-3 w-3" />
                            إعادة التوقيت
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Establishment Badges Bar */}
                    <div className="bg-[#F7FAFA] px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-500 text-[11px]">محطات المسار المبرمجة:</span>
                      {trip.etabGroups.map((grp) => (
                        <span key={grp.etablissement} className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 ${
                          grp.count >= 2
                            ? 'bg-[#E0EFF1] text-[#14464E] border border-[#A0CBCF]'
                            : 'bg-white text-slate-700 border border-slate-200'
                        }`}>
                          <School className="h-3.5 w-3.5 text-[#2D7282]" />
                          <span>{grp.etablissement}</span>
                          <span className="px-1.5 py-0.2 bg-[#2D7282] text-white text-[10px] rounded-full">{grp.count}</span>
                          {grp.count >= 2 && (
                            <span className="text-[10px] text-[#2D7282] font-black mr-0.5">(مجموعة)</span>
                          )}
                        </span>
                      ))}
                    </div>

                    {/* Passengers Grouped Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-right">
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
                              <tr className="bg-[#F0F7F8] border-y border-[#A0CBCF]/30">
                                <td colSpan={7} className="py-2 px-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 font-black text-[#17555F] text-xs">
                                      <School className="h-4 w-4 text-[#2D7282]" />
                                      <span>{grp.etablissement}</span>
                                      {grp.count >= 2 && (
                                        <span className="bg-[#C8D400] text-slate-900 text-[10px] px-2 py-0.5 rounded-full font-black">
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
                                    <tr className={`transition ${isBoarded ? 'bg-emerald-50/60' : isRemoving ? 'bg-amber-50/60' : 'hover:bg-slate-50/50'}`}>
                                      <td className="p-3 text-center font-mono text-slate-400">{pIdx + 1}</td>
                                      <td className="p-3">
                                        <span className="font-black text-slate-900 text-xs block">
                                          {p.student.lastName} {p.student.firstName}
                                        </span>
                                      </td>
                                      <td className="p-3">
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold text-[11px]">
                                          {p.gradeLevel}
                                        </span>
                                      </td>
                                      <td className="p-3">
                                        <span className="text-[#2D7282] font-black flex items-center gap-1">
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
                                              ? 'bg-emerald-600 text-white shadow-xs'
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
                                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                          title="حذف التلميذ من هذه الرحلة اليوم"
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
                <div key={etab} className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-[#C8D400]/20 flex items-center justify-center text-xl">🏫</div>
                      <div>
                        <h4 className="font-black text-slate-900 text-sm">{etab}</h4>
                        <span className="text-[11px] text-slate-400 font-bold block">{distinctStudents.length} تلاميذ مسجلين</span>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-[#2D7282]/10 text-[#2D7282] rounded-xl text-xs font-black">
                      {etabPassengers.length} تنقلات
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {distinctStudents.map(st => (
                      <div key={st.id} className="py-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-black text-slate-800 block">{st.lastName} {st.firstName}</span>
                          <span className="text-[10px] text-slate-400 font-bold">{st.grade}</span>
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

      {/* PRINTABLE ROUTE SHEET (FEUILLE DE ROUTE A4) */}
      <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col hidden print:flex">
        
        {/* Printable Header */}
        <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="w-14 h-14 object-contain" />
            <div>
              <h1 className="text-xl font-black text-slate-900">{centerName}</h1>
              <p className="text-xs font-bold text-slate-600">ورقة مسار حافلة النقل المدرسي (Feuille de Route)</p>
            </div>
          </div>
          <div className="text-left text-xs font-bold space-y-1">
            <div><span className="text-slate-500">اليوم: </span><span className="font-black">{selectedDay}</span></div>
            <div><span className="text-slate-500">التاريخ: </span><span className="font-mono">{new Date().toISOString().split('T')[0]}</span></div>
          </div>
        </div>

        {/* Chauffeur info on top */}
        <div className="bg-slate-100 p-3 rounded-lg border border-slate-300 flex justify-between items-center text-xs">
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
            return (
              <div key={trip.id} className="border border-slate-400 rounded-lg overflow-hidden break-inside-avoid">
                <div className="bg-slate-800 text-white p-2 flex justify-between items-center text-xs font-bold">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#C8D400] text-slate-900 px-2 py-0.5 rounded font-black text-[11px]">
                      رحلة #{tripIndex + 1}
                    </span>
                    <span>{isToSchool ? `← انطلاق إلى المؤسسات` : `← عودة إلى ${centerName}`}</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded font-mono font-black">
                      {trip.departureTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>({trip.passengers.length} تلاميذ)</span>
                    <span>•</span>
                    <span>({trip.etablissements.length} مؤسسات)</span>
                  </div>
                </div>

                <table className="w-full text-xs text-right border-collapse">
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
                            <td className="p-2 border-l border-slate-300 font-bold text-slate-700">{p.gradeLevel}</td>
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
            );
          })}
        </div>

        {/* Print Absence Notes */}
        {dayRemovedCount > 0 && (
          <div className="border border-slate-400 rounded-lg p-3 break-inside-avoid">
            <p className="font-bold text-slate-800 mb-2">ملاحظات اليوم — غيابات مسجلة ({dayRemovedCount}):</p>
            <table className="w-full text-xs border-collapse">
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
        )}

        {/* Print Signatures Footer */}
        <div className="mt-8 pt-4 border-t-2 border-slate-800 grid grid-cols-2 gap-8 text-xs break-inside-avoid">
          <div>
            <p className="font-bold text-slate-700">ملاحظات سائق الحافلة:</p>
            <div className="h-16 border-b border-dotted border-slate-400 mt-2"></div>
          </div>
          <div className="text-left space-y-4">
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
