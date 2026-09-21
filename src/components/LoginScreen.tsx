/**
 * Platform-console login screen.
 *
 * Only a `platform_super_admin` account can get past this screen — and the
 * role check happens on the SERVER (POST /api/auth/login answers 401 for
 * every other role, indistinguishable from a wrong password). Center
 * accounts (admin / super_admin / restricted_admin) belong to the center
 * application and never see it here.
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, ArrowRight, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { UserAccount } from '../types';
import { verifyPassword } from '../auth';
import icon from '../assets/icon.png';

interface LoginScreenProps {
  onLogin: (user: UserAccount, passwordUpgraded?: boolean) => void | Promise<void>;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError('أدخل البريد الإلكتروني');
      setIsSubmitting(false);
      return;
    }

    if (!password) {
      setError('أدخل كلمة السر');
      setIsSubmitting(false);
      return;
    }

    try {
      const { user, passwordUpgraded } = await verifyPassword(cleanEmail, password.trim());
      await onLogin(user, passwordUpgraded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'كلمة السر غير صحيحة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-accent-500/5 flex items-center justify-center p-4 relative overflow-hidden font-sans"
      dir="rtl"
    >

      {/* Background washes — same spirit as the landing page */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent-500/[0.06] via-transparent to-accent-500/[0.05] pointer-events-none"></div>
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[380px] w-[720px] rounded-full bg-accent-500/[0.08] blur-[120px] pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-24 h-[300px] w-[300px] rounded-full bg-accent-500/[0.08] blur-[100px] pointer-events-none"></div>

      <motion.div



        className="w-full max-w-md bg-white/90 backdrop-blur-xl rounded-3xl border border-slate-200/70 shadow-2xl shadow-slate-900/10 overflow-hidden z-10"
      >

        {/* Header — light, landing-style */}
        <div className="px-8 pt-8 pb-6 text-center relative bg-gradient-to-b from-accent-500/[0.06] to-transparent border-b border-slate-100">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl overflow-hidden bg-accent-500 shadow-lg shadow-accent-500/25 flex items-center justify-center ring-1 ring-white/40">
            <img src={icon} alt="System Academy SaaS" className="center-logo-img w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">إدارة المنصة</h1>
          <div className="inline-flex items-center gap-1.5 mt-2 px-3.5 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20">
            <ShieldCheck className="h-3.5 w-3.5 text-accent-500" />
            <span className="text-[11px] font-black text-accent-500">دخول إدارة المنصة (SaaS) فقط</span>
          </div>
        </div>

        <div className="p-8 space-y-6">

          {/* Login Form */}
          <form onSubmit={handleFormSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center">
                ⚠️ {error}
              </div>
            )}

            <div>
              <label className="text-xs font-black text-slate-500 block mb-2" htmlFor="login-email">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full pr-10 pl-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-500 focus:border-accent-500 focus:ring-0 outline-none transition"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-black text-slate-500 block mb-2" htmlFor="login-password">كلمة السر</label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-10 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-500 focus:border-accent-500 focus:ring-0 outline-none transition"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="إظهار أو إخفاء كلمة السر"
                  aria-pressed={showPassword}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="group w-full py-4 bg-gradient-to-r from-accent-500 to-accent-700 hover:from-accent-700 hover:to-accent-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-sm rounded-2xl transition shadow-xl shadow-accent-500/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 rotate-180 group-hover:translate-x-[-3px] transition-transform" />
              )}
              <span>{isSubmitting ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}</span>
            </button>
          </form>

          <p className="text-[11px] text-slate-500 text-center font-bold pt-1">
            System Academy SaaS © 2026
          </p>

        </div>
      </motion.div>
    </div>
  );
}
