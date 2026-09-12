import React, { useState } from 'react';
import {
  Building2, 
  Phone, 
  MapPin, 
  DollarSign, 
  Save, 
  Check, 
  Settings as SettingsIcon,
  HelpCircle,
  Sparkles,
  Download,
  Upload,
  Database,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  Utensils,
  Coffee,
  ImagePlus,
  Trash2,
  Loader2
} from 'lucide-react';
import { CenterSettings, CenterFeeSet, getFeesForYear, initialStudentFeeSet, initialCenterSettings, DEFAULT_ACADEMIC_YEARS, getCurrentAcademicYear } from '../types';
import { changeAccountPassword } from '../auth';
import { uploadCenterLogoApi, saveCenterLogoApi } from '../api';
import { useToast } from './Toast';
import defaultLogo from '../assets/icon.png';

interface SettingsModuleProps {
  key?: React.Key;
  settings: CenterSettings;
  onUpdateSettings: (newSettings: CenterSettings) => void;
  hideRestrictedModules?: boolean;
  onExportDatabase?: () => void;
  onImportDatabase?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  currentUserEmail?: string;
  /** Center logo URL (ImageKit) — empty = default brand logo. */
  centerLogoUrl?: string;
  /** Called after the logo was uploaded/saved/cleared to refresh the menu. */
  onCenterLogoChange?: (url: string) => void;
  /** SaaS plan: modules enabled for this center (undefined = all, legacy compat). */
  enabledModules?: string[];
}

const YEAR_OPTIONS = DEFAULT_ACADEMIC_YEARS;

export default function SettingsModule({ settings, onUpdateSettings, hideRestrictedModules, onExportDatabase, onImportDatabase, currentUserEmail, centerLogoUrl, onCenterLogoChange, enabledModules }: SettingsModuleProps) {
  // SaaS gating: fees can only be set for services included in the center's plan.
  const hasModule = (key: string) => !enabledModules || enabledModules.includes(key);
  const toast = useToast();
  const [formData, setFormData] = useState<CenterSettings>(settings || initialCenterSettings);
  const [isSaved, setIsSaved] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>(getCurrentAcademicYear());

  // ── Center logo (ImageKit) ──
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  React.useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const handleLogoSelect = (file?: File) => {
    setLogoFile(file || null);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setLogoUploading(true);
    try {
      const url = await uploadCenterLogoApi(logoFile);
      await saveCenterLogoApi(url);
      onCenterLogoChange?.(url);
      setLogoFile(null);
      setLogoPreview(null);
      toast.success('تم رفع وحفظ شعار المركز.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر رفع الشعار.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    setLogoUploading(true);
    try {
      await saveCenterLogoApi('');
      onCenterLogoChange?.('');
      setLogoFile(null);
      setLogoPreview(null);
      toast.success('تم حذف شعار المركز.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر حذف الشعار.');
    } finally {
      setLogoUploading(false);
    }
  };

  // Keep formData synchronized when settings prop updates (e.g., loaded from server or restored from backup)
  React.useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserEmail) {
      toast.error('لا يمكن تغيير كلمة السر الآن.');
      return;
    }
    if (!currentPassword || !newPassword) {
      toast.error('أدخل كلمة السر الحالية والجديدة.');
      return;
    }
    if (newPassword.trim().length < 4) {
      toast.error('كلمة السر الجديدة يجب أن تكون 4 أحرف على الأقل.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمتا السر الجديدتان غير متطابقتين.');
      return;
    }
    if (newPassword.trim() === currentPassword.trim()) {
      toast.warning('كلمة السر الجديدة مطابقة للحالية.');
      return;
    }
    try {
      await changeAccountPassword(currentUserEmail, currentPassword.trim(), newPassword.trim());
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('تم تغيير كلمة السر بنجاح!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذر تغيير كلمة السر.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const activeYearFees = getFeesForYear(formData, selectedYear);
    const updatedSettings: CenterSettings = {
      ...formData,
      fees: activeYearFees,
      feesByYear: {
        ...(formData.feesByYear || {}),
        [selectedYear]: activeYearFees
      }
    };
    onUpdateSettings(updatedSettings);
    setIsSaved(true);
    toast.success('تم حفظ الإعدادات بنجاح!');
    setTimeout(() => setIsSaved(false), 3000);
  };

  const updateFee = (key: keyof CenterFeeSet, value: number) => {
    setFormData(prev => {
      const currentYearFees = getFeesForYear(prev, selectedYear);
      const updatedYearFees: CenterFeeSet = { ...currentYearFees, [key]: value };
      return {
        ...prev,
        feesByYear: {
          ...(prev.feesByYear || {}),
          [selectedYear]: updatedYearFees
        }
      };
    });
  };

  const currentYearFees = getFeesForYear(formData, selectedYear);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white rounded-3xl p-6 shadow-lg shadow-[#257C86]/25 border border-white/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-[#257C86]" />
            <h2 className="text-xl md:text-2xl font-black">إعدادات السنتر والرسوم</h2>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            تحديد أسعار الاشتراك والتسجيل الافتراضية
          </p>
        </div>

        {isSaved && (
          <div className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold animate-pulse">
            <Check className="h-4 w-4" />
            تم الحفظ بنجاح!
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Section 1: Center General Details */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-4">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="h-5 w-5 text-[#257C86]" />
            معلومات السنتر
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">اسم السنتر</label>
              <div className="relative">
                <Building2 className="h-4 w-4 text-slate-400 absolute right-3 top-3" />
                <input 
                  type="text" 
                  required
                  value={formData.centerName}
                  onChange={(e) => setFormData({ ...formData, centerName: e.target.value })}
                  className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                  placeholder="اسم المركز"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">رقم الهاتف (8 أرقام)</label>
              <div className="relative">
                <Phone className="h-4 w-4 text-slate-400 absolute right-3 top-3" />
                <input 
                  type="text" 
                  required
                  dir="ltr"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                  className="w-full pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#257C86] text-right" maxLength={8}
                  placeholder="98765432"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">العنوان / المدينة</label>
              <div className="relative">
                <MapPin className="h-4 w-4 text-slate-400 absolute right-3 top-3" />
                <input 
                  type="text" 
                  required
                  dir="ltr"
                  value={formData.locationCity}
                  onChange={(e) => setFormData({ ...formData, locationCity: e.target.value })}
                  className="w-full pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#257C86] text-right"
                  placeholder="Sfax / تونس"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 1b: Center Logo (ImageKit) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-4">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <ImagePlus className="h-5 w-5 text-[#257C86]" />
            شعار المركز (Logo)
          </h3>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#257C86] to-[#1e626b] p-1 shadow-lg shadow-[#257C86]/25 ring-1 ring-white/40 shrink-0">
              <img
                src={logoPreview || centerLogoUrl || defaultLogo}
                alt="شعار المركز"
                className="w-full h-full rounded-xl object-cover bg-white"
              />
            </div>
            <div className="space-y-3 min-w-0">
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                يظهر الشعار في قائمة المركز بعد الحفظ. اتركه فارغاً لاستعمال الشعار الافتراضي. الصيغ المسموحة: PNG · JPG · WEBP · SVG (الحد الأقصى 2 ميغا).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-100 transition">
                  <ImagePlus className="h-4 w-4 text-[#257C86]" />
                  اختيار صورة
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                    className="hidden"
                    onChange={e => handleLogoSelect(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleLogoUpload}
                  disabled={!logoFile || logoUploading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white rounded-xl text-xs font-black shadow-md shadow-[#257C86]/25 hover:shadow-lg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  رفع وحفظ الشعار
                </button>
                {(centerLogoUrl || logoFile) && (
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    disabled={logoUploading}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-black hover:bg-red-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف الشعار
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Default Fees Configuration */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#257C86]" />
              الرسوم والاشتراكات الافتراضية
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">السنة الدراسية:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#257C86]"
              >
                {YEAR_OPTIONS.map(yr => <option key={yr} value={yr}>السنة الدراسية {yr}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-[#257C86]/[0.05] border border-[#257C86]/20 rounded-2xl px-4 py-2 text-xs text-[#1e626b] font-bold flex items-center gap-2">
            <DollarSign className="h-4 w-4 shrink-0" />
            الأسعار المحددة للسنة <span className="font-black">{selectedYear}</span> خاصة بها فقط.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            
            {/* Suivi Scolaire */}
            <div className="bg-[#257C86]/[0.04] p-4 rounded-2xl border border-[#257C86]/20 space-y-3">
              <span className="text-xs font-extrabold text-[#1e626b] block border-b border-[#257C86]/20 pb-1">
                المتابعة الدراسية
              </span>
              
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  رسوم التسجيل السنوي
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="0"
                    value={currentYearFees.fraisAnnuelSuivi}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => updateFee('fraisAnnuelSuivi', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                  <span className="text-xs font-black text-slate-500">د.ت</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  الاشتراك الشهري
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="0"
                    value={currentYearFees.fraisMensuelSuivi}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => updateFee('fraisMensuelSuivi', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                  <span className="text-xs font-black text-slate-500">د.ت</span>
                </div>
              </div>
            </div>

            {/* Bibliotheque — uniquement si le module est au plan */}
            {hasModule('bibliotheque') && (
            <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-200/60 space-y-3">
              <span className="text-xs font-extrabold text-emerald-900 block border-b border-emerald-200/60 pb-1">
                المكتبة
              </span>
              
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  رسوم التسجيل السنوي بالمكتبة
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="0"
                    value={currentYearFees.fraisAnnuelBibliotheque}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => updateFee('fraisAnnuelBibliotheque', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                  <span className="text-xs font-black text-slate-500">د.ت</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  الاشتراك الشهري للمكتبة
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="0"
                    value={currentYearFees.fraisMensuelBibliotheque}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => updateFee('fraisMensuelBibliotheque', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                  <span className="text-xs font-black text-slate-500">د.ت</span>
                </div>
              </div>
            </div>
            )}

            {/* Repas / Restaurant & Cantine Adaptative — module Cantine requis */}
            {!hideRestrictedModules && hasModule('cantine') && (
              <div className="bg-[#257C86]/[0.05] p-4 rounded-2xl border border-[#257C86]/20 space-y-4 md:col-span-2 lg:col-span-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#257C86]/20 pb-2">
                  <span className="text-xs font-extrabold text-[#1e626b] flex items-center gap-2">
                    <Utensils className="h-4 w-4 text-[#257C86]" />
                    المطعم والوجبات (Cantine Adaptative)
                  </span>
                  {/* Mode Selector */}
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#257C86]/20 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, mealOperatingMode: 'external_traiteur' }))}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${(formData.mealOperatingMode || 'external_traiteur') === 'external_traiteur' ? 'bg-[#257C86] text-white shadow-lg shadow-slate-900/5' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      🤝 متعاقد مع Traiteur خارجي
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, mealOperatingMode: 'in_house_kitchen' }));
                        updateFee('prixPlatTraiteur', 0);
                      }}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${formData.mealOperatingMode === 'in_house_kitchen' ? 'bg-emerald-600 text-white shadow-lg shadow-slate-900/5' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      👨‍🍳 مطبخ داخلي (طباخ قار)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      اشتراك الوجبات الشهري (Déjeuner)
                    </label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        min="0"
                        value={currentYearFees.fraisAbonnementRepas}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateFee('fraisAbonnementRepas', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                      />
                      <span className="text-xs font-black text-slate-500">د.ت</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      سعر الوجبة الفردية (Déjeuner unitaire)
                    </label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        min="0"
                        value={currentYearFees.fraisParRepas}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateFee('fraisParRepas', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                      />
                      <span className="text-xs font-black text-slate-500">د.ت</span>
                    </div>
                  </div>

                  {(formData.mealOperatingMode || 'external_traiteur') === 'external_traiteur' ? (
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        سعر الوجبة للـ Traiteur (حصة المتعهد)
                      </label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="0"
                          value={currentYearFees.prixPlatTraiteur}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateFee('prixPlatTraiteur', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-800"
                        />
                        <span className="text-xs font-black text-slate-500">د.ت</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium block mt-1">تخصم كدين للـ Traiteur في وحدة المالية</span>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex flex-col justify-center">
                      <span className="text-[11px] font-black text-emerald-800 flex items-center gap-1">
                        ✓ نظام المطبخ الداخلي مفعّل
                      </span>
                      <span className="text-[10px] text-emerald-700 mt-0.5">
                        حصة الـ Traiteur معطلة (0 د.ت). 100% من مداخيل الوجبات تسجل كأرباح للمركز.
                      </span>
                    </div>
                  )}
                </div>

                {/* Sub-section: Goûter Service */}
                <div className="mt-4 pt-3 border-t border-[#257C86]/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Coffee className="h-4 w-4 text-[#257C86]" />
                    <span className="text-xs font-black text-[#1e626b]">
                      تسعيرة خدمة اللمجة (Goûter)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white p-3.5 rounded-2xl border border-[#257C86]/20">
                    <div>
                      <label className="text-[10px] font-bold text-slate-700 block mb-1">
                        لمجة الصباح — اشتراك شهري
                      </label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="0"
                          value={currentYearFees.fraisGouterMatinMensuel || 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateFee('fraisGouterMatinMensuel', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                        />
                        <span className="text-[11px] font-black text-slate-500">د.ت</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-700 block mb-1">
                        لمجة الصباح — سعر بالوحدة
                      </label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="0"
                          value={currentYearFees.fraisGouterMatinUnitaire || 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateFee('fraisGouterMatinUnitaire', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                        />
                        <span className="text-[11px] font-black text-slate-500">د.ت</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-700 block mb-1">
                        لمجة المساء — اشتراك شهري
                      </label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="0"
                          value={currentYearFees.fraisGouterSoirMensuel || 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateFee('fraisGouterSoirMensuel', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                        />
                        <span className="text-[11px] font-black text-slate-500">د.ت</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-700 block mb-1">
                        لمجة المساء — سعر بالوحدة
                      </label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="0"
                          value={currentYearFees.fraisGouterSoirUnitaire || 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateFee('fraisGouterSoirUnitaire', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                        />
                        <span className="text-[11px] font-black text-slate-500">د.ت</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-[#1e626b] block mb-1">
                        اللمجتان معاً — اشتراك شهري
                      </label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          min="0"
                          value={currentYearFees.fraisDeuxGoutersMensuel || 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateFee('fraisDeuxGoutersMensuel', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                          className="w-full px-2.5 py-1.5 bg-[#257C86]/[0.06] border border-[#257C86]/20 rounded-xl text-xs font-bold font-mono text-[#1e626b]"
                        />
                        <span className="text-[11px] font-black text-[#257C86]">د.ت</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Étude — uniquement si le module est au plan */}
            {hasModule('etude') && (
            <div className="bg-[#257C86]/5 p-4 rounded-2xl border border-[#257C86]/20 space-y-3">
              <span className="text-xs font-extrabold text-[#14464e] block border-b border-[#257C86]/20 pb-1">
                تأطير Étude
              </span>
              
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  رسوم التسجيل السنوي
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="0"
                    value={currentYearFees.fraisAnnuelEtude}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => updateFee('fraisAnnuelEtude', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                  <span className="text-xs font-black text-slate-500">د.ت</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  الاشتراك الشهري للدروس
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    min="0"
                    value={currentYearFees.fraisMensuelEtude}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => updateFee('fraisMensuelEtude', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                  <span className="text-xs font-black text-slate-500">د.ت</span>
                </div>
              </div>
            </div>
            )}

            {/* Cours Particuliers — module requis au plan */}
            {!hideRestrictedModules && hasModule('coursParticuliers') && (
              <div className="bg-emerald-50/40 p-4 rounded-2xl border border-emerald-200/60 space-y-3 lg:col-span-2">
                <span className="text-xs font-extrabold text-emerald-900 block border-b border-emerald-200/60 pb-1">
                  الدروس الخصوصية
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      رسوم التأمين للدروس الخصوصية
                    </label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        min="0"
                        value={currentYearFees.fraisAssuranceCoursExternes}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateFee('fraisAssuranceCoursExternes', Number((e.target.value || '').replace(/^0+(\d)/, '$1')) || 0)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono"
                      />
                      <span className="text-xs font-black text-slate-500">د.ت</span>
                    </div>
                  </div>

                  <div className="flex items-end">
                    <p className="text-[11px] text-slate-500 leading-relaxed bg-white/80 p-2 rounded-xl border border-emerald-200/50">
                      تُطبق تلقائياً عند تسجيل المقبوضات الجديدة.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Security: Change Password */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/70 shadow-lg shadow-slate-900/5 space-y-4">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <KeyRound className="h-5 w-5 text-[#257C86]" />
            تغيير كلمة السر
          </h3>

          <div className="bg-[#257C86]/[0.05] border border-[#257C86]/20 rounded-2xl px-4 py-2 text-xs text-[#1e626b] font-bold flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            الحساب الحالي:{' '}
            <span className="font-mono font-black" dir="ltr">{currentUserEmail || '—'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">كلمة السر الحالية</label>
              <div className="relative">
                <input
                  type={showCurrentPwd ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-3 pl-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                  className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">كلمة السر الجديدة</label>
              <div className="relative">
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="4 أحرف على الأقل"
                  className="w-full pr-3 pl-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(!showNewPwd)}
                  className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">تأكيد كلمة السر الجديدة</label>
              <div className="relative">
                <input
                  type={showConfirmPwd ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-3 pl-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#257C86]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={handleChangePassword}
              className="flex items-center justify-center gap-2 px-6 py-2 bg-[#257C86] hover:bg-[#1e626b] text-white rounded-xl font-black text-xs transition cursor-pointer"
            >
              <KeyRound className="h-4 w-4" />
              تغيير كلمة السر
            </button>
          </div>
        </div>

        {/* Database Backup & Restore */}
        {(onExportDatabase || onImportDatabase) && (
          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200/70">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2 mb-4">
              <Database className="h-4 w-4 text-slate-500" />
              النسخ الاحتياطي والاسترجاع
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onExportDatabase}
                className="flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 hover:border-[#257C86] hover:bg-[#257C86]/[0.06] text-slate-700 rounded-2xl font-bold text-xs transition cursor-pointer"
              >
                <Download className="h-4 w-4 text-[#257C86]" />
                تصدير نسخة JSON
              </button>
              <label className="flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 hover:border-[#257C86] hover:bg-[#257C86]/[0.06] text-slate-700 rounded-2xl font-bold text-xs transition cursor-pointer">
                <Upload className="h-4 w-4 text-[#257C86]" />
                استرجاع نسخة احتياطية
                <input type="file" accept=".json" onChange={onImportDatabase} className="hidden" />
              </label>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-3">
              يُنصح بتصدير نسخة احتياطية دورياً.
            </p>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 px-8 py-3 bg-[#257C86] hover:bg-[#1e626b] text-white rounded-2xl font-black text-sm shadow-md shadow-[#257C86]/20 transition cursor-pointer"
          >
            <Save className="h-5 w-5" />
            حفظ الإعدادات
          </button>
        </div>

      </form>
    </div>
  );
}
