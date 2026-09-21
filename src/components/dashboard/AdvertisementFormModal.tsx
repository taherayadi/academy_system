import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Check, X, Loader2, Search, ImagePlus } from 'lucide-react';
import { createAdvertisementApi, updateAdvertisementApi, uploadMultipleImagesApi } from '../../api';
import { CenterTenant, PlatformAdvertisement, AD_POSITION_SPECS } from '../../types';
import { useToast } from '../Toast';
import { arPlural } from '../../utils/format';
import { adDateInput, normalizeText, AD_LOCATION_OPTIONS, titleCaseName, RENEWAL_STATUS_LABEL } from './constants';

function AdvertisementFormModal({ ad, centers, onClose, onSaved }: {
  ad?: PlatformAdvertisement | null;
  centers: CenterTenant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = !!ad;
  const fieldCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white focus:border-accent-500 focus:ring-0 outline-none transition';
  const knownLocation = !ad || ['landing_page', 'center_admin', 'both'].includes(String(ad.location));

  const [title, setTitle] = useState(ad?.title || '');
  const [locationSel, setLocationSel] = useState(knownLocation ? (ad?.location || 'landing_page') : '__custom__');
  const [customLocation, setCustomLocation] = useState(knownLocation ? '' : String(ad?.location || ''));
  const [dateStart, setDateStart] = useState(adDateInput(ad?.dateStart ?? Date.now()));
  const [dateEnd, setDateEnd] = useState(adDateInput(ad?.dateEnd ?? Date.now() + 30 * 86400000));
  const [imageUrls, setImageUrls] = useState<string[]>(ad?.imageUrls || []);
  const [extraImageUrl, setExtraImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState(ad?.linkUrl || '');
  const [priority, setPriority] = useState(String(ad?.priority ?? 100));
  const [isActive, setIsActive] = useState(ad ? !!ad.isActive : true);
  const [isPublished, setIsPublished] = useState(ad ? !!ad.isPublished : false);
  const [centerIds, setCenterIds] = useState<string[]>(ad?.centerIds || []);
  const [centerQuery, setCenterQuery] = useState('');
  const [positions, setPositions] = useState<string[]>(ad?.positions || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const location = locationSel === '__custom__' ? customLocation.trim() : locationSel;
  // Une pub de vitrine ne cible aucun centre ; tableau de bord (+ both) en exigent un.
  const centersRequired = locationSel === 'center_admin' || locationSel === 'both';
  const showCenterPicker = locationSel !== 'landing_page';

  // Filtre par nom : avec des dizaines de centres, la liste défilante seule
  // est inutilisable. La sélection déjà faite n'est jamais perdue en filtrant.
  const filteredCenters = useMemo(() => {
    const q = normalizeText(centerQuery.trim());
    if (!q) return centers;
    return centers.filter(c => normalizeText((c as any).name).includes(q));
  }, [centers, centerQuery]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadMultipleImagesApi(Array.from(files));
      setImageUrls(current => [...current, ...urls.filter(Boolean)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل رفع الصور');
    } finally {
      setUploading(false);
    }
  };

  const toggleCenter = (id: string) => setCenterIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  const togglePosition = (id: string) => setPositions(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startTs = new Date(`${dateStart}T00:00:00`).getTime();
    const endTs = new Date(`${dateEnd}T23:59:59`).getTime();
    if (!title.trim()) { toast.error('عنوان الإعلان إلزامي.'); return; }
    if (!location) { toast.error('اختر موقعًا (أو اكتبه).'); return; }
    if (imageUrls.length === 0) { toast.error('أضف صورة واحدة على الأقل.'); return; }
    if (centersRequired && centerIds.length === 0) { toast.error('اختر مركزًا مستهدفًا واحدًا على الأقل.'); return; }
    if (!startTs || !endTs || endTs < startTs) { toast.error('تواريخ غير صالحة — يجب أن تتلو النهاية البداية.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        dateStart: startTs,
        dateEnd: endTs,
        location,
        imageUrls,
        linkUrl: linkUrl.trim(),
        priority: Number(priority) || 100,
        isActive,
        isPublished,
        positions,
        centerIds: locationSel === 'landing_page' ? [] : centerIds,
      };
      if (isEdit && ad) await updateAdvertisementApi(ad.id, payload);
      else await createAdvertisementApi(payload);
      toast.success(isEdit ? 'تم تحديث الإعلان.' : 'تم إنشاء الإعلان.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطأ أثناء حفظ الإعلان');
    } finally {
      setSaving(false);
    }
  };

  const togglePill = (on: boolean, set: (v: boolean) => void, labelOn: string, labelOff: string) => (
    <button type="button" onClick={() => set(!on)}
      className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition cursor-pointer ${on ? 'border-accent-500 bg-accent-500/[0.06] text-accent-700' : 'border-slate-200 bg-white text-slate-500'}`}>
      {on ? labelOn : labelOff}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-accent-500" aria-hidden="true" /> {isEdit ? 'تعديل الإعلان' : 'إنشاء إعلان'}
          </h2>
          <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
            <X className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="ad-title" className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Titre *</label>
              <input id="ad-title" value={title} onChange={e => setTitle(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label htmlFor="ad-location" className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Emplacement *</label>
              <select id="ad-location" value={locationSel} onChange={e => setLocationSel(e.target.value)} className={`${fieldCls} cursor-pointer`}>
                {AD_LOCATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {locationSel === '__custom__' && (
                <input value={customLocation} onChange={e => setCustomLocation(e.target.value)} placeholder="مثال: فواتير، مقصف…"
                  className={`${fieldCls} mt-2`} />
              )}
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ad-priority">الأولوية (الأصغر = يُعرض أولًا)</label>
              <input id="ad-priority" type="number" min={1} max={9999} value={priority} onChange={e => setPriority(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ad-start">البداية *</label>
              <input id="ad-start" type="date" dir="ltr" value={dateStart} onChange={e => setDateStart(e.target.value)} className={`${fieldCls} text-start`} />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5" htmlFor="ad-end">النهاية *</label>
              <input id="ad-end" type="date" dir="ltr" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className={`${fieldCls} text-start`} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ad-link" className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Lien cliquable (optionnel)</label>
              <input id="ad-link" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" className={fieldCls} dir="ltr" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {togglePill(isActive, setIsActive, 'Active', 'Inactive')}
            {togglePill(isPublished, setIsPublished, 'منشورة', 'مسودة')}
            <span className="text-[11px] font-semibold text-slate-500">الإعلان غير النشط أو المسودة لا يظهر في أي شريط عرض.</span>
          </div>

          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Images * (carrousel, dans l’ordre)</p>
            {imageUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                {imageUrls.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative group aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute top-1 start-1 text-[11px] font-black bg-white/90 text-slate-600 rounded px-1.5 py-0.5">#{i + 1}</span>
                    <button type="button" onClick={() => setImageUrls(cur => cur.filter((_, j) => j !== i))}
                      className="absolute top-1 end-1 p-1 rounded-lg bg-white/90 text-red-600 hover:bg-red-50 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center" title="إزالة هذه الصورة" aria-label='حذف الصورة'>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-100 transition">
                <ImagePlus className="h-4 w-4 text-accent-500" aria-hidden="true" /> Choisir des images
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              </label>
              {uploading && <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent-500" /> رفع…</span>}
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <input id="ad-image-url" value={extraImageUrl} onChange={e => setExtraImageUrl(e.target.value)} placeholder="…أو ألصق رابط صورة"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:border-accent-500 outline-none" dir="ltr" />
                <button type="button" disabled={!extraImageUrl.trim()}
                  onClick={() => { setImageUrls(cur => [...cur, extraImageUrl.trim()]); setExtraImageUrl(''); }}
                  className="px-3 py-2 text-xs font-black text-accent-500 bg-accent-500/10 border border-accent-500/30 rounded-xl hover:bg-accent-500/20 transition cursor-pointer disabled:opacity-40">
                  إضافة
                </button>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Positions d’affichage ({positions.length})</p>
            <div className="flex flex-wrap gap-2">
              {AD_POSITION_SPECS.map(spec => {
                const on = positions.includes(spec.id);
                return (
                  <button key={spec.id} type="button" title={spec.hint} onClick={() => togglePosition(spec.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${on ? 'border-accent-500 bg-accent-500/10 text-accent-500' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    {on ? '✓ ' : ''}{spec.label} <span className="font-black">· {spec.size}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] font-semibold text-slate-500 mt-1.5">كل موضع محدد يعرض الإعلان بتنسيقه: <span className="font-black text-slate-500">المستطيل</span> يشغل كامل العرض المتاح (<span className="font-black text-slate-500">حتى 1100 بكسل</span>، ارتفاع مرن من 220 إلى 420 بكسل — أكبر بكثير من 300×250 السابق) ضمن صفحات المحتوى، و<span className="font-black text-slate-500">الوشاح</span> كطبقة كاملة الشاشة قابلة للإغلاق — على الجوال والحاسوب، في الواجهة ولوحات التحكم. بدون موضع، يُستخدم شريط العرض المعتاد للموقع.</p>
          </div>

          {showCenterPicker && <div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
              المراكز المستهدفة{centersRequired ? ' *' : ' (اختياري)'} ({centerIds.length})
            </p>
            {centers.length === 0 ? (
              <p className="text-[11px] font-semibold text-slate-500">لا يوجد مركز على المنصة.</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    id="ad-center-search"
                    value={centerQuery}
                    onChange={e => setCenterQuery(e.target.value)}
                    placeholder="ابحث عن مركز بالاسم…"
                    className="w-full ps-9 pe-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-accent-500 focus:ring-0 outline-none transition"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
                  {filteredCenters.length === 0 ? (
                    <p className="px-3 py-2.5 text-[11px] font-semibold text-slate-500">
                      لا يوجد مركز يطابق « {centerQuery.trim()} ».
                    </p>
                  ) : filteredCenters.map(c => (
                    <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={centerIds.includes(c.id)} onChange={() => toggleCenter(c.id)} className="accent-accent-500" />
                      <span className="truncate">{titleCaseName((c as any).name) || c.name}</span>
                      <span className="ms-auto text-[11px] font-black text-slate-500">{RENEWAL_STATUS_LABEL[c.status] || c.status}</span>
                    </label>
                  ))}
                </div>
                {centerQuery.trim() !== '' && filteredCenters.length > 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    ${arPlural(filteredCenters.length, 'مركز', 'مركزان', 'مراكز', 'مركزًا')} من {centers.length}
                    {centerIds.length > 0 ? ` · ${arPlural(centerIds.length, 'مركز محدد', 'مركزان محددان', 'مراكز محددة', 'مركزًا محددًا')}` : ''}
                  </p>
                )}
              </>
            )}
          </div>}
          {!showCenterPicker && (
            <p className="text-[11px] font-semibold text-slate-500">إعلان الواجهة لا يستهدف أي مركز — يظهر في الصفحة الرئيسية.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer">إلغاء</button>
            <button type="submit" disabled={saving || uploading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-accent-500 rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer disabled:opacity-60">
              {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {isEdit ? 'حفظ التعديلات' : 'إنشاء الإعلان'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default AdvertisementFormModal;
