import { motion } from 'motion/react';
import { Plus, RefreshCw, Trash2, Loader2, Edit, ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react';
import { PrimaryButton } from '../ui';
import { AD_POSITION_SPECS, adPositionLabel } from '../../types';
import { toneClasses } from '../ui/StatusBadge';
import { fmtDate, arPlural } from '../../utils/format';
import { AD_STATUS_FILTERS, adStatusOf, PAGE_SIZE, AD_STATUS_META, adLocationLabel } from './constants';
import type { DashboardApi } from './usePlatformDashboard';

export default function AdvertisementsSection({ d }: { d: DashboardApi }) {
  const { adsLoading, advertisements, adsStatusFilter, setAdsStatusFilter, setAdsPage, loadAdvertisements, setShowNewAd, visibleAds, adsPage, setEditAd, setDeleteAd } = d;
  return (
(
        <motion.div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-black text-slate-800">إدارة الإعلانات</h2>
              {!adsLoading && (
                <span className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-sm font-black text-slate-600">
                  {advertisements.length}
                </span>
              )}
              <div className="flex flex-wrap gap-1.5">
                {AD_STATUS_FILTERS.map(f => {
                  const count = f.value === 'all' ? advertisements.length : advertisements.filter(a => adStatusOf(a) === f.value).length;
                  const on = adsStatusFilter === f.value;
                  return (
                    <button key={f.value}
                      onClick={() => { setAdsStatusFilter(f.value); setAdsPage(1); }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-black border transition cursor-pointer ${on ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-slate-500 border-slate-200 hover:border-accent-500/40'}`}>
                      {f.label} <span className={on ? 'text-white/70' : 'text-slate-500'}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadAdvertisements} disabled={adsLoading} title="تحديث" aria-label="تحديث"
                className="p-2 hover:bg-slate-100 rounded-xl transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
                <RefreshCw className={`h-5 w-5 text-slate-600 ${adsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
              <PrimaryButton onClick={() => setShowNewAd(true)} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
                إعلان جديد
              </PrimaryButton>
            </div>
          </div>

          {adsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-accent-500" />
            </div>
          ) : advertisements.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <ImagePlus className="h-12 w-12 mx-auto mb-3 text-slate-400" aria-hidden="true" />
              <p className="font-bold">{advertisements.length === 0 ? 'لا توجد إعلانات' : 'لا توجد إعلانات لهذا الفلتر'}</p>
              <p className="text-sm">{advertisements.length === 0 ? 'أنشئ أول بانر للواجهة أو لوحات التحكم.' : 'غيّر الفلتر لعرض حالات أخرى.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleAds.slice((adsPage - 1) * PAGE_SIZE, adsPage * PAGE_SIZE).map(ad => (
                <div key={ad.id} className="border border-slate-200 rounded-xl p-4 bg-white hover:border-accent-500/30 transition">
                  <div className="aspect-video bg-slate-100 rounded-lg mb-3 overflow-hidden">
                    {ad.imageUrls?.[0] && (
                      <img src={ad.imageUrls[0]} alt={ad.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <h3 className="font-black text-slate-800 mb-2">{ad.title}</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${toneClasses(AD_STATUS_META[adStatusOf(ad)].tone)}`}>
                      {AD_STATUS_META[adStatusOf(ad)].label}
                    </span>
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
                      {adLocationLabel(ad.location)}
                    </span>
                    {ad.centerIds?.length > 0 && (
                      <span className="px-2 py-1 bg-accent-500/5 text-accent-700 text-xs font-bold rounded-full">
                        ${arPlural(ad.centerIds.length, 'مركز', 'مركزان', 'مراكز', 'مركزًا')}
                      </span>
                    )}
                    {(ad.positions?.length ?? 0) > 0 && (
                      <span className="px-2 py-1 bg-accent-500/10 text-accent-500 text-[11px] font-bold rounded-full"
                        title={ad.positions!.map(adPositionLabel).join(', ')}>
                        {ad.positions!.map(pid => AD_POSITION_SPECS.find(sp => sp.id === pid)?.size || pid).join(' · ')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mb-3">
                    {fmtDate(ad.dateStart)} → {fmtDate(ad.dateEnd)}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditAd(ad)}
                      className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition">
                      <Edit className="h-4 w-4 inline me-1" aria-hidden="true" />
                      تعديل
                    </button>
                    <button onClick={() => setDeleteAd(ad)} title="حذف"
                      className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition cursor-pointer">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!adsLoading && visibleAds.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setAdsPage(p => Math.max(1, p - 1))}
                disabled={adsPage === 1}
                className="px-3 py-2 border border-slate-200 rounded-lg disabled:opacity-50 hover:border-accent-500 transition"
                aria-label="الصفحة السابقة">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="px-4 py-2 text-sm font-bold text-slate-600">
                {adsPage} / {Math.ceil(visibleAds.length / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setAdsPage(p => Math.min(Math.ceil(visibleAds.length / PAGE_SIZE), p + 1))}
                disabled={adsPage >= Math.ceil(visibleAds.length / PAGE_SIZE)}
                className="px-3 py-2 border border-slate-200 rounded-lg disabled:opacity-50 hover:border-accent-500 transition"
                aria-label="الصفحة التالية">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </motion.div>
      )
  );
}
