import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Search, 
  Plus, 
  Briefcase, 
  FileText, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Printer, 
  DollarSign, 
  UserCheck, 
  Trash2, 
  Edit3, 
  ShieldCheck, 
  X,
  BookOpen,
  CheckSquare,
  FileCheck
} from 'lucide-react';
import { StaffMember, TimesheetEntry, LeaveRequest, StaffAdvance, StaffRequestStatus, PaySlip, StaffRole, StaffScheduleSlot, MONTH_BY_CALENDAR_INDEX, CenterSettings, CenterExpense, getAppSubjects, TeenCenterSlot, TEEN_CENTER_DAYS } from '../types';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import DateField from './DateField';
import { capitalizeFirst } from '../utils/format';

interface StaffManagementModuleProps {
  staff: StaffMember[];
  slots?: TeenCenterSlot[];
  timesheets: TimesheetEntry[];
  onUpdateStaff: (staff: StaffMember[]) => void;
  onUpdateTimesheets: (ts: TimesheetEntry[]) => void;
  settings?: CenterSettings;
  onUpdateSettings?: (newSettings: CenterSettings) => void;
  expenses?: CenterExpense[];
  onUpdateExpenses?: (expenses: CenterExpense[]) => void;
}

// Arabic month names -> month number (1-12)
const AR_MONTH_NUM: Record<string, number> = {
  'جانفي': 1, 'فيفري': 2, 'مارس': 3, 'أفريل': 4, 'ماي': 5, 'جوان': 6,
  'جويلية': 7, 'أوت': 8, 'سبتمبر': 9, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12
};

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  enseignant: 'أستاذ / مدرس',
  encadrant: 'مشرف مؤطر',
  administration: 'إدارة',
  agent_entretien: 'عامل نظافة وتنسيق',
  cuisinier: 'طباخ / مطبخ',
  chauffeur_bus: 'سائق الحافلة',
  autre: 'أخرى'
};

type PointageStatus = 'present' | 'absent' | 'retard' | 'conge';

interface StaffSeancePointage {
  status: PointageStatus;
  extraHours: number;
}

interface StaffDayPointage {
  status: PointageStatus;
  notes: string;
  hoursWorked: number;
  extraHours: number;
  seances: Record<string, StaffSeancePointage>; // keyed by "08:00 - 10:00"
}

const DEFAULT_DAY_POINTAGE: StaffDayPointage = { status: 'present', notes: '', hoursWorked: 0, extraHours: 0, seances: {} };

const timeToMinutes = (t: string) => {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Duration of a seance in hours (08:30 → 10:30 = 2h)
const seanceHours = (slot: TeenCenterSlot) => Math.max(0, (timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime)) / 60);

// Reduce multiple seance entries of the same day into a single day-level severity
const daySeverity = (entries: TimesheetEntry[]): PointageStatus => {
  if (entries.length === 0) return 'present';
  const has = (s: PointageStatus) => entries.some(e => e.status === s);
  if (entries.every(e => e.status === 'absent')) return 'absent';
  if (entries.every(e => e.status === 'conge')) return 'conge';
  if (has('retard')) return 'retard';
  if (has('present')) return 'present';
  return 'absent';
};

// Summarize a month of timesheet entries by distinct DAYS (not per seance)
const summarizeEntries = (entries: TimesheetEntry[]) => {
  const byDay: Record<string, TimesheetEntry[]> = {};
  entries.forEach(e => { (byDay[e.date] = byDay[e.date] || []).push(e); });
  let daysPresent = 0, daysAbsent = 0, daysRetard = 0, daysConge = 0, extraHours = 0;
  Object.values(byDay).forEach(dayEntries => {
    const sev = daySeverity(dayEntries);
    if (sev === 'present') daysPresent++;
    else if (sev === 'absent') daysAbsent++;
    else if (sev === 'retard') daysRetard++;
    else daysConge++;
    extraHours += dayEntries.reduce((s, e) => s + (e.extraHours || 0), 0);
  });
  return { daysPresent, daysAbsent, daysRetard, daysConge, extraHours };
};

export default function StaffManagementModule({
  staff,
  slots,
  timesheets,
  onUpdateStaff,
  onUpdateTimesheets,
  settings,
  onUpdateSettings,
  expenses = [],
  onUpdateExpenses
}: StaffManagementModuleProps) {
   const toast = useToast();
   const [activeSubTab, setActiveSubTab] = useState<'profiles' | 'pointage'>('profiles');
   // selectedStaffId drives the detail view so that schedule/avance/leave changes persist automatically
   const [selectedStaffId, setSelectedStaffId] = useState<string | null>(staff[0]?.id || null);
   const selectedStaff = staff.find(s => s.id === selectedStaffId) || null;
   const [searchTerm, setSearchTerm] = useState('');
  const [staffPage, setStaffPage] = useState<number>(1);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  // Subjects state (shared list from settings so it stays in sync across the app)
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const availableSubjects = getAppSubjects(settings);

  // Form states for staff member
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<StaffRole>('enseignant');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [cin, setCin] = useState('');
  const [cnssNumber, setCnssNumber] = useState('');
  const [baseSalary, setBaseSalary] = useState(850);
  const [cnssAmount, setCnssAmount] = useState(78);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['الرياضيات (Mathématiques)']);

  // Emploi du temps (schedule) form state
  const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const [scheduleForm, setScheduleForm] = useState<StaffScheduleSlot[]>(
    WEEKDAYS.map(d => d === 'Samedi' ? { day: d, slots: ['08:00 - 12:00'] } : { day: d, slots: ['08:00 - 12:00', '14:00 - 18:00'] })
  );

  const updateDaySlots = (day: string, newSlots: string[]) => {
    setScheduleForm(prev => prev.map(s => s.day === day ? { ...s, slots: newSlots } : s));
  };

  // Pointage States
  const todayStr = new Date().toISOString().split('T')[0];
  const [pointageDate, setPointageDate] = useState(todayStr);
  const [dailyPointageState, setDailyPointageState] = useState<Record<string, StaffDayPointage>>({});
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);

  // Sync dailyPointageState with saved timesheets whenever pointageDate or timesheets change
  React.useEffect(() => {
    const existingForDate = timesheets.filter(t => t.date === pointageDate);
    const initialMap: Record<string, StaffDayPointage> = {};
    staff.forEach(s => {
      const dayEntries = existingForDate.filter(t => t.staffId === s.id);
      const wholeDay = dayEntries.find(t => !t.slotTime);
      const slotEntries = dayEntries.filter(t => t.slotTime);
      const seances: Record<string, StaffSeancePointage> = {};
      slotEntries.forEach(t => {
        seances[t.slotTime!] = { status: t.status, extraHours: t.extraHours || 0 };
      });
      initialMap[s.id] = {
        status: wholeDay?.status || 'present',
        notes: wholeDay?.notes || '',
        hoursWorked: wholeDay?.hoursWorked || 0,
        extraHours: wholeDay?.extraHours || 0,
        seances
      };
    });
    setDailyPointageState(initialMap);
  }, [pointageDate, timesheets, staff]);

  // Payslip generation modal states
  const [generatingPayslipStaff, setGeneratingPayslipStaff] = useState<StaffMember | null>(null);
  const [payMonth, setPayMonth] = useState(() => {
    const now = new Date();
    return `${MONTH_BY_CALENDAR_INDEX[now.getMonth()]} ${now.getFullYear()}`;
  });
  const payMonthLabel = payMonth.split(' ')[0];
  const payYear = payMonth.split(' ')[1];
  const setPayMonthPart = (label: string) => setPayMonth(`${label} ${payYear}`);
  const setPayYear = (year: string) => setPayMonth(`${payMonthLabel} ${year}`);
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2, currentYear + 3];
   const [bonusAmount, setBonusAmount] = useState(0);
   const [bonusReason, setBonusReason] = useState('منحة تشجيعية');
   const [fixedCnssAmount, setFixedCnssAmount] = useState(85);
   const [manualExtraHours, setManualExtraHours] = useState<number | null>(null);
   const [extraHourRate, setExtraHourRate] = useState(8);
   // Manual absence/retard deduction override (null = auto from pointage)
   const [manualAbsenceDeduction, setManualAbsenceDeduction] = useState<number | null>(null);
   const [printedPayslip, setPrintedPayslip] = useState<PaySlip | null>(null);

  // Leave request form
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveStartDate, setLeaveStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveEndDate, setLeaveEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveType, setLeaveType] = useState<'Maladie' | 'Annuel' | 'Exceptionnel'>('Annuel');

  // Advance (سلفة) request form
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [advanceReason, setAdvanceReason] = useState('');

  // Staff detail section pagination (5 per page)
  const staffDetailPageSize = 5;
  const [leavePage, setLeavePage] = useState<number>(1);
  const [advancePage, setAdvancePage] = useState<number>(1);
  const [payslipPage, setPayslipPage] = useState<number>(1);

  // Staff delete confirmation state
  const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

  const filteredStaff = staff.filter(s => {
    const text = `${s.firstName} ${s.lastName} ${s.role} ${s.subjects?.join(' ')}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  const staffPageSize = 10;
  const staffTotalPages = Math.ceil(filteredStaff.length / staffPageSize) || 1;
  const staffCurrentPage = Math.min(Math.max(1, staffPage), staffTotalPages);
  const paginatedStaff = filteredStaff.slice((staffCurrentPage - 1) * staffPageSize, staffCurrentPage * staffPageSize);

  const handleAddSubject = () => {
    if (!newSubjectInput.trim()) return;
    const sub = newSubjectInput.trim();
    if (!availableSubjects.includes(sub)) {
      if (settings && onUpdateSettings) {
        onUpdateSettings({ ...settings, subjects: [...availableSubjects, sub] });
      }
    }
    if (!selectedSubjects.includes(sub)) {
      setSelectedSubjects([...selectedSubjects, sub]);
    }
    setNewSubjectInput('');
    setIsAddingSubject(false);
  };

  const toggleSubjectSelection = (sub: string) => {
    if (selectedSubjects.includes(sub)) {
      setSelectedSubjects(selectedSubjects.filter(s => s !== sub));
    } else {
      setSelectedSubjects([...selectedSubjects, sub]);
    }
  };

  const openAddStaff = () => {
    setEditingStaffId(null);
    setFirstName('');
    setLastName('');
    setCin('');
    setRole('enseignant');
    setPhone('');
    setEmail('');
    setAddress('');
    setCnssNumber('');
    setBaseSalary(850);
    setCnssAmount(78);
    setSelectedSubjects(['الرياضيات (Mathématiques)']);
    setScheduleForm(WEEKDAYS.map(d => d === 'Samedi' ? { day: d, slots: ['08:00 - 12:00'] } : { day: d, slots: ['08:00 - 12:00', '14:00 - 18:00'] }));
    setIsStaffModalOpen(true);
  };

  const openEditStaff = (s: StaffMember) => {
    setEditingStaffId(s.id);
    setFirstName(s.firstName);
    setLastName(s.lastName);
    setCin(s.cin || '');
    setRole(s.role);
    setPhone(s.phone);
    setEmail(s.email || '');
    setAddress(s.address || '');
    setCnssNumber(s.cnssNumber || '');
    setBaseSalary(s.baseSalary || s.salary || 850);
    setCnssAmount(s.cnssAmount || 78);
    setSelectedSubjects(s.subjects || []);
    setScheduleForm(s.schedule && s.schedule.length ? s.schedule : WEEKDAYS.map(d => d === 'Samedi' ? { day: d, slots: ['08:00 - 12:00'] } : { day: d, slots: ['08:00 - 12:00', '14:00 - 18:00'] }));
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;

    const cinClean = cin.trim();
    if (!cinClean || !/^\d{8}$/.test(cinClean)) {
      toast.error('رقم CIN يجب أن يكون 8 أرقام بالضبط.');
      return;
    }

    const payload: StaffMember = {
      id: editingStaffId || 'stf_' + crypto.randomUUID(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      cin: cinClean,
      role,
      type: 'salarié',
      salary: Number(baseSalary),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      contractStartDate: editingStaffId ? (staff.find(s => s.id === editingStaffId)?.contractStartDate || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
      cnssNumber: cnssNumber.trim(),
      baseSalary: Number(baseSalary),
      cnssAmount: Number(cnssAmount),
      hireDate: editingStaffId ? (staff.find(s => s.id === editingStaffId)?.hireDate || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
      subjects: role === 'enseignant' ? selectedSubjects : [],
      schedule: scheduleForm,
      leaveRequests: editingStaffId ? (staff.find(s => s.id === editingStaffId)?.leaveRequests || []) : []
    };

    if (editingStaffId) {
       onUpdateStaff(staff.map(s => s.id === editingStaffId ? payload : s));
       setSelectedStaffId(editingStaffId);
       toast.success(`تم تحديث بيانات الموظف/الأستاذ (${payload.firstName} ${payload.lastName}) بنجاح!`);
     } else {
       onUpdateStaff([...staff, payload]);
       setSelectedStaffId(payload.id);
       toast.success(`تمت إضافة الموظف/الأستاذ (${payload.firstName} ${payload.lastName}) بنجاح!`);
     }

     setIsStaffModalOpen(false);
  };

  // Pointage handlers
   const handleSetStatus = (staffId: string, status: 'present' | 'absent' | 'retard' | 'conge') => {
     setDailyPointageState(prev => ({
       ...prev,
       [staffId]: {
         ...(prev[staffId] || DEFAULT_DAY_POINTAGE),
         status,
         notes: prev[staffId]?.notes || '',
         hoursWorked: prev[staffId]?.hoursWorked || 0,
         extraHours: prev[staffId]?.extraHours || 0
       }
     }));
   };

   const handleSetSeanceStatus = (staffId: string, timeKey: string, status: PointageStatus) => {
     setDailyPointageState(prev => ({
       ...prev,
       [staffId]: {
         ...(prev[staffId] || DEFAULT_DAY_POINTAGE),
         seances: {
           ...(prev[staffId]?.seances || {}),
           [timeKey]: { status, extraHours: prev[staffId]?.seances?.[timeKey]?.extraHours || 0 }
         }
       }
     }));
   };

   const handleSetSeanceExtraHours = (staffId: string, timeKey: string, value: string) => {
     const num = value === '' ? 0 : Number(value);
     setDailyPointageState(prev => ({
       ...prev,
       [staffId]: {
         ...(prev[staffId] || DEFAULT_DAY_POINTAGE),
         seances: {
           ...(prev[staffId]?.seances || {}),
           [timeKey]: { status: prev[staffId]?.seances?.[timeKey]?.status || 'present', extraHours: num }
         }
       }
     }));
   };

   const handleSetNotes = (staffId: string, notes: string) => {
     setDailyPointageState(prev => ({
       ...prev,
       [staffId]: { ...(prev[staffId] || DEFAULT_DAY_POINTAGE), notes }
     }));
   };

   const handleSetHours = (staffId: string, field: 'hoursWorked' | 'extraHours', value: string) => {
     const num = value === '' ? 0 : Number(value);
     setDailyPointageState(prev => ({
       ...prev,
       [staffId]: { ...(prev[staffId] || DEFAULT_DAY_POINTAGE), [field]: num }
     }));
   };

   // Seances (Étude Teen Center schedule) of a staff member on a given date
   const getStaffSeancesForDate = (st: StaffMember, dateStr: string): TeenCenterSlot[] => {
     if (!slots) return [];
     const d = new Date(dateStr + 'T00:00:00');
     const dayIdx = d.getDay(); // 0=Sunday .. 6=Saturday
     if (dayIdx < 1 || dayIdx > 6) return [];
     const dayName = TEEN_CENTER_DAYS[dayIdx - 1];
     return slots
       .filter(s => s.day === dayName && s.teacherId === st.id)
       .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
   };

  const handleSaveDailyPointage = () => {
    if (pointageDate > todayStr) {
      toast.error('عذراً، لا يمكن تسجيل الحضور لتاريخ مستقبلي!');
      return;
    }

    const newEntries: TimesheetEntry[] = [];
    staff.forEach(s => {
      const p = dailyPointageState[s.id] || DEFAULT_DAY_POINTAGE;
      const seances = getStaffSeancesForDate(s, pointageDate);
      if (seances.length > 0) {
        // Per-seance entries (one per Créneau)
        seances.forEach(slot => {
          const timeKey = `${slot.startTime} - ${slot.endTime}`;
          const sp = p.seances?.[timeKey] || { status: 'present', extraHours: 0 };
          const autoExtra = slot.isExtra ? seanceHours(slot) : 0;
          newEntries.push({
            id: `ts_${s.id}_${pointageDate}_${timeKey.replace(/\D/g, '')}`,
            staffId: s.id,
            date: pointageDate,
            slotTime: timeKey,
            status: sp.status,
            notes: p.notes,
            hoursWorked: 0,
            extraHours: sp.extraHours > 0 ? sp.extraHours : autoExtra
          });
        });
      } else {
        // Whole-day entry (no seances scheduled that weekday)
        newEntries.push({
          id: `ts_${s.id}_${pointageDate}`,
          staffId: s.id,
          date: pointageDate,
          status: p.status,
          notes: p.notes,
          hoursWorked: p.hoursWorked || 0,
          extraHours: p.extraHours || 0
        });
      }
    });

    // Merge into existing timesheets
    const otherEntries = timesheets.filter(t => t.date !== pointageDate);
    onUpdateTimesheets([...otherEntries, ...newEntries]);
    toast.success(`تم حفظ سجل الحضور ليوم ${pointageDate} بنجاح!`);
  };

  const handleSaveLeaveRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;

    const newReq: LeaveRequest = {
      id: 'lve_' + crypto.randomUUID(),
      staffId: selectedStaff.id,
      startDate: leaveStartDate,
      endDate: leaveEndDate,
      reason: leaveReason.trim(),
      type: leaveType,
      status: 'en_attente'
    };

    const updatedStaffMember: StaffMember = {
      ...selectedStaff,
      leaveRequests: [...(selectedStaff.leaveRequests || []), newReq]
    };

     onUpdateStaff(staff.map(s => s.id === selectedStaff.id ? updatedStaffMember : s));
     setIsLeaveModalOpen(false);
     toast.success('تمت إضافة طلب الإجازة/الرخصة بنجاح!');
   };

   const handleUpdateLeaveStatus = (reqId: string, status: 'approuve' | 'refuse') => {
     if (!selectedStaff) return;

     const req = (selectedStaff.leaveRequests || []).find(r => r.id === reqId);
     const updatedRequests = (selectedStaff.leaveRequests || []).map(r => r.id === reqId ? { ...r, status } : r);
     const updatedStaffMember: StaffMember = {
       ...selectedStaff,
       leaveRequests: updatedRequests
     };

     onUpdateStaff(staff.map(s => s.id === selectedStaff.id ? updatedStaffMember : s));

     // When a leave is approved, mark each day of the leave as conge (🏖) in the pointage
     if (status === 'approuve' && req) {
       const congeEntries: TimesheetEntry[] = [];
       const toLocalDateStr = (d: Date) =>
         `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
       const start = new Date(req.startDate + 'T00:00:00');
       const end = new Date(req.endDate + 'T00:00:00');
       for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
         const dateStr = toLocalDateStr(d);
         const existing = timesheets.find(t => t.staffId === selectedStaff.id && t.date === dateStr);
         congeEntries.push({
           id: existing ? existing.id : `ts_${selectedStaff.id}_${dateStr}_conge`,
           staffId: selectedStaff.id,
           date: dateStr,
           status: 'conge',
           leaveReason: req.reason || (req.type === 'Maladie' ? 'رخصة مرضية' : 'إجازة'),
           leaveStatus: 'approuvé',
           notes: existing?.notes || '',
           hoursWorked: existing?.hoursWorked || 0,
           extraHours: existing?.extraHours || 0
         });
       }
       const otherEntries = timesheets.filter(t => !(t.staffId === selectedStaff.id && congeEntries.some(ce => ce.date === t.date)));
       onUpdateTimesheets([...otherEntries, ...congeEntries]);
       toast.success(`تمت الموافقة على الإجازة وسُجلت في الحضور لأيام ${req.startDate} → ${req.endDate} 🏖`);
     }
    };

  // Advance (سلفة) request handlers
  const handleSaveAdvanceRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    const maxAdvance = selectedStaff.baseSalary || 850;
    const advAmount = Number(advanceAmount) || 0;
    if (advAmount <= 0) {
      toast.error('عذراً، المبلغ يجب أن يكون أكبر من صفر!');
      return;
    }
    if (advAmount > maxAdvance) {
      toast.error(`عذراً، مبلغ السلفة (${advAmount} د.ت) لا يمكن أن يتجاوز الراتب الصافي (${maxAdvance} د.ت)!`);
      return;
    }
    const newAdv: StaffAdvance = {
      id: 'adv_' + crypto.randomUUID(),
      staffId: selectedStaff.id,
      amount: advAmount,
      date: advanceDate,
      reason: advanceReason.trim(),
      status: 'en_attente'
    };
    const updatedStaffMember: StaffMember = {
      ...selectedStaff,
      advances: [...(selectedStaff.advances || []), newAdv]
    };
    onUpdateStaff(staff.map(s => s.id === selectedStaff.id ? updatedStaffMember : s));
    setIsAdvanceModalOpen(false);
    setAdvanceAmount(0);
    setAdvanceReason('');
    toast.success('أُرسل طلب السلفة للموافقة!');
  };

  const handleUpdateAdvanceStatus = (advId: string, status: StaffRequestStatus) => {
    if (!selectedStaff) return;
    const updatedAdvances = (selectedStaff.advances || []).map(a => a.id === advId ? { ...a, status } : a);
    const updatedStaffMember: StaffMember = { ...selectedStaff, advances: updatedAdvances };
    onUpdateStaff(staff.map(s => s.id === selectedStaff.id ? updatedStaffMember : s));
  };

  // Total approved advances that fall inside the payslip month (used to deduct from the salary)
  const getApprovedAdvancesForMonth = (staffMember: StaffMember, monthLabel: string) => {
    const match = monthLabel.match(/([^\s]+)\s+(\d{4})/);
    if (!match) return [];
    const monthNum = AR_MONTH_NUM[match[1]];
    const year = Number(match[2]);
    if (!monthNum || isNaN(year)) return [];
    return (staffMember.advances || []).filter(a => {
      if (a.status !== 'approuve') return false;
      const ym = a.date.slice(0, 7); // YYYY-MM
      return ym === `${year}-${String(monthNum).padStart(2, '0')}`;
    });
  };

  const getStaffMonthlyAttendance = (staffId: string, monthLabel: string) => {
    // Parse Arabic month label like "أكتوبر 2026"
    const match = monthLabel.match(/([^\s]+)\s+(\d{4})/);
    if (!match) return null;
    const monthNum = AR_MONTH_NUM[match[1]];
    const year = Number(match[2]);
    if (!monthNum || isNaN(year)) return null;

    const prefix = `${year}-${String(monthNum).padStart(2, '0')}`;
    const monthTs = timesheets.filter(t => t.staffId === staffId && t.date.startsWith(prefix));
    const summary = summarizeEntries(monthTs);

    // Additional hours are counted ONLY for seances flagged "ساعات إضافية" (isExtra) in Étude Teen Center
    // that were recorded as PRESENT in the teacher's timesheet (تسجيل تايم شيت الأستاذ).
    // Never auto-calculated from the schedule alone.
    let extraHours = 0;
    if (slots) {
      const WEEKDAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      monthTs.forEach(t => {
        if (t.status !== 'present') return;
        const dayName = WEEKDAY_NAMES[new Date(t.date + 'T00:00:00').getDay()];
        const slot = slots.find(s =>
          s.teacherId === staffId &&
          s.day === dayName &&
          `${s.startTime} - ${s.endTime}` === t.slotTime &&
          s.isExtra
        );
        if (slot) extraHours += seanceHours(slot);
      });
    }

    return {
      daysPresent: summary.daysPresent,
      daysAbsent: summary.daysAbsent,
      daysRetard: summary.daysRetard,
      extraHours
    };
  };

  const handleGeneratePayslip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!generatingPayslipStaff) return;

    // If a payslip already exists for this staff member + month → only re-view / print it (no duplicate finance entry)
    const existing = (generatingPayslipStaff.payslips || []).find(p => p.month === payMonth);
    if (existing) {
      setPrintedPayslip(existing);
      setGeneratingPayslipStaff(null);
      toast.info(`بطاقة أجر شهر ${payMonth} موجودة مسبقاً — يمكنك معاينتها وطباعتها فقط.`);
      return;
    }

const base = generatingPayslipStaff.baseSalary || 850;
     const att = getStaffMonthlyAttendance(generatingPayslipStaff.id, payMonth);
     const cnssDeduction = fixedCnssAmount;
     const autoAbsenceDeduction = ((att?.daysAbsent || 0) + (att?.daysRetard || 0) * 0.5) * (base / 30);
     // Allow the user to override the absence deduction manually (0 = no deduction for legal absences)
     const absenceDeductions = manualAbsenceDeduction !== null ? manualAbsenceDeduction : autoAbsenceDeduction;
     // Deduct advances (سلف) approved for the payslip month
     const monthAdvances = getApprovedAdvancesForMonth(generatingPayslipStaff, payMonth);
     const advanceDeducted = monthAdvances.reduce((s, a) => s + a.amount, 0);
     // Extra hours pay = hours * rate (rate set by the user). Defaults to auto-computed total, overridable manually.
     const extraHours = manualExtraHours !== null ? manualExtraHours : (att?.extraHours || 0);
     const extraHoursAmount = extraHours * (extraHourRate || 0);
     // CNSS is displayed for info but NOT deducted from net salary
     const netSalary = base + bonusAmount + extraHoursAmount - absenceDeductions - advanceDeducted;

     const slip: PaySlip = {
        id: 'pay_' + crypto.randomUUID(),
        staffId: generatingPayslipStaff.id,
        month: payMonth,
        baseSalary: base,
        bonus: bonusAmount,
        bonusReason,
        cnssDeduction,
        absenceDeductions,
        advanceDeducted,
       netSalary,
       issueDate: new Date().toISOString().split('T')[0],
       daysPresent: att?.daysPresent,
       daysAbsent: att?.daysAbsent,
       daysRetard: att?.daysRetard,
       extraHours,
       extraHourRate,
       extraHoursAmount
     };

    // Validate: save the payslip on the staff record + add the salary to the finance expenses (Salaires du personnel)
    const updatedStaff: StaffMember = {
      ...generatingPayslipStaff,
      payslips: [...(generatingPayslipStaff.payslips || []), slip]
    };
    onUpdateStaff(staff.map(s => s.id === generatingPayslipStaff.id ? updatedStaff : s));

    if (onUpdateExpenses) {
      const newExpense: CenterExpense = {
        id: 'exp_' + crypto.randomUUID(),
        date: new Date().toISOString().split('T')[0],
        category: 'Salaires (Personnel)',
        amount: netSalary,
        description: `راتب ${generatingPayslipStaff.firstName} ${generatingPayslipStaff.lastName} - ${payMonth}`,
        receiptRef: `BUL-${generatingPayslipStaff.firstName.slice(0,3).toUpperCase()}-${payMonth.replace(/\s/g, '')}`
      };
      onUpdateExpenses([...expenses, newExpense]);
      toast.success(`حُوّل راتب ${generatingPayslipStaff.firstName} ${generatingPayslipStaff.lastName} إلى المالية (${netSalary.toFixed(2)} د.ت)!`);
    }

    setPrintedPayslip(slip);
    setGeneratingPayslipStaff(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white border border-[#E0EFF1] p-6 rounded-3xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-[#F2F8F9] text-[#14464E] text-xs font-bold rounded-lg border border-[#C3E0E4]/60">
              إدارة الموظفين والأساتذة
            </span>
            <span className="text-xs text-slate-400 font-bold">الموارد البشرية والمواد والحضور</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <Users className="h-6 w-6 text-[#257C86]" />
            إدارة المعلمين والطاقم، نظام الحضور والغياب والأرشيف الشهري
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            ربط كل أستاذ بمواده، تسجيل الحضور اليومي وأرشيف الغيابات الشهري واستخراج كشوف الأجور.
          </p>
        </div>

        <button
          onClick={openAddStaff}
          className="px-5 py-3 bg-[#257C86] hover:bg-[#1E6A73] text-white font-extrabold text-sm rounded-2xl transition shadow-md shadow-[#257C86]/20 flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus className="h-5 w-5" />
          إضافة موظف / أستاذ
        </button>
      </div>

      {/* SUB TABS NAVIGATION */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 flex gap-2 no-print">
        <button
          onClick={() => setActiveSubTab('profiles')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'profiles' 
              ? 'bg-[#257C86] text-white shadow-sm' 
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="h-4 w-4" />
          فريق العمل والملفات
        </button>

        <button
          onClick={() => setActiveSubTab('pointage')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'pointage' 
              ? 'bg-[#257C86] text-white shadow-sm' 
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CheckSquare className="h-4 w-4" />
          نظام الحضور والغياب اليومي
        </button>

        </div>

      {/* SUB TAB 1: PROFILES & LEAVES */}
      {activeSubTab === 'profiles' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
          
          {/* Left Column: Staff Search & List */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setStaffPage(1); }}
                placeholder="بحث باسم الموظف، المادة أو الخطة..."
                className="w-full pr-10 pl-4 py-2 bg-white border border-slate-200 rounded-2xl text-xs font-semibold"
              />
            </div>

            <div className="space-y-3 max-h-[calc(100vh-360px)] overflow-y-auto no-scrollbar pr-0.5">
              {paginatedStaff.map(s => {
                const isSelected = selectedStaff?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedStaffId(s.id)}
                    className={`p-4 rounded-3xl border transition cursor-pointer ${
                      isSelected 
                        ? 'bg-[#F2F8F9]/60 border-[#A0CBCF] shadow-sm' 
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase text-[#14464E] bg-[#E0EFF1] px-2 py-0.5 rounded-md">
                          {STAFF_ROLE_LABELS[s.role] || s.role}
                        </span>
                        <h4 className="text-base font-black text-slate-900 mt-1">{s.firstName} {s.lastName}</h4>
                      </div>

                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditStaff(s);
                          }}
                          className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500"
                          title="تعديل الموظف"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setStaffToDelete(s);
                          }}
                          className="p-1.5 hover:bg-red-100 rounded-lg text-red-500"
                          title="حذف الموظف"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {s.subjects && s.subjects.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {s.subjects.map((sub, idx) => (
                          <span key={idx} className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                            {sub}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 text-xs text-slate-500 font-mono flex justify-between">
                      <span dir="ltr">📞 {s.phone}</span>
                      <span>CNSS: {s.cnssNumber || 'غير مسجل'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {filteredStaff.length > staffPageSize && (
              <div className="flex justify-center items-center gap-2 mt-3">
                <button onClick={() => setStaffPage(p => Math.max(1, p - 1))} disabled={staffCurrentPage <= 1} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">◀ السابق</button>
                <span className="text-[10px] font-bold text-slate-500 mx-2">{staffCurrentPage} / {staffTotalPages}</span>
                <button onClick={() => setStaffPage(p => Math.min(staffTotalPages, p + 1))} disabled={staffCurrentPage >= staffTotalPages} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">التالي ▶</button>
              </div>
            )}
          </div>

          {/* Right Column: Detailed View, Payslips & Leaves */}
          {selectedStaff ? (
            <div className="lg:col-span-2 space-y-6">
              
              {/* Header info card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-xs font-bold text-[#17555F] bg-[#F2F8F9] px-2.5 py-1 rounded-md border border-[#C3E0E4]">
                      {STAFF_ROLE_LABELS[selectedStaff.role] || selectedStaff.role}
                    </span>
                    <h3 className="text-2xl font-black text-slate-900 mt-2">
                      {selectedStaff.firstName} {selectedStaff.lastName}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">تاريخ الانتداب: {selectedStaff.hireDate || selectedStaff.contractStartDate}</p>
                  </div>
                </div>

                {/* Salary & CNSS details breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-slate-400 text-[10px] block font-bold">الراتب الأساسي:</span>
                    <span className="font-extrabold text-slate-900 font-mono">{selectedStaff.baseSalary || selectedStaff.salary || 0} د.ت</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-slate-400 text-[10px] block font-bold">مبلغ (CNSS):</span>
                    <span className="font-extrabold text-slate-900 font-mono">{selectedStaff.cnssAmount || 0} د.ت</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-slate-400 text-[10px] block font-bold">رقم الـ CNSS:</span>
                    <span className="font-bold text-slate-800 font-mono">{selectedStaff.cnssNumber || 'لا يوجد'}</span>
                  </div>
                  <div className="p-3 bg-[#F2F8F9] rounded-2xl border border-[#C3E0E4]">
                    <span className="text-[#14464E] text-[10px] block font-bold">المواد المدرسية:</span>
                    <span className="font-bold text-[#103840]">{selectedStaff.subjects?.join(', ') || 'غير محدد'}</span>
                  </div>
                </div>
              </div>

              {/* Emploi du temps Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#257C86]" />
                  التوقيت الأسبوعي
                </h4>
                {selectedStaff.schedule && selectedStaff.schedule.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {selectedStaff.schedule.map(sd => (
                      <div key={sd.day} className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                        <span className="text-[11px] font-black text-slate-800 block mb-1">{sd.day}</span>
                        {sd.slots.length === 0 ? (
                          <span className="text-[10px] text-slate-400 italic">راحة (يوم عطلة)</span>
                        ) : (
                          sd.slots.map((slot, i) => (
                            <span key={i} className="block text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 mt-1">
                              {slot}
                            </span>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">لا يوجد توقيت أسبوعي محدد لهذا الموظف.</p>
                )}
              </div>

              {/* Leave Requests Management Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-black text-slate-900 text-sm">طلبات الإجازات والرخص</h4>
                  <button
                    onClick={() => setIsLeaveModalOpen(true)}
                    className="px-3 py-1.5 bg-[#257C86] text-white rounded-xl font-bold text-xs cursor-pointer"
                  >
                    تقديم طلب إجازة جديد
                  </button>
                </div>

                {selectedStaff.leaveRequests?.length === 0 ? (
                  <p className="text-xs text-slate-400">لا توجد طلبات إجازة سابقة لهذا الموظف.</p>
                ) : (() => {
                  const sorted = [...(selectedStaff.leaveRequests || [])].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
                  const totalPages = Math.ceil(sorted.length / staffDetailPageSize) || 1;
                  const page = Math.min(Math.max(1, leavePage), totalPages);
                  const paginated = sorted.slice((page - 1) * staffDetailPageSize, page * staffDetailPageSize);
                  return (
                    <div>
                      <div className="space-y-3">
                        {paginated.map(req => (
                      <div key={req.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{req.type}</span>
                            <span className="text-slate-400 text-[10px] font-mono">({req.startDate} 👈 {req.endDate})</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">{req.reason}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {req.status === 'en_attente' && (
                            <>
                              <button
                                onClick={() => handleUpdateLeaveStatus(req.id, 'approuve')}
                                className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg text-[10px]"
                              >
                                موافقة ✓
                              </button>
                              <button
                                onClick={() => handleUpdateLeaveStatus(req.id, 'refuse')}
                                className="px-2.5 py-1 bg-red-600 text-white font-bold rounded-lg text-[10px]"
                              >
                                رفض ✕
                              </button>
                            </>
                          )}
                          {req.status === 'approuve' && (
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-[10px]">
                              مقبولة
                            </span>
                          )}
                          {req.status === 'refuse' && (
                            <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-lg font-bold text-[10px]">
                              مرفوضة
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    </div>
                    {sorted.length > staffDetailPageSize && (
                      <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-100">
                        <button onClick={() => setLeavePage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">◀ السابق</button>
                        <span className="text-[10px] font-bold text-slate-500">صفحة {page} من {totalPages}</span>
                        <button onClick={() => setLeavePage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">التالي ▶</button>
                      </div>
                    )}
                    </div>
                  );
                })()}
              </div>

              {/* Advance Requests (طلبات السلفة) */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-black text-slate-900 text-sm">طلبات السلفة</h4>
                  <button
                    onClick={() => setIsAdvanceModalOpen(true)}
                    className="px-3 py-1.5 bg-red-500 text-white rounded-xl font-bold text-xs cursor-pointer"
                  >
                    تقديم طلب سلفة جديد
                  </button>
                </div>

                {(!selectedStaff.advances || selectedStaff.advances.length === 0) ? (
                  <p className="text-xs text-slate-400">لا توجد طلبات سلفة سابقة لهذا الموظف.</p>
                ) : (() => {
                  const sorted = [...(selectedStaff.advances || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                  const totalPages = Math.ceil(sorted.length / staffDetailPageSize) || 1;
                  const page = Math.min(Math.max(1, advancePage), totalPages);
                  const paginated = sorted.slice((page - 1) * staffDetailPageSize, page * staffDetailPageSize);
                  return (
                    <div>
                      <div className="space-y-3">
                        {paginated.map(adv => (
                      <div key={adv.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">سلفة: {adv.amount} د.ت</span>
                            <span className="text-slate-400 text-[10px] font-mono">{adv.date}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">{adv.reason}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {adv.status === 'en_attente' && (
                            <>
                              <button
                                onClick={() => handleUpdateAdvanceStatus(adv.id, 'approuve')}
                                className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg text-[10px]"
                              >
                                موافقة ✓
                              </button>
                              <button
                                onClick={() => handleUpdateAdvanceStatus(adv.id, 'refuse')}
                                className="px-2.5 py-1 bg-red-600 text-white font-bold rounded-lg text-[10px]"
                              >
                                رفض ✕
                              </button>
                            </>
                          )}
                          {adv.status === 'approuve' && (
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-black text-[10px] border border-emerald-300">مقبول ✓</span>
                          )}
                           {adv.status === 'refuse' && (
                            <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-lg font-black text-[10px] border border-red-300">مرفوض ✕</span>
                          )}
                        </div>
                      </div>
                    ))}
                    </div>
                    {sorted.length > staffDetailPageSize && (
                      <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-100">
                        <button onClick={() => setAdvancePage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">◀ السابق</button>
                        <span className="text-[10px] font-bold text-slate-500">صفحة {page} من {totalPages}</span>
                        <button onClick={() => setAdvancePage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">التالي ▶</button>
                      </div>
                    )}
                    </div>
                  );
                })()}
              </div>

              {/* Payslip history card (بعد التحقق: عرض وطباعة فقط) */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-black text-slate-900 text-sm">كشوف الأجر المؤكدة</h4>
                  <button
                    onClick={() => {
                      setBonusAmount(0);
                      setFixedCnssAmount(selectedStaff.cnssAmount ?? 0);
                      setManualAbsenceDeduction(null);
                      setManualExtraHours(null);
                      setGeneratingPayslipStaff(selectedStaff);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl font-bold text-xs cursor-pointer"
                  >
                    إعداد بطاقة أجر جديدة
                  </button>
                </div>

                {(!selectedStaff.payslips || selectedStaff.payslips.length === 0) ? (
                  <p className="text-xs text-slate-400">لا توجد كشوف أجر مؤكدة بعد. عند التحقق تُضاف تلقائياً للمالية.</p>
                ) : (() => {
                  const sorted = [...(selectedStaff.payslips || [])].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
                  const totalPages = Math.ceil(sorted.length / staffDetailPageSize) || 1;
                  const page = Math.min(Math.max(1, payslipPage), totalPages);
                  const paginated = sorted.slice((page - 1) * staffDetailPageSize, page * staffDetailPageSize);
                  return (
                    <div>
                      <div className="space-y-3">
                        {paginated.map(ps => (
                          <div key={ps.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center text-xs">
                            <div>
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-emerald-600" />
                                <span className="font-bold text-slate-900">بطاقة أجر شهر {ps.month}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                                الصافي: {ps.netSalary.toFixed(2)} د.ت / أُصدرت بتاريخ {ps.issueDate}
                              </p>
                            </div>

                            <button
                              onClick={() => setPrintedPayslip(ps)}
                              className="px-3 py-1.5 bg-slate-900 text-white font-bold rounded-lg text-[10px] flex items-center gap-1.5 cursor-pointer"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              عرض وطباعة
                            </button>
                          </div>
                        ))}
                      </div>
                      {sorted.length > staffDetailPageSize && (
                        <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-100">
                          <button onClick={() => setPayslipPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">◀ السابق</button>
                          <span className="text-[10px] font-bold text-slate-500">صفحة {page} من {totalPages}</span>
                          <button onClick={() => setPayslipPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default">التالي ▶</button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

            </div>
          ) : (

              <div className="lg:col-span-2 p-12 bg-white rounded-3xl border border-dashed border-slate-300 text-center text-slate-400 font-bold text-sm">
                                         
                           
                           اختر موظف من القائمة لمعاينة ملفه الشخصي وكشف الأجر.
                          </div>
            
          )}

        </div>
      )}

       {/* SUB TAB 2: POINTAGE CALENDRIER */}
       {activeSubTab === 'pointage' && (
         <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-6 no-print">
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
             <div>
               <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                 <CheckSquare className="h-5 w-5 text-[#257C86]" />
                 سجل الحضور والغياب الشهري
               </h3>
               <p className="text-xs text-slate-500">اختر الشهر ثم اضغط على يوم لعرض وتسجيل الحضور.</p>
             </div>
 
             <div className="flex items-center gap-3">
               <label className="text-xs font-bold text-slate-600">الشهر:</label>
<select value={calendarMonth} onChange={(e) => { setSelectedCalendarDay(null); setCalendarMonth(Number(e.target.value)); }} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer">
                  {Object.values(MONTH_BY_CALENDAR_INDEX).map((label, idx) => <option key={idx} value={idx}>{label}</option>)}
                </select>
               <select value={calendarYear} onChange={(e) => { setSelectedCalendarDay(null); setCalendarYear(Number(e.target.value)); }} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer">
                 {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
               </select>
             </div>
           </div>
 
           {/* Calendar Grid */}
           <div>
             <div className="grid grid-cols-7 gap-1 text-center mb-2">
               {['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((d, i) => (
                 <div key={i} className={`text-xs font-bold py-2 rounded-lg ${i === 0 || i === 6 ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-700'}`}>{d}</div>
               ))}
             </div>
             {(() => {
               const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay();
               const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
               const cells: React.ReactNode[] = [];
               for (let i = 0; i < firstDayOfMonth; i++) cells.push(<div key={`empty-${i}`} className="h-20" />);
               for (let day = 1; day <= daysInMonth; day++) {
                 const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                 const dayOfWeek = new Date(calendarYear, calendarMonth, day).getDay();
                 const isSunday = dayOfWeek === 0;
                 const dayTs = timesheets.filter(t => t.date === dateStr);
                 const presentCount = dayTs.filter(t => t.status === 'present').length;
                 const absentCount = dayTs.filter(t => t.status === 'absent').length;
                 const retardCount = dayTs.filter(t => t.status === 'retard').length;
                 const congeCount = dayTs.filter(t => t.status === 'conge').length;
                 const isSelected = selectedCalendarDay === day;
                 cells.push(
                   <button key={day} type="button" onClick={() => { setSelectedCalendarDay(day); setPointageDate(dateStr); }} className={`h-20 rounded-xl border text-xs flex flex-col items-center justify-center gap-0.5 cursor-pointer transition ${isSunday ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-200 hover:bg-[#F2F8F9]'} ${isSelected ? 'ring-2 ring-[#257C86] bg-[#F2F8F9]' : ''}`}>
                     <span className={`font-black ${isSunday ? 'text-slate-400' : 'text-slate-900'}`}>{day}</span>
                     {presentCount > 0 && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded-full">{presentCount}✓</span>}
                     {absentCount > 0 && <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded-full">{absentCount}✕</span>}
                     {retardCount > 0 && <span className="text-[9px] bg-[#E0EFF1] text-[#17555F] px-1 rounded-full">{retardCount}⏱</span>}
                     {congeCount > 0 && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded-full">{congeCount}🏖</span>}
                     {!presentCount && !absentCount && !retardCount && !congeCount && day <= new Date().getDate() && calendarMonth === new Date().getMonth() && calendarYear === new Date().getFullYear() && <span className="text-[9px] text-slate-400">—</span>}
                   </button>
                 );
               }
                return <div className="grid grid-cols-7 gap-1">{cells}</div>;
              })()}
            </div>

            {selectedCalendarDay && (
             <>
               <div className="border-t border-slate-200 pt-4">
                 <h4 className="text-sm font-black text-slate-900 mb-3">تسجيل الحضور ليوم {selectedCalendarDay} {MONTH_BY_CALENDAR_INDEX[calendarMonth] || ''} {calendarYear}</h4>
                 <div className="overflow-x-auto">
                   <table className="w-full text-right text-xs">
                     <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
<tr>
                          <th className="p-3">الموظف / الأستاذ</th>
                          <th className="th-role p-3">الوظيفة / المادة</th>
                           <th className="p-3 text-center">الحالة</th>
                           <th className="p-3 text-center">ساعات إضافية ⏱</th>
                           <th className="p-3">ملاحظة</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
{staff.map(st => {
                           const currentP = dailyPointageState[st.id] || DEFAULT_DAY_POINTAGE;
                           const seances = getStaffSeancesForDate(st, pointageDate);
                           const roleLabel = st.role === 'enseignant' ? (st.subjects?.join(', ') || STAFF_ROLE_LABELS[st.role]) : (STAFF_ROLE_LABELS[st.role] || st.role);

                           if (seances.length > 0) {
                             return seances.map(slot => {
                               const timeKey = `${slot.startTime} - ${slot.endTime}`;
                               const sp = currentP.seances?.[timeKey] || { status: 'present', extraHours: 0 };
                               const isExtra = !!slot.isExtra;
                               const autoExtra = isExtra ? seanceHours(slot) : 0;
                               const effExtra = sp.extraHours > 0 ? sp.extraHours : autoExtra;
                               return (
                                 <tr key={`${st.id}_${timeKey}`} className="hover:bg-slate-50/70 transition">
                                   <td className="p-3">
                                     <p className="font-black text-slate-900">{st.firstName} {st.lastName}</p>
                                     <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold text-[#257C86] bg-[#F2F8F9] border border-[#C3E0E4]/60 rounded-md px-1.5 py-0.5 mt-0.5">
                                       {timeKey}
                                       {isExtra && (
                                         <span className="text-[9px] font-black text-purple-700 bg-purple-50 border border-purple-200 rounded px-1 py-px not-italic">ساعات إضافية</span>
                                       )}
                                     </span>
                                   </td>
                                   <td className="p-3"><span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[11px] uppercase">{roleLabel}</span></td>
                                   <td className="p-3 text-center">
                                     <div className="flex justify-center items-center gap-1">
                                       <button type="button" onClick={() => handleSetSeanceStatus(st.id, timeKey, 'present')} className={`px-2 py-1 rounded-lg font-extrabold text-[10px] transition cursor-pointer ${sp.status === 'present' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50'}`}>✓</button>
                                       <button type="button" onClick={() => handleSetSeanceStatus(st.id, timeKey, 'absent')} className={`px-2 py-1 rounded-lg font-extrabold text-[10px] transition cursor-pointer ${sp.status === 'absent' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-red-50'}`}>✕</button>
                                       <button type="button" onClick={() => handleSetSeanceStatus(st.id, timeKey, 'retard')} className={`px-2 py-1 rounded-lg font-extrabold text-[10px] transition cursor-pointer ${sp.status === 'retard' ? 'bg-[#257C86] text-white' : 'bg-slate-100 text-slate-600 hover:bg-[#F2F8F9]'}`}>⏱</button>
                                       <button type="button" onClick={() => handleSetSeanceStatus(st.id, timeKey, 'conge')} className={`px-2 py-1 rounded-lg font-extrabold text-[10px] transition cursor-pointer ${sp.status === 'conge' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-50'}`}>🏖</button>
                                     </div>
                                   </td>
                                   <td className="p-3 text-center">
                                     <input
                                       type="number" min={0} step="0.5" value={effExtra || ''}
                                       onChange={(e) => handleSetSeanceExtraHours(st.id, timeKey, e.target.value)}
                                       placeholder="0"
                                       className="w-20 px-2 py-1 text-center bg-[#F2F8F9] border border-[#C3E0E4] rounded-lg text-xs font-mono font-black text-[#14464E] focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                                     />
                                   </td>
                                   <td className="p-3"><input type="text" placeholder="..." value={currentP.notes} onChange={(e) => handleSetNotes(st.id, e.target.value)} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px]" /></td>
                                 </tr>
                               );
                             });
                           }

                           return (
                              <tr key={st.id} className="hover:bg-slate-50/70 transition">
                                <td className="p-3 font-black text-slate-900">{st.firstName} {st.lastName}</td>
                                <td className="p-3"><span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[11px] uppercase">{roleLabel}</span></td>
                               <td className="p-3 text-center">
                                 <div className="flex justify-center items-center gap-1">
                                   <button type="button" onClick={() => handleSetStatus(st.id, 'present')} className={`px-2 py-1 rounded-lg font-extrabold text-[10px] transition cursor-pointer ${currentP.status === 'present' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50'}`}>✓</button>
                                   <button type="button" onClick={() => handleSetStatus(st.id, 'absent')} className={`px-2 py-1 rounded-lg font-extrabold text-[10px] transition cursor-pointer ${currentP.status === 'absent' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-red-50'}`}>✕</button>
                                   <button type="button" onClick={() => handleSetStatus(st.id, 'retard')} className={`px-2 py-1 rounded-lg font-extrabold text-[10px] transition cursor-pointer ${currentP.status === 'retard' ? 'bg-[#257C86] text-white' : 'bg-slate-100 text-slate-600 hover:bg-[#F2F8F9]'}`}>⏱</button>
                                   <button type="button" onClick={() => handleSetStatus(st.id, 'conge')} className={`px-2 py-1 rounded-lg font-extrabold text-[10px] transition cursor-pointer ${currentP.status === 'conge' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-50'}`}>🏖</button>
 </div>
                                </td>
                                <td className="p-3 text-center">
                                  <input
                                    type="number" min={0} step="0.5" value={currentP.extraHours || ''}
                                    onChange={(e) => handleSetHours(st.id, 'extraHours', e.target.value)}
                                    placeholder="0"
                                    className="w-20 px-2 py-1 text-center bg-[#F2F8F9] border border-[#C3E0E4] rounded-lg text-xs font-mono font-black text-[#14464E] focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                                  />
                                </td>
                                <td className="p-3"><input type="text" placeholder="..." value={currentP.notes} onChange={(e) => handleSetNotes(st.id, e.target.value)} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px]" /></td>
                              </tr>
                           );
                         })}
                     </tbody>
                   </table>
                 </div>
                 <div className="pt-3 flex justify-end">
                    <button onClick={handleSaveDailyPointage} className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />حفظ</button>
                 </div>
               </div>
             </>
           )}
         </div>
       )}

{/* CREATE / EDIT STAFF MODAL */}
      <AnimatePresence>
        {isStaffModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden my-8 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#3A93A0]" />
                  <h3 className="text-lg font-black">
                    {editingStaffId ? 'تعديل بيانات موظف / أستاذ' : 'تسجيل موظف أو أستاذ جديد'}
                  </h3>
                </div>

                <button 
                  onClick={() => setIsStaffModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveStaff} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">الاسم الأول *</label>
                    <input 
                      type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} onBlur={(e) => setFirstName(capitalizeFirst(e.target.value))}
                      placeholder="مثال: مراد"
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">اللقب *</label>
                    <input 
                      type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} onBlur={(e) => setLastName(capitalizeFirst(e.target.value))}
                      placeholder="مثال: المنصوري"
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">الصفة والمهنة *</label>
                  <select
                    value={role} onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <option value="enseignant">أستاذ / مدرس</option>
                    <option value="encadrant">مشرف مؤطر</option>
                    <option value="administration">إداري</option>
                    <option value="agent_entretien">عامل نظافة وتنسيق</option>
                    <option value="cuisinier">طباخ / مسؤول مطعم</option>
                    <option value="chauffeur_bus">سائق الحافلة</option>
                    <option value="autre">صفة أخرى</option>
                  </select>
                </div>

                {/* SUBJECT SELECTION FOR TEACHERS */}
                {role === 'enseignant' && (
                  <div className="space-y-3 p-4 bg-[#F2F8F9]/60 rounded-2xl border border-[#C3E0E4]">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-black text-[#103840] block flex items-center gap-1">
                        <BookOpen className="h-4 w-4 text-[#257C86]" />
                        مواد الأستاذ (اختيار مادة أو أكثر):
                      </label>
                      
                      <button
                        type="button"
                        onClick={() => setIsAddingSubject(!isAddingSubject)}
                        className="text-[11px] font-bold text-[#17555F] hover:text-[#103840] bg-[#E0EFF1] px-2 py-0.5 rounded cursor-pointer"
                      >
                        إضافة مادة جديدة
                      </button>
                    </div>

                    {isAddingSubject && (
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={newSubjectInput}
                          onChange={(e) => setNewSubjectInput(e.target.value)}
                          placeholder="اسم المادة جديدة..."
                          className="flex-1 px-3 py-1.5 bg-white border border-[#A0CBCF] rounded-xl text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleAddSubject}
                          className="px-3 py-1.5 bg-[#257C86] text-white font-bold text-xs rounded-xl cursor-pointer"
                        >
                          إضافة
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {availableSubjects.map((sub) => {
                        const isSelected = selectedSubjects.includes(sub);
                        return (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => toggleSubjectSelection(sub)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#257C86] text-white border-[#257C86] shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {isSelected ? '✓ ' : ''}{sub}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">رقم الهاتف * (8 أرقام)</label>
                    <input 
                      type="text" required value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="98765432"
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono" maxLength={8}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">رقم CIN * (8 أرقام)</label>
                    <input 
                      type="text" required value={cin} onChange={(e) => setCin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="08765432"
                      maxLength={8}
                      pattern="\d{8}"
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">الراتب الأساسي (د.ت) *</label>
                    <input 
                      type="number" required value={baseSalary} onFocus={(e) => e.target.select()} onChange={(e) => setBaseSalary(Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold font-mono text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">مبلغ اقتطاع الضمان الاجتماعي CNSS (د.ت)</label>
                    <input 
                      type="number" value={cnssAmount} onFocus={(e) => e.target.select()} onChange={(e) => setCnssAmount(Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold font-mono text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">رقم معرف CNSS</label>
                  <input 
                    type="text" value={cnssNumber} onChange={(e) => setCnssNumber(e.target.value)}
                    placeholder="12345678-00"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono"
                  />
                </div>

                <div>
                    <h4 className="text-xs font-black text-slate-800 mb-2 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-[#257C86]" />
                      التوقيت الأسبوعي — يبدأ من 08:00 إلى 12:00 ومن 14:00 إلى 18:00
                    </h4>
                    <div className="space-y-2">
                      {WEEKDAYS.map(day => {
                        const idx = scheduleForm.findIndex(s => s.day === day);
                        const slots = idx >= 0 ? scheduleForm[idx].slots : [];
                        return (
                          <div key={day} className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 p-2">
                            <span className="text-xs font-bold text-slate-700 w-20 shrink-0">{day}</span>
                            <div className="flex-1 space-y-1">
                              {slots.length === 0 && (
                                <p className="text-[11px] text-slate-400 italic">راحة (يوم عطلة)</p>
                              )}
                              {slots.map((slot, si) => (
                                <input
                                  key={si}
                                  type="text"
                                  value={slot}
                                  onChange={(e) => {
                                    const nxt = [...slots];
                                    nxt[si] = e.target.value;
                                    updateDaySlots(day, nxt);
                                  }}
                                  placeholder="مثال: 08:00 - 12:00"
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono font-bold"
                                />
                              ))}
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => updateDaySlots(day, [...slots, '08:00 - 12:00'])}
                                className="text-[10px] text-emerald-600 hover:bg-emerald-50 rounded-lg px-2 py-1 font-bold cursor-pointer border border-emerald-200"
                              >
                                حصة
                              </button>
                              <button
                                type="button"
                                onClick={() => updateDaySlots(day, slots.slice(0, -1))}
                                className="text-[10px] text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 font-bold cursor-pointer border border-red-200"
                              >
                                − إزالة
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsStaffModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl cursor-pointer"
                  >
                    حفظ الموظف / الأستاذ
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PAYSLIP GENERATION MODAL */}
      <AnimatePresence>
        {generatingPayslipStaff && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#3A93A0]" />
                  <h3 className="text-lg font-black">إعداد بطاقة الأجر</h3>
                </div>

                <button 
                  onClick={() => setGeneratingPayslipStaff(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleGeneratePayslip} className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">الشهر وسنة الراتب *</label>
                  <div className="flex gap-2">
                    <select
                      required value={payMonthLabel} onChange={(e) => setPayMonthPart(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                    >
                      {Object.values(MONTH_BY_CALENDAR_INDEX).map((label) => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </select>
                    <select
                      required value={payYear} onChange={(e) => setPayYear(e.target.value)}
                      className="w-28 px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border text-xs">
                  <p className="text-slate-500">الراتب الأساسي:</p>
                  <p className="text-lg font-black text-slate-900 font-mono">{generatingPayslipStaff.baseSalary || generatingPayslipStaff.salary || 850} د.ت</p>
                </div>

<div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">المنحة / الإضافة د.ت</label>
                      <input 
                        type="number" value={bonusAmount} onFocus={(e) => e.target.select()} onChange={(e) => setBonusAmount(Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                        className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold text-emerald-700"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">ثمن الساعة الإضافية د.ت</label>
                      <input 
                        type="number" min="0" value={extraHourRate} onFocus={(e) => e.target.select()} onChange={(e) => setExtraHourRate(Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                        className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold text-purple-700"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1">مبلغ اقتطاع الضمان الاجتماعي CNSS (للمعلومة فقط - لا يخصم) د.ت</label>
                      <input 
                        type="number" value={fixedCnssAmount} onFocus={(e) => e.target.select()} onChange={(e) => setFixedCnssAmount(Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                        className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold font-mono"
                      />
                    </div>
                  </div>

                {(() => {
                  const att = getStaffMonthlyAttendance(generatingPayslipStaff.id, payMonth);
                  const base = generatingPayslipStaff.baseSalary || generatingPayslipStaff.salary || 850;
                  const autoDed = ((att?.daysAbsent || 0) + (att?.daysRetard || 0) * 0.5) * (base / 30);
                  return (
                    <div className="p-3 bg-red-50/60 rounded-2xl border border-red-200 text-xs space-y-2">
                      <div className="flex justify-between text-slate-600">
                        <span className="font-bold">سجل الحضور الشهري:</span>
                        <span className="font-mono font-bold">
                          حضر {att?.daysPresent ?? 0} ✓ / غياب {att?.daysAbsent ?? 0} ✕ / تأخر {att?.daysRetard ?? 0} ⏱
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-500 font-bold">
                        <span>خصم الغياب:</span>
                        <span className="font-mono text-red-600">-{autoDed.toFixed(2)} د.ت</span>
                      </div>
                      <div className="flex justify-between text-purple-700 font-bold">
                        <span>الساعات الإضافية:</span>
                        <span className="font-mono">{((manualExtraHours !== null ? manualExtraHours : (att?.extraHours ?? 0))).toFixed(1)} ساعة</span>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">الساعات الإضافية (يدوي):</label>
                        <input
                          type="number" min="0" step="0.5"
                          value={manualExtraHours === null ? '' : manualExtraHours}
                          placeholder={`تلقائي: ${((att?.extraHours ?? 0)).toFixed(1)} ساعة`}
                          onChange={(e) => setManualExtraHours(e.target.value === '' ? null : Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl text-xs font-bold font-mono text-purple-700"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1">خصم الغياب (يدوي):</label>
                        <input
                          type="number" min="0"
                          value={manualAbsenceDeduction === null ? '' : manualAbsenceDeduction}
                          placeholder={`تلقائي: ${autoDed.toFixed(2)} د.ت`}
                          onChange={(e) => setManualAbsenceDeduction(e.target.value === '' ? null : Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl text-xs font-bold font-mono text-red-700"
                        />
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const base = generatingPayslipStaff.baseSalary || generatingPayslipStaff.salary || 850;
                  const att = getStaffMonthlyAttendance(generatingPayslipStaff.id, payMonth);
                  const extraH = manualExtraHours !== null ? manualExtraHours : (att?.extraHours || 0);
                  const extraAmt = extraH * (extraHourRate || 0);
                  const autoAbsenceDed = ((att?.daysAbsent || 0) + (att?.daysRetard || 0) * 0.5) * (base / 30);
                  const absenceDed = manualAbsenceDeduction !== null ? manualAbsenceDeduction : autoAbsenceDed;
                  const advDed = getApprovedAdvancesForMonth(generatingPayslipStaff, payMonth).reduce((s, a) => s + a.amount, 0);
                  const netPrev = base + bonusAmount + extraAmt - absenceDed - advDed;
                  const alreadyValidated = !!(generatingPayslipStaff.payslips || []).find(p => p.month === payMonth);
                  return (
                    <div className="border border-slate-300 rounded-xl overflow-hidden text-xs no-print">
                      <div className="px-3 py-2 bg-slate-900 text-white font-black text-xs">معاينة بطاقة الأجر — {payMonth}</div>
                      <div className="divide-y divide-slate-200 bg-white">
                        <div className="px-3 py-2 flex justify-between">
                          <span>الراتب الأساسي:</span>
                          <span className="font-mono font-bold">{base} د.ت</span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-emerald-700 font-bold">
                          <span>المنح والمكافآت:</span>
                          <span className="font-mono">+{bonusAmount} د.ت</span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-purple-700 font-bold">
                          <span>الساعات الإضافية:</span>
                          <span className="font-mono">+{extraAmt.toFixed(2)} د.ت</span>
                        </div>
                        <div className="px-3 py-2 flex justify-between text-slate-500 font-bold">
                          <span>اقتطاع CNSS:</span>
                          <span className="font-mono">{fixedCnssAmount.toFixed(2)} د.ت</span>
                        </div>
                        {advDed > 0 && (
                          <div className="px-3 py-2 flex justify-between text-red-600 font-bold">
                            <span>خصم سلفة مأخوذة:</span>
                            <span className="font-mono">-{advDed.toFixed(2)} د.ت</span>
                          </div>
                        )}
                        {absenceDed > 0 && (
                          <div className="px-3 py-2 flex justify-between text-red-600 font-bold">
                            <span>خصم الغياب:</span>
                            <span className="font-mono">-{absenceDed.toFixed(2)} د.ت</span>
                          </div>
                        )}
                        <div className="px-3 py-2.5 bg-slate-900 text-white flex justify-between text-sm font-black">
                          <span>الصافي الواجب دفعه:</span>
                          <span className="font-mono text-[#3A93A0]">{netPrev.toFixed(2)} د.ت</span>
                        </div>
                      </div>
                      {alreadyValidated && (
                        <div className="px-3 py-2 bg-[#F2F8F9] text-[#14464E] border-t border-[#C3E0E4] font-bold">
                          ⚠️ بطاقة الأجر لشهر {payMonth} موجودة مسبقاً — عند التحقق لن تُضاف للمالية مجدداً، سيتم فقط عرضها وطباعتها.
                        </div>
                      )}
                    </div>
                  );
                })()}


                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setGeneratingPayslipStaff(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer"
                  >
                    التحقق وإضافة إلى المالية ثم الطباعة 🖨️
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRINTABLE PAYSLIP TEMPLATE MODAL */}
      <AnimatePresence>
        {printedPayslip && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden my-8 flex flex-col max-h-[90vh]"
            >
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center no-print">
                <span className="font-bold text-sm">كشف راتب رسمي</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    طباعة بطاقة الأجر 🖨️
                  </button>
                  <button
                    onClick={() => setPrintedPayslip(null)}
                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* PAYSLIP PRINTABLE HTML */}
              <div className="print-area print-one p-6 sm:p-8 bg-white text-slate-900 rounded-2xl w-full mx-auto text-xs font-sans flex flex-col">
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-950">Teen Center — Bulletin de Paie</h2>
                    <p className="text-xs text-slate-500 font-bold">كشف راتب شهر: {printedPayslip.month}</p>
                  </div>
                  <div className="text-left font-mono font-bold text-xs bg-slate-100 p-2 rounded">
                    التاريخ: {printedPayslip.issueDate}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded border">
                    <p className="text-[10px] text-slate-400 font-bold">اسم الموظف(ة):</p>
                    <p className="font-black text-slate-900 text-sm">
                      {selectedStaff?.firstName} {selectedStaff?.lastName} ({STAFF_ROLE_LABELS[selectedStaff?.role || 'autre']})
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">رقم الـ CNSS: {selectedStaff?.cnssNumber || 'غير متاح'}</p>
                  </div>

                  <div className="border border-slate-300 rounded divide-y divide-slate-200">
                    <div className="p-2 flex justify-between">
                      <span>الراتب الأساسي:</span>
                      <span className="font-mono font-bold">{printedPayslip.baseSalary} د.ت</span>
                    </div>

                    <div className="p-2 flex justify-between text-emerald-700 font-bold">
                      <span>المنح والمكافآت:</span>
                      <span className="font-mono">+{printedPayslip.bonus} د.ت</span>
                    </div>

                    {/* Attendance / hours summary from pointage */}
                    <div className="p-2 flex justify-between text-slate-600">
                      <span>سجل الحضور الشهري:</span>
                      <span className="font-mono font-bold">
                        حضر {printedPayslip.daysPresent ?? 0} ✓ / غياب {printedPayslip.daysAbsent ?? 0} ✕ / تأخر {printedPayslip.daysRetard ?? 0} ⏱
                      </span>
                    </div>
                    {(() => {
                      const extraH = printedPayslip.extraHours ?? 0;
                      const extraRate = printedPayslip.extraHourRate ?? 0;
                      const extraAmt = printedPayslip.extraHoursAmount ?? (extraH * extraRate);
                      return (
                        <div className="p-2 flex justify-between text-purple-700 font-bold">
                          <span>الساعات الإضافية:</span>
                          <span className="font-mono">+{extraAmt.toFixed(2)} د.ت</span>
                        </div>
                      );
                    })()}

                    <div className="p-2 flex justify-between text-slate-500 font-bold">
                      <span>اقتطاع CNSS:</span>
                      <span className="font-mono">{printedPayslip.cnssDeduction.toFixed(2)} د.ت</span>
                    </div>
                    {!!printedPayslip.advanceDeducted && (
                      <div className="p-2 flex justify-between text-red-600 font-bold">
                        <span>خصم سلفة مأخوذة:</span>
                        <span className="font-mono">-{printedPayslip.advanceDeducted.toFixed(2)} د.ت</span>
                      </div>
                    )}

                    <div className="p-3 bg-slate-900 text-white flex justify-between text-sm font-black">
                      <span>الصافي الواجب دفعه:</span>
                      <span className="font-mono text-[#3A93A0]">{printedPayslip.netSalary.toFixed(2)} د.ت</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-300">
                  <div className="flex justify-between items-center text-[10px] text-slate-500 mb-8">
                    <p>توقيع الموظف المستلم</p>
                    <p className="font-bold text-slate-900">إدارة مركز Teen Center</p>
                  </div>
                  <div className="grid grid-cols-2 gap-10">
                    <div className="text-center">
                      <div className="border-b-2 border-dotted border-slate-400 h-20 mb-1"></div>
                      <p className="text-[10px] text-slate-500 font-bold">توقيع الموظف المستلم</p>
                    </div>
                    <div className="text-center">
                      <div className="border-b-2 border-dotted border-slate-400 h-20 mb-1"></div>
                      <p className="text-[10px] text-slate-500 font-bold">ختم وإمضاء إدارة المركز</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LEAVE REQUEST MODAL */}
      <AnimatePresence>
        {isLeaveModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-[#3A93A0]" />
                  <h3 className="text-lg font-black">تقديم طلب رخصة / إجازة</h3>
                </div>

                <button 
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveLeaveRequest} className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">نوع الرخصة *</label>
                  <select
                    value={leaveType} onChange={(e) => setLeaveType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                  >
                    <option value="Annuel">إجازة سنوية</option>
                    <option value="Maladie">رخصة مرضية</option>
                    <option value="Exceptionnel">رخصة استثنائية</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">تاريخ البداية *</label>
                    <DateField 
                      required value={leaveStartDate} onChange={(e) => setLeaveStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">تاريخ النهاية *</label>
                    <DateField 
                      required value={leaveEndDate} onChange={(e) => setLeaveEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">السبب والتبرير *</label>
                  <textarea 
                    required value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="سبب طلب الغياب..."
                    className="w-full p-3 bg-slate-50 border rounded-xl text-xs font-semibold h-20"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button" onClick={() => setIsLeaveModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-xs rounded-xl shadow-md cursor-pointer"
                  >
                    إرسال الطلب للمصادقة
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DEMANDE AVANCE MODAL */}
      <AnimatePresence>
        {isAdvanceModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8 flex flex-col max-h-[90vh]"
          >
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#3A93A0]" />
                <h3 className="text-lg font-black">طلب سلفة</h3>
              </div>
              <button 
                onClick={() => setIsAdvanceModalOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdvanceRequest} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">المبلغ (د.ت) *</label>
                <input 
                  type="number" required min="1" max={selectedStaff?.baseSalary || 850} value={advanceAmount} onFocus={(e) => e.target.select()} onChange={(e) => setAdvanceAmount(Math.max(0, Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0))}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold font-mono text-red-700"
                />
                <p className="text-[10px] text-slate-400 font-bold mt-1">الحد الأقصى: {selectedStaff?.baseSalary || 850} د.ت (الراتب الأساسي)</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">تاريخ الطلب *</label>
                <DateField 
                  value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">السبب *</label>
                <textarea
                  value={advanceReason} onChange={(e) => setAdvanceReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold min-h-[60px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsAdvanceModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-bold text-xs cursor-pointer">إلغاء</button>
                <button type="submit" className="px-4 py-2 bg-[#257C86] text-white rounded-xl font-bold text-xs cursor-pointer">إرسال طلب السلفة</button>
              </div>
            </form>
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* STAFF DELETE CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={!!staffToDelete}
        title="حذف الموظف / الأستاذ"
        message={
          staffToDelete ? (
            <>
              هل أنت متأكد تماماً من حذف الموظف/الأستاذ <strong>{staffToDelete.firstName} {staffToDelete.lastName}</strong> من المنظومة نهائياً؟
              <p className="mt-2 text-[11px] text-slate-400 font-bold">سيتم حذف ملفه وبياناته الشخصية وجميع سجلاته المرتبطة (الأجور، الطلبات، الحضور).</p>
            </>
          ) : undefined
        }
        confirmLabel="نعم، احذف الموظف"
        onConfirm={() => {
          if (staffToDelete) {
            onUpdateStaff(staff.filter(st => st.id !== staffToDelete.id));
                if (selectedStaff?.id === staffToDelete.id) setSelectedStaffId(null);
            setStaffToDelete(null);
            toast.success(`تم حذف الموظف/الأستاذ (${staffToDelete.firstName} ${staffToDelete.lastName}) نهائياً.`);
          }
        }}
        onCancel={() => setStaffToDelete(null)}
      />

    </div>
  );
}
