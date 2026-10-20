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
  CalendarRange
} from 'lucide-react';
import { Salle, Formation, SALLE_EQUIPMENT_OPTIONS } from '../types';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

// Gestion des salles (إدارة القاعات) pour les centres qui exploitent le module
// التكوينات والدورات. Même design system que les autres modules : fond crème,
// en-tête slate + accent brand, cartes rounded-3xl, modale motion, ConfirmDialog.
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
    const capacity = Math.max(0, Math.round(Number(formCapacity) || 0));
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

  // Nombre de séances hebdomadaires utilisant la salle (info ; le schedule
  // stocke l'ID de la salle via FormationSeance.salle).
  const usageCount = (salleId: string): number =>
    (formations || []).reduce((acc, f) => acc + (Array.isArray(f.schedule)
      ? f.schedule.filter(se => se.salle === salleId).length
      : 0), 0);

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
            <span className="text-base font-black text-slate-900 leading-none">{salles.length}</span>
            <span className="text-[10px] font-bold text-slate-500">قاعة مسجَّلة</span>
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
            {filtered.map(salle => (
              <motion.div
                key={salle.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200/70 shadow-lg shadow-slate-900/5 p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                      <DoorOpen className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{salle.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">{usageCount(salle.id)} حصة تكوين بالأسبوع</p>
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
            ))}
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
              <form onSubmit={handleSave} className="p-5 space-y-3">
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
