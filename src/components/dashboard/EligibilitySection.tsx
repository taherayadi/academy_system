import { useState, useSyncExternalStore } from 'react';
import { Check, Loader2, Lock, Info } from 'lucide-react';
import { getModuleCatalog, subscribeModuleCatalog, setModuleCatalog } from '../../utils/moduleCatalogStore';
import { updateModuleEligibilityApi } from '../../api';
import type { DashboardApi } from './usePlatformDashboard';

/**
 * EligibilitySection — editor of the `center_type_modules` matrix.
 *
 * One center type at a time (pills), one allowed/not-allowed switch per
 * module, saved immediately like the flag chips above. The table stores ALLOWED
 * pairs, so the two edge cases are handled explicitly:
 *   • a module with no rows is offered to EVERY type — unchecking it for one
 *     type therefore writes the other types (it is not left row-less), and
 *   • unchecking the LAST allowed type would silently mean "allowed everywhere"
 *     again, so it is refused with a hint to hide the module instead.
 * Basic (isBasic) modules are allowed everywhere by definition — their switch
 * is locked on.
 */
export default function EligibilitySection({ d }: { d: DashboardApi }) {
  const { toast } = d;
  const catalog = useSyncExternalStore(subscribeModuleCatalog, getModuleCatalog);
  const [activeType, setActiveType] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const centerTypes = catalog.centerTypes.filter(ct => ct.key !== 'other');
  const typeKeys = centerTypes.map(ct => ct.key);
  // Falls back to the first DB type until the admin picks one (or if a pill's
  // type disappears from the catalog).
  const typeKey = typeKeys.includes(activeType) ? activeType : (typeKeys[0] || '');
  const modules = catalog.modules.filter(m => !m.isHidden);

  const isAllowed = (allowedTypes: string[], basic: boolean) =>
    basic || allowedTypes.length === 0 || allowedTypes.includes(typeKey);

  const toggle = async (key: string, allow: boolean) => {
    if (pendingKey || !typeKey) return;
    const entry = catalog.modules.find(m => m.key === key);
    if (!entry) return;

    const current = entry.allowedCenterTypes.filter(t => typeKeys.includes(t));
    let next: string[];
    if (current.length === 0) {
      // Offered to every type today: switching one OFF must write the others.
      next = typeKeys.filter(t => t !== typeKey);
    } else {
      const set = new Set(current);
      if (allow) set.add(typeKey); else set.delete(typeKey);
      next = typeKeys.filter(t => set.has(t)); // DB order, deduped
    }
    if (next.length === 0) {
      // Would mean "no rows" = allowed everywhere again — the opposite intent.
      toast.warning('لا يمكن سحب الوحدة من كل أنواع المراكز — أخفِها من الكتالوج (زر «إخفاء») إن أردت ذلك.');
      return;
    }
    if (next.length === typeKeys.length) next = []; // allowed everywhere ⇒ no rows

    setPendingKey(key);
    try {
      const payload = await updateModuleEligibilityApi(key, next);
      if (payload?.modules?.length) setModuleCatalog(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ في تحديث أحقية الوحدة');
    } finally {
      setPendingKey(null);
    }
  };

  if (typeKeys.length === 0) return null; // center_types not seeded yet

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 space-y-4">
      <div>
        <h3 className="text-sm font-black text-slate-900 mb-1">أحقية الوحدات حسب نوع المركز</h3>
        
      </div>

      {/* Center-type selector */}
      <div className="flex flex-wrap items-center gap-2">
        {centerTypes.map(ct => {
          const active = ct.key === typeKey;
          return (
            <button
              key={ct.key}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveType(ct.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black border transition cursor-pointer ${active
                ? 'bg-accent-500 text-white border-accent-500 shadow-sm shadow-accent-500/25'
                : 'bg-white text-slate-600 border-slate-200 hover:border-accent-500/40 hover:text-accent-600'}`}
            >
              {ct.labelAr}
              <span className="ms-1.5 text-[10px] font-bold opacity-70">{ct.label}</span>
            </button>
          );
        })}
      </div>

      {/* Modules of the selected type */}
      {modules.length === 0 ? (
        <p className="text-xs font-bold text-slate-400 py-6 text-center">لا توجد وحدات في الكتالوج.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {modules.map(m => {
            const always = m.isBasic;
            const allowed = isAllowed(m.allowedCenterTypes, always);
            const busy = pendingKey === m.key;
            return (
              <div key={m.key} data-module={m.key}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${allowed && !always
                  ? 'border-accent-500/30 bg-accent-500/[0.04]'
                  : 'border-slate-200 bg-white'}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-slate-800 flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{m.labelAr}</span>
                    {always && (
                      <span className="text-[11px] font-black text-accent-500 bg-accent-500/10 border border-accent-500/30 rounded-full px-1.5 py-px">أساسي</span>
                    )}
                    {m.isUnbilled && (
                      <span className="text-[11px] font-black text-accent-700 bg-accent-500/[0.06] border border-accent-500/20 rounded-full px-1.5 py-px">مشمول</span>
                    )}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">{m.label}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowed}
                  disabled={always || busy}
                  onClick={() => toggle(m.key, !allowed)}
                  title={always
                    ? 'وحدة أساسية — مسموحة دائمًا لكل الأنواع'
                    : (allowed ? `اسحب إذن ${m.labelAr} عن ${centerTypes.find(ct => ct.key === typeKey)?.labelAr || typeKey}` : `اسمح لـ ${centerTypes.find(ct => ct.key === typeKey)?.labelAr || typeKey} بـ ${m.labelAr}`)}
                  className={`shrink-0 inline-flex items-center justify-center gap-1.5 min-w-[92px] text-[11px] font-black px-2.5 py-1.5 rounded-lg border transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${allowed
                    ? 'border-accent-500 bg-accent-500 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-400'}`}
                >
                  {busy
                    ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                    : always
                      ? <Lock aria-hidden="true" className="h-3 w-3" />
                      : allowed && <Check aria-hidden="true" className="h-3 w-3" />}
                  {allowed ? 'مسموح' : 'غير مسموح'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] font-bold text-slate-500 flex items-start gap-1.5">
        <Info aria-hidden="true" className="h-3.5 w-3.5 mt-px flex-shrink-0" />
        الوحدات الأساسية مسموحة دائمًا · وحدة بلا صفوف تعني «مسموحة في كل الأنواع» · الوحدات المخفية لا تظهر هنا.
      </p>
    </div>
  );
}
