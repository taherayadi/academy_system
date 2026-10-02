import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Plus, Check, Loader2, Lock, Layers } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '../ui';
import { MODULE_LABEL } from './constants';
import { getModuleCatalog, subscribeModuleCatalog } from '../../utils/moduleCatalogStore';
import type { DashboardApi } from './usePlatformDashboard';

type Flags = { isBasic?: boolean; isUnbilled?: boolean; isHidden?: boolean };

/** One on/off control of a module row. The pressed state is unmistakable:
 *  filled colour + ✓ when ON, plain outline when OFF, spinner while the
 *  toggle is being persisted (so « did it apply? » is never a guess). */
function FlagChip({ on, onCls, offCls, title, disabled, busy, onClick, children }: {
  on: boolean;
  onCls: string;
  offCls: string;
  title: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-busy={!!busy}
      disabled={disabled || busy}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-lg border transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${on ? onCls : offCls}`}
    >
      {busy
        ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
        : on && <Check aria-hidden="true" className="h-3 w-3" />}
      {children}
    </button>
  );
}

export default function PricingSection({ d }: { d: DashboardApi }) {
  const { priceYear, setPriceYear, priceYears, addSchoolYear, addingYear, nextSchoolYear, pricesLoading, priceList, setPriceList, savePrices, savingPrices } = d;
  const [showHidden, setShowHidden] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // ModuleCatalogProvider's children are memoized by element identity: a flag
  // toggle lands in the store but does NOT re-render this section on its own.
  // Subscribing here is what makes the chips flip the moment the API confirms.
  const catalog = useSyncExternalStore(subscribeModuleCatalog, getModuleCatalog);

  const modules = catalog.modules.map(m => ({
    key: m.key,
    name: m.labelAr || m.label,
    sub: m.label,
    isBasic: m.isBasic,
    isUnbilled: m.isUnbilled,
    isHidden: m.isHidden,
  }));
  // Le plan de base = les modules isBasic du catalogue (plus de liste en dur).
  const basicModules = modules.filter(m => m.isBasic && !m.isHidden);
  const baseTotal = basicModules.reduce((sum, m) => (
    sum + (m.isUnbilled ? 0 : Number(priceList[m.key]) || 0)
  ), 0);

  const toggleFlag = async (key: string, flags: Flags) => {
    if (pendingKey) return;
    setPendingKey(key);
    try {
      await d.updateModuleFlag(key, flags);
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <motion.div key="pricing" className="relative space-y-5">

      {/* Year selector — sélecteur compact : quelle que soit la taille
          de la liste des années, rien ne déborde et tout reste visible. */}
      <div className="rounded-3xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex-shrink-0">
              السنة الدراسية
            </span>
            <select
              value={priceYear}
              onChange={e => setPriceYear(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:border-accent-500 focus:ring-0 outline-none cursor-pointer min-w-[140px]"
            >
              {priceYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <SecondaryButton variant="dashed" onClick={addSchoolYear} disabled={addingYear}
            className="ms-auto text-xs sm:text-sm font-black whitespace-nowrap"
            title={`أنشئ ${nextSchoolYear} بتعريفات منسوخة من ${priceYears[priceYears.length - 1] || ''}`}
            icon={addingYear ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          >
            إضافة السنة الدراسية {nextSchoolYear}
          </SecondaryButton>
        </div>
      </div>

      {pricesLoading ? (
        <div className="flex items-center justify-center py-20 rounded-3xl bg-white border border-slate-200">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-accent-500" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-5">

          {/* Base plan card — driven by the isBasic flags of the catalog */}
          <div className="rounded-3xl bg-accent-500 text-white p-6 shadow-xl shadow-accent-500/25 relative overflow-hidden">
            <div className="absolute -top-16 -right-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-1.5">
                <Lock className="h-4 w-4 text-white/80" aria-hidden="true" />
                <span className="text-[11px] font-black text-white/80 uppercase tracking-[0.15em]">Le plan de base</span>
              </div>
              <h3 className="text-lg font-black mb-1">{basicModules.map(m => m.name).join(' + ') || '—'}</h3>
              <p className="text-xs text-white/70 font-semibold mb-5">
                مضمون دائمًا في كل اشتراك — عدّل قائمته من زر «أساسي» في جدول الوحدات.
              </p>
              <div className="flex items-end gap-2 mb-6">
                <span className="text-4xl font-black tracking-tight">{baseTotal}</span>
                <span className="text-xs font-bold text-white/70 pb-1.5">دينار/شهر</span>
              </div>
              <div className="space-y-2.5 text-xs font-bold">
                {basicModules.length === 0 && (
                  <div className="rounded-xl bg-white/10 border border-white/20 px-3.5 py-2.5 text-white/80">
                    لا توجد وحدة أساسية — أعد إضافة واحدة من الجدول.
                  </div>
                )}
                {basicModules.map(m => (
                  <div key={m.key} className={`flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 ${m.isUnbilled ? 'bg-white/10 border border-white/20' : 'bg-white/10'}`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <Layers className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate">{m.name}</span>
                    </span>
                    <span className="font-black flex-shrink-0">
                      {m.isUnbilled ? 'مشمول في الباقة' : `${priceList[m.key] ?? '—'} TND`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Module price editor */}
          <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-1">أسعار الوحدات الإضافية</h3>
                <p className="text-xs text-slate-500 font-semibold">
                  تُستخدم هذه التعريفات في الحساب التلقائي — سنة {priceYear}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHidden(v => !v)}
                className="text-xs font-black px-3 py-1.5 rounded-xl border border-slate-200 text-slate-500 hover:border-slate-400 transition"
              >
                {showHidden ? 'إخفاء المحذوفة' : 'عرض المحذوفة'}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {modules.map(m => {
                if (m.isHidden && !showHidden) return null;
                const busy = pendingKey === m.key;
                return (
                  <div key={m.key} data-module={m.key}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${m.isHidden ? 'opacity-60 border-dashed border-slate-300 bg-slate-50' : m.isBasic ? 'border-accent-500/30 bg-accent-500/[0.05]' : 'border-slate-200 bg-white hover:border-accent-500/30'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-black text-slate-800 flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{m.name}</span>
                        {m.isBasic && (
                          <span className="text-[11px] font-black text-accent-500 bg-accent-500/10 border border-accent-500/30 rounded-full px-1.5 py-px">أساسي</span>
                        )}
                        {m.isUnbilled && !m.isHidden && (
                          <span className="text-[11px] font-black text-accent-700 bg-accent-500/[0.06] border border-accent-500/20 rounded-full px-1.5 py-px">مشمول</span>
                        )}
                        {m.isHidden && (
                          <span className="text-[11px] font-black text-slate-400 border border-slate-300 rounded-full px-1.5 py-px">مخفي</span>
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500">{m.sub !== m.name ? m.sub : MODULE_LABEL(m.key)}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <FlagChip
                          on={m.isBasic}
                          busy={busy}
                          onClick={() => toggleFlag(m.key, { isBasic: !m.isBasic })}
                          title={m.isBasic ? 'إزالة من الباقة الأساسية' : 'إضافة إلى الباقة الأساسية'}
                          onCls="border-accent-500 bg-accent-500 text-white"
                          offCls="border-slate-200 text-slate-500 hover:border-accent-500/50 hover:text-accent-600"
                        >
                          أساسي
                        </FlagChip>
                        <FlagChip
                          on={m.isUnbilled}
                          busy={busy}
                          onClick={() => toggleFlag(m.key, { isUnbilled: !m.isUnbilled })}
                          title={m.isUnbilled ? 'جعل مدفوعة' : 'جعل مجانية'}
                          onCls="border-accent-500/40 bg-accent-500/15 text-accent-700"
                          offCls="border-slate-200 text-slate-500 hover:border-accent-500/50 hover:text-accent-600"
                        >
                          مجاني
                        </FlagChip>
                        <FlagChip
                          on={m.isHidden}
                          busy={busy}
                          disabled={m.isBasic}
                          onClick={() => toggleFlag(m.key, { isHidden: !m.isHidden })}
                          title={m.isBasic ? 'وحدة أساسية — أزلها من الباقة الأساسية أولًا' : (m.isHidden ? 'إظهار الوحدة' : 'إخفاء الوحدة')}
                          onCls="border-red-500 bg-red-500 text-white"
                          offCls="border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500"
                        >
                          {m.isHidden ? 'مخفي' : 'إخفاء'}
                        </FlagChip>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {m.isUnbilled ? (
                        <span className="text-sm font-black text-accent-500 w-20 text-center">مشمول</span>
                      ) : (
                        <input
                          type="number" step="0.5" min="0"
                          disabled={m.isHidden}
                          title={m.isHidden ? 'وحدة مخفية — لا تُحفظ تعريفتها' : undefined}
                          aria-label={`سعر وحدة ${MODULE_LABEL(m.key)} (دينار)`}
                          value={priceList[m.key] ?? 0}
                          onChange={e => setPriceList(p => ({ ...p, [m.key]: Number(e.target.value) }))}
                          className="w-20 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm font-black text-end text-slate-800 focus:border-accent-500 focus:ring-0 outline-none bg-white transition disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      )}
                      <span className="text-[11px] font-bold text-slate-500">{m.isUnbilled ? 'مجاني' : 'دينار/شهر'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sauvegarde — sous la grille des tarifs */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
        <p className="text-[11px] font-bold text-slate-500">
          تعريفات مطبقة على السنة الدراسية {priceYear}.
        </p>
        <PrimaryButton onClick={savePrices} disabled={pricesLoading} loading={savingPrices}
          icon={<Check aria-hidden="true" className="h-4 w-4" />}>
          حفظ التعريفات
        </PrimaryButton>
      </div>
    </motion.div>
  );
}
