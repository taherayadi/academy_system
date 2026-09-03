import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { UserAccount } from '../types';
import { verifyPassword } from '../auth';
import logo from '../assets/logo.png';

interface LoginScreenProps {
  onLogin: (user: UserAccount) => void;
  centerName?: string;
  onBackToLanding?: () => void;
}

export default function LoginScreen({ onLogin, centerName, onBackToLanding }: LoginScreenProps) {
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
      const user = await verifyPassword(cleanEmail, password.trim());
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'كلمة السر غير صحيحة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FCFAF6] flex items-center justify-center p-4 relative overflow-hidden font-sans" dir="rtl">
      
      {/* Background Decorative Blurs */}
      <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 bg-[#257C86] rounded-full opacity-10 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 bg-[#8DC760] rounded-full opacity-10 blur-3xl pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md bg-white rounded-3xl border border-[#257C86]/20 shadow-xl overflow-hidden z-10"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0e3036] via-[#17555f] to-[#2b6b4f] text-white p-8 text-center relative">
          {onBackToLanding && (
            <button
              onClick={onBackToLanding}
              className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition cursor-pointer backdrop-blur-xs"
              title="العودة إلى الموقع التعريفي"
            >
              <span>← الموقع التعريفي</span>
            </button>
          )}
          <div className="w-20 h-20 mx-auto mb-3 overflow-hidden rounded-2xl bg-white p-1.5 ring-1 ring-white/40 shadow-lg">
            <img src={logo} alt={centerName || 'المركز'} className="w-full h-full object-cover rounded-xl" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">منظمة {centerName || 'المركز'}</h1>
          <p className="text-xs text-emerald-200 font-bold mt-1">تسجيل الدخول الإداري</p>
        </div>

        <div className="p-8 space-y-6">
          
          {/* Login Form */}
          <form onSubmit={handleFormSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center">
                ⚠️ {error}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute right-3.5 top-3" />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#257C86] text-slate-900"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">كلمة السر</label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-400 absolute right-3.5 top-3" />
                <input 
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#257C86] text-slate-900"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-[#257C86] hover:bg-[#1e626b] disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-2xl transition shadow-lg shadow-[#257C86]/25 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 rotate-180" />
              )}
              <span>{isSubmitting ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}</span>
            </button>
          </form>

          <p className="text-[10px] text-slate-400 text-center font-bold pt-2">
            منظمة {centerName || 'المركز'} © 2026
          </p>

        </div>
      </motion.div>
    </div>
  );
}
