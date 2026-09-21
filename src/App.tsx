/**
 * SaaS platform administration — application shell.
 *
 * This is the whole application surface: a platform-only login screen and a
 * sidebar hosting the seven platform consoles of PlatformAdminDashboard
 * (overview, centers & subscriptions, demo requests, SaaS finance, pricing,
 * advertisements, renewal requests).
 *
 * There is deliberately NO center side to this shell: no landing page, no
 * center dashboard, no academic/operational module and no runtime switch that
 * could enable one. A `platform_super_admin` session that loses its role or
 * is deleted server-side is bounced back to the login screen on the next
 * unauthorized response (UnauthorizedError), because the BACKEND — not this
 * file — is what enforces access.
 */
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  DollarSign,
  LogOut,
  ShieldCheck,
  Building2,
  Inbox,
  Tags,
  ImagePlus,
  RefreshCw,
  KeyRound,
  Loader2,
  X,
} from 'lucide-react';

import { UserAccount } from './types';
import { UnauthorizedError, changePasswordRequest } from './api';
import { saveSessionUser, clearSessionUser, clearLocalSession, resolveSessionUser } from './auth';

import LoginScreen from './components/LoginScreen';
// Code-split: the console monolith (+ modals, charts) loads only after a
// platform session exists — the login screen ships in the initial chunk.
const PlatformAdminDashboard = lazy(() => import('./components/PlatformAdminDashboard'));
import { useToast } from './components/Toast';
import brandIcon from './assets/icon.png';

/** Tab ids map 1:1 onto the platform dashboard sections. */
type PlatformTab =
  | 'platformAdmin'
  | 'platformCenters'
  | 'platformRequests'
  | 'platformFinance'
  | 'platformPricing'
  | 'platformAdvertisements'
  | 'platformRenewals';

const MENU_ITEMS: { id: PlatformTab; label: string; icon: React.ElementType }[] = [
  { id: 'platformAdmin', label: 'الرئيسية · SaaS', icon: LayoutDashboard },
  { id: 'platformCenters', label: 'المراكز والاشتراكات', icon: Building2 },
  { id: 'platformRequests', label: 'طلبات التجربة', icon: Inbox },
  { id: 'platformFinance', label: 'المالية (SaaS)', icon: DollarSign },
  { id: 'platformPricing', label: 'الأسعار والوحدات', icon: Tags },
  { id: 'platformAdvertisements', label: 'الإعلانات', icon: ImagePlus },
  { id: 'platformRenewals', label: 'طلبات التجديد', icon: RefreshCw },
];

const TAB_TO_PAGE: Record<PlatformTab, 'overview' | 'centers' | 'requests' | 'finance' | 'pricing' | 'advertisements' | 'renewals'> = {
  platformAdmin: 'overview',
  platformCenters: 'centers',
  platformRequests: 'requests',
  platformFinance: 'finance',
  platformPricing: 'pricing',
  platformAdvertisements: 'advertisements',
  platformRenewals: 'renewals',
};

// Suspense fallback while the lazy console chunk streams in (post-login).
function DashboardFallback() {
  return (
    <div className="flex items-center justify-center py-24" dir="rtl" aria-busy="true" aria-label="جارٍ تحميل لوحة التحكم">
      <Loader2 className="animate-spin text-slate-500" size={26} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password change modal (self-service; the endpoint revokes other sessions)
// ---------------------------------------------------------------------------
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await changePasswordRequest(currentPassword, newPassword);
      toast.success('تم تغيير كلمة السر. سجّل الدخول من جديد.');
      clearLocalSession();
      // Force a re-login with the new password (all sessions were revoked).
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تغيير كلمة السر.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose}></div>
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 border border-slate-200"
      >
        <button type="button" onClick={onClose} className="absolute top-3 end-3 p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-600 cursor-pointer" aria-label="إغلاق">
          <X size={18} />
        </button>
        <h3 className="font-black text-slate-900 mb-1 flex items-center gap-2">
          <KeyRound size={18} className="text-accent-500" /> تغيير كلمة السر
        </h3>
        <p className="text-[11px] text-slate-500 mb-4">سيتم إنهاء كل الجلسات الأخرى لهذا الحساب تلقائياً.</p>
        <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="pwd-current">كلمة السر الحالية</label>
        <input
          id="pwd-current" type="password" dir="ltr" autoComplete="current-password"
          value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          required
        />
        <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="pwd-new">كلمة السر الجديدة (8 أحرف على الأقل)</label>
        <input
          id="pwd-new" type="password" dir="ltr" autoComplete="new-password"
          value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/30"
          required minLength={8}
        />
        {error && <div className="text-[12px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{error}</div>}
        <button
          type="submit" disabled={busy}
          className="w-full py-2.5 rounded-xl bg-accent-500 hover:bg-[#1f6871] text-white font-black text-sm disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
        >
          {busy && <Loader2 size={15} className="animate-spin" />} حفظ كلمة السر
        </button>
      </motion.form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------
export default function App() {
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [activeTab, setActiveTab] = useState<PlatformTab>('platformAdmin');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const toast = useToast();

  // Boot: only the SERVER decides who is logged in (platform_sessions). The
  // cached localStorage user is a fallback for network hiccups; /api/auth/me
  // re-validates role + account existence on every successful boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const serverUser = await resolveSessionUser();
      if (cancelled) return;
      if (serverUser && serverUser.role === 'platform_super_admin') {
        setCurrentUser(serverUser);
      } else {
        // Stale local state that the server does not confirm → drop it.
        clearLocalSession();
      }
      setIsBootLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = useCallback(() => {
    clearSessionUser();
    setCurrentUser(null);
    setActiveTab('platformAdmin');
  }, []);

  // Any API call answering 401 anywhere in the tree ⇒ force back to login.
// Fallback handler for unhandled promise rejections that result in 401.
// Most API calls properly catch and handle UnauthorizedError, this catches
// cases where rejection was not handled (e.g., forgot .catch()).
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent | Event) => {
      const reason = (event as PromiseRejectionEvent).reason;
      if (reason instanceof UnauthorizedError) {
        clearLocalSession();
        setCurrentUser(null);
      }
    };
    window.addEventListener('unhandledrejection', handler as EventListener);
    return () => window.removeEventListener('unhandledrejection', handler as EventListener);
  }, []);

  if (isBootLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <img src={brandIcon} alt="" className="w-14 h-14 rounded-2xl shadow-lg" />
          <Loader2 className="animate-spin" size={22} />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onLogin={(user, passwordUpgraded) => {
          // The server already rejected any non-platform identity before this
          // callback can fire (loginRequest resolves only for a created
          // platform_sessions row).
          saveSessionUser(user);
          setCurrentUser(user);
          setActiveTab('platformAdmin');
          toast.success(`أهلاً ${user.name || user.email}`);
          if (passwordUpgraded) {
            // The account still carried the pre-salt-fix unsalted SHA-256
            // digest; the server accepted it ONCE and re-hashed it with
            // bcrypt. That digest is public in git history, so rotation is
            // mandatory here.
            toast.warning('تمت ترقية كلمة السر القديمة تلقائيًا إلى التشفير الحديث — غيّرها الآن من زر «تغيير كلمة السر».');
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" dir="rtl">
      <div className="flex min-h-screen">
        {/* ── Sidebar ── */}
        <aside className="w-64 shrink-0 bg-white border-l border-slate-200/70 flex flex-col max-lg:hidden">
          <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-100">
            <img src={brandIcon} alt="System Academy SaaS" className="w-11 h-11 rounded-2xl object-cover shadow-md shadow-accent-500/20 ring-1 ring-white/40" />
            <div>
              <h1 className="font-black text-sm text-slate-900">إدارة المنصة (SaaS)</h1>
              <span className="text-[11px] text-accent-500 font-bold block">لوحة تحكم المنصة فقط</span>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition cursor-pointer ${
                    active
                      ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/25'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="px-4 py-4 border-t border-slate-100 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-accent-500/10 text-accent-500 flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-black text-slate-800 truncate">{currentUser.name || 'مدير المنصة'}</p>
                <p className="text-[10px] text-slate-500 truncate" dir="ltr">{currentUser.email}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 min-h-11 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px] font-bold cursor-pointer"
              >
                <KeyRound size={13} /> كلمة السر
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 min-h-11 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 text-[11px] font-bold cursor-pointer"
              >
                <LogOut size={13} /> خروج
              </button>
            </div>
            <p className="text-[10px] text-slate-500 text-center font-bold pt-1">System Academy SaaS © 2026</p>
          </div>
        </aside>

        {/* ── Main area ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Mobile top bar */}
          <div className="lg:hidden bg-white border-b border-slate-200/70 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src={brandIcon} alt="" className="w-9 h-9 rounded-xl object-cover" />
              <div>
                <h1 className="font-black text-sm text-slate-950 leading-tight">إدارة المنصة</h1>
                <span className="text-[10px] text-accent-500 font-bold block">لوحة تحكم SaaS</span>
              </div>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-500 p-2 min-h-11 min-w-11 inline-flex items-center justify-center cursor-pointer" aria-label="خروج">
              <LogOut size={18} />
            </button>
          </div>

          {/* Mobile tab strip */}
          <div className="lg:hidden flex gap-2 px-3 py-2 bg-white border-b border-slate-100 overflow-x-auto no-scrollbar">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`shrink-0 px-3 min-h-11 inline-flex items-center rounded-full text-[11px] font-bold border cursor-pointer ${
                  activeTab === item.id ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="flex-1 p-4 lg:p-6"
            >
              <Suspense fallback={<DashboardFallback />}>
                <PlatformAdminDashboard
                  page={TAB_TO_PAGE[activeTab]}
                  onNavigate={(p) => {
                    const target = (Object.keys(TAB_TO_PAGE) as PlatformTab[]).find(
                      (tab) => TAB_TO_PAGE[tab] === p
                    );
                    setActiveTab(target || 'platformAdmin');
                  }}
                />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </div>
  );
}
