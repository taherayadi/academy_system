import { motion } from 'motion/react';
import { Clock, Plus, Check, Loader2, DollarSign, Lock, GraduationCap } from 'lucide-react';
import { ALL_MODULES, isBaseModule, BUNDLED_MODULE_KEY, MODULE_LABEL } from './constants';
import type { DashboardApi } from './usePlatformDashboard';

export default function PricingSection({ d }: { d: DashboardApi }) {
  const { priceYear, setPriceYear, priceYears, addSchoolYear, addingYear, nextSchoolYear, pricesLoading, priceList, setPriceList, savePrices, savingPrices } = d;
  return (
(
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
              <button onClick={addSchoolYear} disabled={addingYear}
                className="ms-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl border border-dashed border-accent-500/50 text-accent-500 text-xs sm:text-sm font-black whitespace-nowrap hover:bg-accent-500/5 transition cursor-pointer disabled:opacity-60"
                title={`أنشئ ${nextSchoolYear} بتعريفات منسوخة من ${priceYears[priceYears.length - 1] || ''}`}
              >
                {addingYear ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                إضافة السنة الدراسية {nextSchoolYear}
              </button>
            </div>
          </div>

          {pricesLoading ? (
            <div className="flex items-center justify-center py-20 rounded-3xl bg-white border border-slate-200">
              <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-accent-500" />
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-5">

              {/* Base plan card */}
              <div className="rounded-3xl bg-accent-500 text-white p-6 shadow-xl shadow-accent-500/25 relative overflow-hidden">
                <div className="absolute -top-16 -right-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Lock className="h-4 w-4 text-white/80" aria-hidden="true" />
                    <span className="text-[11px] font-black text-white/80 uppercase tracking-[0.15em]">Le plan de base</span>
                  </div>
                  <h3 className="text-lg font-black mb-1">مدرسي + مالية</h3>
                  <p className="text-xs text-white/70 font-semibold mb-5">مضمون دائمًا في كل اشتراك — مع سجل الدوام المجاني وغير القابل للإزالة.</p>
                  <div className="flex items-end gap-2 mb-6">
                    <span className="text-4xl font-black tracking-tight">
                      {(priceList['scolaire'] || 0) + (priceList['finance'] || 0)}
                    </span>
                    <span className="text-xs font-bold text-white/70 pb-1.5">دينار/شهر</span>
                  </div>
                  <div className="space-y-2.5 text-xs font-bold">
                    <div className="flex items-center justify-between rounded-xl bg-white/10 px-3.5 py-2.5">
                      <span className="flex items-center gap-2"><GraduationCap className="h-4 w-4" aria-hidden="true" /> Scolaire</span>
                      <span className="font-black">{priceList['scolaire'] ?? '—'} TND</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-white/10 px-3.5 py-2.5">
                      <span className="flex items-center gap-2"><DollarSign className="h-4 w-4" aria-hidden="true" /> Finance</span>
                      <span className="font-black">{priceList['finance'] ?? '—'} TND</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-white/10 border border-white/20 px-3.5 py-2.5">
                      <span className="flex items-center gap-2"><Clock className="h-4 w-4" aria-hidden="true" /> Jd. Horaires</span>
                      <span className="font-black text-white/90">Inclus — offert</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Module price editor */}
              <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
                <h3 className="text-sm font-black text-slate-900 mb-1">أسعار الوحدات الإضافية</h3>
                <p className="text-xs text-slate-500 font-semibold mb-5">
                  تُستخدم هذه التعريفات في الحساب التلقائي لسعر المركز وفق وحداته المفعلة — سنة {priceYear}.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {ALL_MODULES.map(m => {
                    const base = isBaseModule(m.key);
                    return (
                      <div key={m.key}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${base ? 'border-accent-500/30 bg-accent-500/[0.05]' : 'border-slate-200 bg-white hover:border-accent-500/30 transition'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            {m.label}
                            {m.key === BUNDLED_MODULE_KEY ? (
                              <span className="text-[8px] font-black text-accent-700 bg-accent-500/[0.06] border border-accent-500/20 rounded-full px-1.5 py-px uppercase">Offert</span>
                            ) : base ? (
                              <span className="text-[8px] font-black text-accent-500 bg-accent-500/10 border border-accent-500/30 rounded-full px-1.5 py-px uppercase">Base</span>
                            ) : null}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-500">{m.key}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {m.key === BUNDLED_MODULE_KEY ? (
                            <span className="text-sm font-black text-accent-500 w-20 text-center">Inclus</span>
                          ) : (
                            <input
                              type="number" step="0.5" min="0"
                              aria-label={`سعر وحدة ${MODULE_LABEL[m.key] ?? m.key} (دينار)`}
                              value={priceList[m.key] ?? 0}
                              onChange={e => setPriceList(p => ({ ...p, [m.key]: Number(e.target.value) }))}
                              className="w-20 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm font-black text-end text-slate-800 focus:border-accent-500 focus:ring-0 outline-none bg-white transition"
                            />
                          )}
                          <span className="text-[11px] font-bold text-slate-500">{m.key === BUNDLED_MODULE_KEY ? 'مجاني' : 'دينار/شهر'}</span>
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
            <button onClick={savePrices} disabled={savingPrices || pricesLoading}
              className="flex items-center gap-2 px-6 py-3 bg-accent-500 hover:shadow-md text-white text-sm font-black rounded-2xl shadow-sm shadow-accent-500/20 transition cursor-pointer disabled:opacity-60">
              {savingPrices ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Sauvegarder les tarifs
            </button>
          </div>
        </motion.div>
      )
  );
}
