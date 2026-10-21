import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  DoorOpen,
  Plus,
  Users,
  Wrench,
  Search,
  X,
  Check,
  Pencil,
  Trash2,
  CalendarRange,
  BarChart3,
  PieChart,
  TrendingUp,
  Award
} from 'lucide-react';
import { Salle, Formation, SALLE_EQUIPMENT_OPTIONS } from '../types';
import { computeSalleAnalytics } from '../utils/salleStats';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

// Gestion des salles (إدارة القاعات) pour les centres qui exploitent le module
// التكوينات والدورات. Même design system que les autres modules : fond crème,
// en-tête slate + accent brand, cartes rounded-3xl, modale motion, ConfirmDialog.
const DONUT_RADIUS = 52;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

interface SallesModuleProps {
  salles: Salle[];
  onCreateSalle?: (salle: Salle) => void;
  onUpdateSalle?: (salle: Salle) => void;
  onDeleteSalle?: (salleId: string) => void;
  // Formations du centre : la grille horaire peut occuper une salle — on
  // l'affiche ici à titre informatif (usage hebdomadaire par salle).
  formations?: Formation[];
  sidebarCollapsed?: boolean;
}

export default function SallesModule({
  salles,
  onCreateSalle,
  onUpdateSalle,
  onDeleteSalle,
  formations,
  sidebarCollapsed
}: SallesModuleProps) {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCapacity, setFormCapacity] = useState<string>('');
  const [formEquipment, setFormEquipment] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Salle | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return salles.filter(s => {
      if (!q) return true;
      if (s.name.toLowerCase().includes(q)) return true;
      const equipmentStr = Array.isArray(s.equipment) ? s.equipment.join(' ') : String((s as any).equipment || '');
      return equipmentStr.toLowerCase().includes(q);
    });
  }, [salles, search]);

  // Statistiques dérivées des formations : capacité, séances, équipements,
  // taux d'utilisation. Aucune donnée dupliquée en base.
  const analytics = useMemo(
    () => computeSalleAnalytics(salles, formations),
    [salles, formations]
  );

  const usageById = useMemo(() => {
    const map: Record<string, { sessions: number; students: number }> = {};
    analytics.usage.forEach(row => {
      map[row.salle.id] = { sessions: row.sessions, students: row.students };
    });
    return map;
  }, [analytics.usage]);

  const statCards = [
    { label: 'القاعات المسجَّلة', value: salles.length, icon: DoorOpen, tone: 'bg-brand-50 text-brand-700' },
    { label: 'الطاقة الإجمالية', value: analytics.totalCapacity, icon: Users, tone: 'bg-slate-100 text-slate-700' },
    { label: 'حصص مبرمجة', value: analytics.totalSessions, icon: CalendarRange, tone: 'bg-amber-50 text-amber-700' },
    { label: 'نسبة القاعات المستعملة', value: `${analytics.utilizationRate}%`, icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-700' }
  ];

  const capacityRows = useMemo(
    () => analytics.usage
      .slice()
      .sort((a, b) => (Number(b.salle.capacity) || 0) - (Number(a.salle.capacity) || 0)),
    [analytics.usage]
  );

  const openAddModal = () => {
    setEditingId(null);
    setFormName('');
    setFormCapacity('');
    setFormEquipment([]);
    setModalOpen(true);
  };

  // equipment est un tableau — on recharge les items exactement tels que
  // stockés (les anciens libellés libres restent cochés en extra).
  const openEditModal = (salle: Salle) => {
    const raw = salle.equipment as unknown;
    const items = Array.isArray(raw)
      ? raw.map(x => String(x).trim()).filter(Boolean)
      : String(raw || '').split(',').map(x => x.trim()).filter(Boolean);
    setEditingId(salle.id);
    setFormName(salle.name);
    setFormCapacity(salle.capacity ? String(salle.capacity) : '');
    setFormEquipment(items);
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    if (!name) {
      toast.error('اسم القاعة مطلوب.');
      return;
    }
    const duplicate = salles.some(s => s.id !== editingId && s.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
      toast.error('يوجد مسبقاً قاعة بهذا الاسم في هذا المركز.');
      return;
    }
    // La capacité peut être 0 (non renseignée) mais JAMAIS négative.
    const rawCapacity = String(formCapacity).trim();
    const parsedCapacity = rawCapacity === '' ? 0 : Number(rawCapacity);
    if (!Number.isFinite(parsedCapacity) || parsedCapacity < 0) {
      toast.error('السعة الاستيعابية لا يمكن أن تكون سالبة.');
      return;
    }
    const capacity = Math.round(parsedCapacity);
    const record: Salle = {
      id: editingId || `salle_${crypto.randomUUID()}`,
      name,
      capacity,
      equipment: [...formEquipment]
    };
    if (editingId) {
      onUpdateSalle?.(record);
      toast.success('تم تحديث بيانات القاعة.');
    } else {
      onCreateSalle?.(record);
      toast.success('تمت إضافة القاعة بنجاح.');
    }
    setModalOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteSalle?.(deleteTarget.id);
    toast.success('تم حذف القاعة بنجاح.');
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen bg-[#FCFAF6]" dir="rtl">
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {/* Module Banner — même style que التكوينات والدورات */}
        <div className="bg-white border border-slate-200/70 p-6 rounded-3xl shadow-lg shadow-slate-900/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-brand-600/[0.06] text-brand-700 text-xs font-bold rounded-lg border border-brand-600/20">
                القاعات
              </span>
              <span className="text-xs text-slate-400 font-bold">Gestion des salles</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
              <DoorOpen className="h-6 w-6 text-brand-600" />
              إدارة القاعات
            </h2>
            <p className="text-slate-500 text-xs mt-1">
              إضافة وتعديل وحذف القاعات — تُوظَّف في جدول حصص التكوين مع التحقق من التوفر.
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            إضافة قاعة
          </button>
        </div>

        {/* Statistiques — cartes animées (même langage visuel que les modules) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
                className="bg-white rounded-2xl border border-slate-200/70 shadow-lg shadow-slate-900/5 p-4 flex items-center gap-3"
              >
                <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${card.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 truncate">{card.label}</p>
                  <p className="text-xl font-black text-slate-900 leading-tight">{card.value}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Graphiques — capacité, taux d'utilisation et équipements */}
        {salles.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-5">
            {/* Capacité par salle */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
              className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 p-5"
            >
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-brand-600" />
                    الطاقة الاستيعابية
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                    سعة كل قاعة — متوسط {analytics.averageCapacity} مقعد
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-brand-50 border border-brand-100 text-brand-800 rounded-lg text-[10px] font-black shrink-0">
                  {salles.length} قاعة
                </span>
              </div>

              <div className="space-y-3">
                {capacityRows.slice(0, 8).map((row, index) => {
                  const capacity = Math.max(0, Number(row.salle.capacity) || 0);
                  const pct = Math.round((capacity / analytics.maxCapacity) * 100);
                  return (
                    <div key={row.salle.id}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-black text-slate-700 truncate">{row.salle.name}</span>
                        <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0">{capacity} مقعد</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 0.15 + index * 0.05, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-l from-brand-600 via-brand-500 to-brand-300"
                        />
                      </div>
                    </div>
                  );
                })}
                {capacityRows.length > 8 && (
                  <p className="text-[10px] font-bold text-slate-400">
                    + {capacityRows.length - 8} قاعة أخرى
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400">
                <span>المتوسط: {analytics.averageCapacity} مقعد / قاعة</span>
                <span>السعة الكلية: {analytics.totalCapacity} مقعد</span>
              </div>
            </motion.div>

            {/* Taux d'utilisation + top salles */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18, ease: 'easeOut' }}
              className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 p-5"
            >
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <PieChart className="h-4 w-4 text-brand-600" />
                استغلال القاعات
              </h3>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                القاعات المستعملة في جدول حصص التكوين
              </p>

              <div className="flex items-center gap-4 mt-3">
                <div className="relative w-28 h-28 shrink-0">
                  <svg viewBox="0 0 120 120" className="w-28 h-28 -rotate-90">
                    <circle
                      cx="60"
                      cy="60"
                      r={DONUT_RADIUS}
                      fill="none"
                      stroke="#E2E8F0"
                      strokeWidth="11"
                    />
                    <motion.circle
                      cx="60"
                      cy="60"
                      r={DONUT_RADIUS}
                      fill="none"
                      stroke="#257C86"
                      strokeWidth="11"
                      strokeLinecap="round"
                      strokeDasharray={DONUT_CIRCUMFERENCE}
                      initial={{ strokeDashoffset: DONUT_CIRCUMFERENCE }}
                      animate={{ strokeDashoffset: DONUT_CIRCUMFERENCE * (1 - analytics.utilizationRate / 100) }}
                      transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-900 leading-none">{analytics.utilizationRate}%</span>
                    <span className="text-[9px] font-bold text-slate-400 mt-1">قاعات مستعملة</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-brand-600" />
                      مستعملة
                    </span>
                    <span className="font-black text-slate-900">{analytics.usedSalles}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-slate-200" />
                      غير مستعملة
                    </span>
                    <span className="font-black text-slate-900">{salles.length - analytics.usedSalles}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-500">
                    {analytics.totalSessions} حصة موزَّعة على {analytics.usedSalles} قاعة
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-500 flex items-center gap-1.5 mb-2">
                  <Award className="h-3.5 w-3.5 text-amber-500" />
                  أكثر القاعات استخداماً
                </p>
                {analytics.topSalles.length === 0 ? (
                  <p className="text-[10px] font-bold text-slate-400">لا توجد حصص مبرمجة بعد.</p>
                ) : (
                  <div className="space-y-1.5">
                    {analytics.topSalles.map((row, index) => (
                      <div key={row.salle.id} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-5 h-5 rounded-lg bg-slate-100 border border-slate-200 text-[9px] font-black text-slate-500 flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-[10px] font-bold text-slate-700 truncate">{row.salle.name}</span>
                        </span>
                        <span className="text-[9px] font-black text-brand-700 shrink-0">
                          {row.sessions} حصة{row.students > 0 ? ` · ${row.students} تلميذ` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Taux de couverture des équipements */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.26, ease: 'easeOut' }}
              className="lg:col-span-12 bg-white rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-brand-600" />
                  التجهيزات الأكثر توفراً
                </h3>
                <span className="text-[10px] font-bold text-slate-400">
                  {analytics.totalEquipmentAssignments} تجهيز موزَّع
                </span>
              </div>

              {analytics.equipment.length === 0 ? (
                <p className="text-[10px] font-bold text-slate-400 mt-3">
                  لم تُحدَّد تجهيزات لأي قاعة بعد.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
                  {analytics.equipment.slice(0, 6).map((row, index) => {
                    const max = analytics.equipment[0]?.count || 1;
                    const pct = Math.round((row.count / Math.max(1, max)) * 100);
                    return (
                      <div key={row.name} className="bg-slate-50 border border-slate-200/70 rounded-2xl p-2.5">
                        <p className="text-[10px] font-black text-slate-700 truncate" title={row.name}>
                          {row.name}
                        </p>
                        <div className="flex items-end justify-between gap-1 mt-1">
                          <span className="text-lg font-black text-slate-900 leading-none">{row.count}</span>
                          <span className="text-[9px] font-bold text-slate-400">قاعة</span>
                        </div>
                        <div className="h-1 rounded-full bg-white overflow-hidden mt-1.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7, delay: 0.15 + index * 0.05, ease: 'easeOut' }}
                            className="h-full rounded-full bg-brand-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {analytics.equipment.length > 6 && (
                <p className="text-[10px] font-bold text-slate-400 mt-2">
                  + {analytics.equipment.length - 6} تجهيز آخر
                </p>
              )}
            </motion.div>
          </div>
        )}

        {/* Toolbar: search + stats (barre d'outils alignée) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو التجهيزات..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-600 transition"
            />
          </div>
          <div className="flex-1" />
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm px-4 py-2 flex items-center gap-2 h-9">
            <span className="text-base font-black text-slate-900 leading-none">{filtered.length}</span>
            <span className="text-[10px] font-bold text-slate-500">من {salles.length} قاعة</span>
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="p-10 text-center bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
            <DoorOpen className="h-8 w-8 text-brand-600 mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-400">
              {salles.length === 0 ? 'لا توجد قاعات بعد — أضف أول قاعة.' : 'لا توجد نتائج مطابقة للبحث.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((salle, index) => {
              const usage = usageById[salle.id] || { sessions: 0, students: 0 };
              return (
              <motion.div
                key={salle.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.04, ease: 'easeOut' }}
                whileHover={{ y: -3 }}
                className="bg-white rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                      <DoorOpen className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{salle.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">
                        {usage.sessions} حصة تكوين مبرمجة
                        {usage.students > 0 ? ` · ${usage.students} تلميذ` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditModal(salle)}
                      className="p-2 text-slate-400 hover:text-brand-700 hover:bg-brand-50 rounded-xl transition cursor-pointer"
                      title="تعديل"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(salle)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 border border-brand-100 text-brand-800 rounded-full text-[10px] font-black">
                    <Users className="h-3 w-3" />
                    السعة: {salle.capacity || 0}
                  </span>
                  {Array.isArray(salle.equipment) && salle.equipment.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {salle.equipment.map(item => (
                        <span
                          key={item}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-full text-[10px] font-bold"
                        >
                          <Wrench className="h-2.5 w-2.5 shrink-0" />
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </motion.div>
              );
            })}
          </div>
        )}

        {/* Add / edit modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <DoorOpen className="h-5 w-5 text-brand-500" />
                  <h3 className="text-sm font-black">{editingId ? 'تعديل القاعة' : 'إضافة قاعة جديدة'}</h3>
                </div>
                <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSave} noValidate className="p-5 space-y-3">
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-1">اسم القاعة *</label>
                  <input
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="مثال: قاعة A1"
                    autoFocus
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-1">السعة الاستيعابية</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={formCapacity}
                    onChange={e => setFormCapacity(e.target.value)}
                    placeholder="مثال: 30"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-600 mb-1">التجهيزات</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[...SALLE_EQUIPMENT_OPTIONS, ...formEquipment.filter(item => !SALLE_EQUIPMENT_OPTIONS.includes(item))].map(item => {
                      const checked = formEquipment.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() =>
                            setFormEquipment(prev =>
                              checked ? prev.filter(x => x !== item) : [...prev, item]
                            )
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold border transition cursor-pointer text-right ${
                            checked
                              ? 'bg-brand-50 border-brand-300 text-brand-800'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center shrink-0 ${
                              checked ? 'bg-brand-600 border-brand-600' : 'bg-white border-slate-300'
                            }`}
                          >
                            {checked && <Check className="h-2.5 w-2.5 text-white" />}
                          </span>
                          {item}
                        </button>
                      );
                    })}
                  </div>
                  {formEquipment.length > 0 && (
                    <p className="text-[10px] font-bold text-slate-500 mt-1.5">
                      المحدَّد: {formEquipment.length} من {SALLE_EQUIPMENT_OPTIONS.length}
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer"
                  >
                    {editingId ? 'حفظ التعديلات' : 'إضافة'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Delete confirmation */}
        <ConfirmDialog
          open={deleteTarget !== null}
          title="تأكيد حذف القاعة"
          message={deleteTarget ? `هل أنت متأكد من حذف القاعة ${deleteTarget.name} ؟` : ''}
          confirmLabel="حذف"
          cancelLabel="إلغاء"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </div>
  );
}
