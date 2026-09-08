import React, { useState, useMemo } from 'react';
import { submitDemoRequestApi } from '../api';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap,
  Users,
  Clock,
  CreditCard,
  Bus,
  Utensils,
  BookOpen,
  Award,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ChevronDown,
  LogIn,
  Send,
  Calendar,
  DollarSign,
  TrendingUp,
  Zap,
  Star,
  Check,
  Search,
  Bell,
  Receipt,
  Layers
} from 'lucide-react';
import logo from '../assets/logo.png';

interface LandingPageProps {
  onOpenLogin: () => void;
  centerName?: string;
}

// ─── Module catalogue ──────────────────────────────────────────────
const ALL_MODULES = [
  { key: 'scolaire', label: 'Scolaire & Notes', icon: GraduationCap, price: 20, description: 'Fiches élèves, notes, moyennes et bulletins par trimestre.' },
  { key: 'finance', label: 'Finance & Paiements', icon: DollarSign, price: 20, description: 'Reçus, encaissements, chèques et statistiques de revenus.' },
  { key: 'etude', label: 'Étude Surveillée', icon: BookOpen, price: 15, description: 'Planning, présences, horaires.' },
  { key: 'coursParticuliers', label: 'Cours Particuliers', icon: Users, price: 15, description: 'Cours 1-à-1, tarification.' },
  { key: 'revision', label: 'Révision Examens', icon: Award, price: 15, description: 'Séances révision, groupes.' },
  { key: 'formations', label: 'Formations', icon: Sparkles, price: 15, description: 'Ateliers, stages vacances.' },
  { key: 'cantine', label: 'Cantine & Repas', icon: Utensils, price: 18, description: 'Abonnements, pointage repas.' },
  { key: 'transport', label: 'Transport Scolaire', icon: Bus, price: 15, description: 'Feuilles route, circuits.' },
  { key: 'events', label: 'Événements & Sorties', icon: Calendar, price: 15, description: 'Inscriptions, sorties scolaires.' },
  { key: 'bibliotheque', label: 'Bibliothèque', icon: BookOpen, price: 12, description: 'Prêts livres, inventaire.' },
  { key: 'studentTimeSheets', label: 'Pointage Élèves', icon: Clock, price: 12, description: 'Entrées/sorties journalières.' },
  { key: 'staff', label: 'Personnel & Salaires', icon: ShieldCheck, price: 12, description: 'Équipe, paie, pointages.' }
] as const;

// Accent colors per module (literal Tailwind classes so the JIT picks them up)
const MODULE_ACCENTS: Record<string, string> = {
  scolaire: 'bg-teal-400/15 text-teal-300',
  finance: 'bg-emerald-400/15 text-emerald-300',
  etude: 'bg-sky-400/15 text-sky-300',
  coursParticuliers: 'bg-violet-400/15 text-violet-300',
  revision: 'bg-amber-400/15 text-amber-300',
  formations: 'bg-fuchsia-400/15 text-fuchsia-300',
  cantine: 'bg-orange-400/15 text-orange-300',
  transport: 'bg-blue-400/15 text-blue-300',
  events: 'bg-rose-400/15 text-rose-300',
  bibliotheque: 'bg-cyan-400/15 text-cyan-300',
  studentTimeSheets: 'bg-lime-400/15 text-lime-300',
  staff: 'bg-indigo-400/15 text-indigo-300'
};

const modulesPrice = (keys: string[]) =>
  keys.reduce((sum, key) => sum + (ALL_MODULES.find(m => m.key === key)?.price || 0), 0);

// ─── Plans (le plan de base = Scolaire + Finance) ──────────────────
interface PlanDef {
  key: string;
  name: string;
  badge: string | null;
  tagline: string;
  moduleKeys: string[];
  featured: boolean;
}

const PLANS: PlanDef[] = [
  {
    key: 'essentiel',
    name: 'Essentiel',
    badge: 'Plan de base',
    tagline: 'Le socle indispensable pour gérer votre académie : scolarité et finance.',
    moduleKeys: ['scolaire', 'finance'],
    featured: true
  },
  {
    key: 'standard',
    name: 'Standard',
    badge: 'Recommandé',
    tagline: 'Pour les centres qui grandissent : le plan de base + les services du quotidien.',
    moduleKeys: ['scolaire', 'finance', 'etude', 'coursParticuliers', 'cantine'],
    featured: false
  },
  {
    key: 'complet',
    name: 'Complet',
    badge: 'Tout inclus',
    tagline: 'Toute la puissance de la plateforme, sans limite.',
    moduleKeys: ALL_MODULES.map(m => m.key),
    featured: false
  }
];

// ─── Hero mock dashboard data ──────────────────────────────────────
const MOCK_BARS = [
  { m: 'Sep', v: 34 },
  { m: 'Oct', v: 52 },
  { m: 'Nov', v: 44 },
  { m: 'Déc', v: 68 },
  { m: 'Jan', v: 58 },
  { m: 'Fév', v: 86 }
];

export default function LandingPage({ onOpenLogin, centerName = 'System Academy' }: LandingPageProps) {
  // Pricing state — default: the basic plan (Scolaire + Finance)
  const [selectedModules, setSelectedModules] = useState<string[]>(['scolaire', 'finance']);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Contact / Demo form state
  const [requestType, setRequestType] = useState<'trial' | 'demo' | 'info'>('trial');
  const [fullName, setFullName] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // FAQ accordion
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // ─── Pricing math ────────────────────────────────────────────────
  const { monthlyPrice, annualMonthly, annualTotal, savings, matchedPlan } = useMemo(() => {
    const monthly = modulesPrice(selectedModules);
    const aMonthly = monthly * 0.8;
    const aTotal = monthly * 12 * 0.8;
    const save = monthly * 12 - aTotal;
    const sameSet = (a: string[]) =>
      a.length === selectedModules.length && a.every(k => selectedModules.includes(k));
    const match = PLANS.find(p => sameSet(p.moduleKeys));
    return { monthlyPrice: monthly, annualMonthly: aMonthly, annualTotal: aTotal, savings: save, matchedPlan: match || null };
  }, [selectedModules]);

  const toggleModule = (key: string) => {
    setSelectedModules(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const applyPlan = (plan: PlanDef) => {
    setSelectedModules(plan.moduleKeys);
    scrollToSection('contact');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await submitDemoRequestApi({
        requestType,
        fullName,
        academyName,
        email,
        phone,
        estimatedSize: `${selectedModules.length} modules`,
        requestedModules: selectedModules,
        message
      });
      setFormSubmitted(true);
    } catch {
      try {
        const newRequest = {
          id: `REQ-${Date.now()}`,
          requestType, fullName, academyName, email, phone,
          estimatedSize: `${selectedModules.length} modules`,
          message,
          submittedAt: new Date().toISOString()
        };
        const existing = JSON.parse(localStorage.getItem('academy_demo_requests') || '[]');
        existing.unshift(newRequest);
        localStorage.setItem('academy_demo_requests', JSON.stringify(existing));
      } catch { /* ignore */ }
      setFormSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const faqs = [
    {
      q: 'Que contient le plan de base ?',
      a: 'Le plan de base (Essentiel) regroupe les deux modules fondamentaux : Scolaire & Notes (fiches élèves, notes, bulletins) et Finance & Paiements (reçus, encaissements, statistiques). C’est le point de départ idéal, à 40 TND/mois.'
    },
    {
      q: 'Comment fonctionne la tarification par module ?',
      a: 'Vous choisissez uniquement les modules dont vous avez besoin. Chaque module a un prix mensuel fixe (12 à 20 TND/mois). Vous pouvez ajouter ou retirer des modules à tout moment selon l’évolution de votre centre.'
    },
    {
      q: 'Puis-je commencer avec le plan de base et ajouter des modules plus tard ?',
      a: 'Absolument ! Démarrez avec le plan Essentiel (Scolaire + Finance) et activez de nouveaux modules quand vous en avez besoin, en un clic depuis votre tableau de bord. Pas de frais d’activation supplémentaires.'
    },
    {
      q: 'Y a-t-il une limite au nombre d’élèves ou d’utilisateurs ?',
      a: 'Non, aucune limite ! Le prix dépend uniquement des modules activés, pas du nombre d’élèves, de parents ou d’utilisateurs. Vous pouvez gérer 10 ou 500 élèves au même tarif.'
    },
    {
      q: 'Comment fonctionne l’essai gratuit de 14 jours ?',
      a: 'Essai gratuit total sans carte bancaire. Tous les modules sont accessibles pendant 14 jours. Vos données restent même après l’essai si vous souscrivez.'
    },
    {
      q: 'Puis-je annuler ou changer mes modules à tout moment ?',
      a: 'Oui, sans engagement de durée. Modifiez vos modules depuis votre tableau de bord ou contactez-nous. Les changements prennent effet au cycle suivant.'
    }
  ];

  const requestTypes: { key: 'trial' | 'demo' | 'info'; label: string }[] = [
    { key: 'trial', label: 'Essai gratuit' },
    { key: 'demo', label: 'Démo guidée' },
    { key: 'info', label: 'Plus d’infos' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans antialiased overflow-x-clip" dir="ltr">

      {/* ─── AURORA BACKGROUND ─────────────────────────────────────── */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 h-[560px] w-[900px] rounded-full bg-teal-500/20 blur-[140px]" />
        <div className="absolute top-1/4 -left-40 h-[420px] w-[420px] rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 h-[460px] w-[460px] rounded-full bg-blue-600/10 blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[600px] rounded-full bg-violet-600/10 blur-[140px]" />
        {/* subtle grid */}
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.05) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 90% 55% at 50% 0%, black 30%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 55% at 50% 0%, black 30%, transparent 100%)'
          }}
        />
      </div>

      {/* ─── NAVIGATION ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-slate-950/70 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 p-1.5 shadow-lg shadow-teal-500/30 flex items-center justify-center">
              <img src={logo} alt={centerName} className="w-full h-full object-contain brightness-0 invert" />
            </div>
            <div>
              <div className="text-base font-extrabold tracking-tight text-white">{centerName}</div>
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em]">Gestion Académique</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1">
            <button onClick={() => scrollToSection('features')} className="px-4 py-1.5 text-sm font-bold text-slate-400 hover:text-white transition rounded-full hover:bg-white/5">Modules</button>
            <button onClick={() => scrollToSection('pricing')} className="px-4 py-1.5 text-sm font-bold text-slate-400 hover:text-white transition rounded-full hover:bg-white/5">Tarifs</button>
            <button onClick={() => scrollToSection('faq')} className="px-4 py-1.5 text-sm font-bold text-slate-400 hover:text-white transition rounded-full hover:bg-white/5">FAQ</button>
            <button onClick={() => scrollToSection('contact')} className="px-4 py-1.5 text-sm font-bold text-slate-400 hover:text-white transition rounded-full hover:bg-white/5">Contact</button>
          </nav>

          <button onClick={onOpenLogin} className="flex items-center gap-2 px-4 py-2 bg-white text-slate-950 text-sm font-extrabold rounded-xl transition hover:bg-teal-100 shadow-lg shadow-white/10">
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Connexion</span>
          </button>
        </div>
      </header>

      {/* ─── HERO ──────────────────────────────────────────────────── */}
      <section className="relative pt-20 sm:pt-28 pb-16 sm:pb-24">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-teal-400/20 backdrop-blur mb-7"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400"></span>
            </span>
            <span className="text-sm font-bold text-teal-200">Nouveau · Plan de base Scolaire + Finance à 40 TND/mois</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight mb-6 leading-[1.1]"
          >
            La gestion de votre académie,
            <br />
            <span className="bg-gradient-to-r from-teal-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              enfin simple et moderne
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Commencez avec l’essentiel — <span className="text-white font-bold">Scolaire &amp; Notes</span> et{' '}
            <span className="text-white font-bold">Finance &amp; Paiements</span> — puis ajoutez des modules
            à la carte. Aucune limite d’élèves. Aucun engagement.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10"
          >
            <button
              onClick={() => scrollToSection('contact')}
              className="group px-8 py-4 bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 font-extrabold text-base rounded-2xl shadow-xl shadow-teal-500/25 transition-all duration-300 hover:shadow-teal-400/40 hover:-translate-y-0.5 flex items-center gap-2"
            >
              Essai gratuit 14 jours
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold text-base rounded-2xl border border-white/15 backdrop-blur transition-all duration-300 hover:-translate-y-0.5"
            >
              Voir les tarifs
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.45 }}
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500"
          >
            {['Sans carte bancaire', 'Sans engagement', 'Support 7j/7'].map(t => (
              <div key={t} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-400" />
                <span className="font-bold">{t}</span>
              </div>
            ))}
          </motion.div>

          {/* ── Floating dashboard mockup ── */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.5 }}
            className="relative mx-auto mt-16 max-w-4xl"
          >
            <div className="absolute -inset-6 bg-gradient-to-r from-teal-500/25 via-cyan-500/10 to-blue-500/25 blur-3xl rounded-[3rem]" />

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              className="relative rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden text-left"
            >
              {/* window chrome */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/5 bg-white/[0.03]">
                <span className="h-3 w-3 rounded-full bg-rose-500/70" />
                <span className="h-3 w-3 rounded-full bg-amber-400/70" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
                <div className="ml-4 hidden sm:flex items-center gap-2 text-xs text-slate-500 font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
                  app.system-academy.tn
                </div>
                <div className="ml-auto flex items-center gap-4 text-slate-500">
                  <Search className="h-4 w-4" />
                  <Bell className="h-4 w-4" />
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-teal-400 to-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-[52px_1fr] sm:grid-cols-[170px_1fr]">
                {/* sidebar */}
                <div className="border-r border-white/5 bg-white/[0.02] py-4 flex flex-col gap-1 px-2 sm:px-3">
                  {[
                    { icon: Layers, label: 'Tableau de bord', active: true },
                    { icon: GraduationCap, label: 'Élèves', active: false },
                    { icon: DollarSign, label: 'Finance', active: false },
                    { icon: BookOpen, label: 'Étude', active: false },
                    { icon: Utensils, label: 'Cantine', active: false },
                    { icon: Users, label: 'Personnel', active: false }
                  ].map(item => (
                    <div
                      key={item.label}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-bold ${
                        item.active
                          ? 'bg-teal-400/15 text-teal-300'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </div>
                  ))}
                </div>

                {/* main panel */}
                <div className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-extrabold text-white">Tableau de bord</div>
                    <div className="text-[10px] font-bold text-slate-500 border border-white/10 rounded-full px-3 py-1">Année 2025–2026</div>
                  </div>

                  {/* stat cards */}
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-4">
                    {[
                      { label: 'Élèves inscrits', value: '248', delta: '+12%', icon: Users, tone: 'text-teal-300' },
                      { label: 'Encaissé ce mois', value: '4 320', unit: 'TND', delta: '+8%', icon: CreditCard, tone: 'text-emerald-300' },
                      { label: 'Chèques en attente', value: '3', delta: '2 cashés', icon: Receipt, tone: 'text-amber-300' }
                    ].map(s => (
                      <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <s.icon className={`h-3.5 w-3.5 ${s.tone}`} />
                          <span className="text-[9px] font-bold text-emerald-400">{s.delta}</span>
                        </div>
                        <div className="text-base sm:text-lg font-extrabold text-white leading-none">
                          {s.value}<span className="text-[10px] text-slate-500 font-bold ml-1">{s.unit}</span>
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-bold text-slate-500 mt-1">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* chart */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] font-extrabold text-slate-300">Revenus par mois</div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-teal-300">
                        <TrendingUp className="h-3 w-3" /> +24%
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-2 h-24 sm:h-28">
                      {MOCK_BARS.map((b, i) => (
                        <div key={b.m} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${b.v}%` }}
                            transition={{ duration: 0.9, delay: 0.8 + i * 0.12, ease: 'easeOut' }}
                            className={`w-full rounded-md ${
                              i === MOCK_BARS.length - 1
                                ? 'bg-gradient-to-t from-teal-500 to-cyan-400 shadow-lg shadow-teal-500/30'
                                : 'bg-white/10'
                            }`}
                          />
                          <span className="text-[9px] font-bold text-slate-600">{b.m}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* payments list */}
                  <div className="space-y-2">
                    {[
                      { name: 'Ahmed Ben Ali', detail: 'Suivi · Janvier', amount: '80 TND', ok: true },
                      { name: 'Fatma Trabelsi', detail: 'Étude · Janvier', amount: '60 TND', ok: true },
                      { name: 'Youssef Gharbi', detail: 'Cantine · Janvier', amount: '75 TND', ok: false }
                    ].map(p => (
                      <div key={p.name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-[9px] font-extrabold text-white">
                          {p.name.split(' ').map(w => w[0]).join('')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-bold text-white truncate">{p.name}</div>
                          <div className="text-[9px] font-semibold text-slate-500">{p.detail}</div>
                        </div>
                        <div className="text-[11px] font-extrabold text-white">{p.amount}</div>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${p.ok ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
                          {p.ok ? 'Payé' : 'En attente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* floating chips */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              className="absolute -top-5 -right-3 sm:-right-8 hidden sm:flex items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur px-4 py-3 shadow-2xl shadow-black/40"
            >
              <div className="p-2 rounded-xl bg-emerald-400/15">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-white">Reçu #1042 envoyé</div>
                <div className="text-[10px] font-bold text-slate-500">Paiement encaissé</div>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute -bottom-5 -left-3 sm:-left-10 hidden sm:flex items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur px-4 py-3 shadow-2xl shadow-black/40"
            >
              <div className="p-2 rounded-xl bg-teal-400/15">
                <TrendingUp className="h-4 w-4 text-teal-300" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-white">+18 élèves ce mois</div>
                <div className="text-[10px] font-bold text-slate-500">Inscriptions 2026</div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── STATS STRIP ───────────────────────────────────────────── */}
      <section className="relative py-10 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          {[
            { value: '12', label: 'Modules à la carte' },
            { value: '40 TND', label: 'Le plan de base / mois' },
            { value: '14 jours', label: 'Essai gratuit complet' },
            { value: '0', label: 'Limite d’élèves & d’utilisateurs' }
          ].map(s => (
            <div key={s.label}>
              <div className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-teal-300 to-cyan-400 bg-clip-text text-transparent mb-1">{s.value}</div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES / MODULES BENTO ──────────────────────────────── */}
      <section id="features" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
              <Sparkles className="h-3.5 w-3.5" />
              12 Modules disponibles
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Activez uniquement ce dont
              <br className="hidden sm:block" /> vous avez besoin
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Chaque module est autonome et prêt à l’emploi. Les deux modules du plan de base sont mis en avant ci-dessous.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ALL_MODULES.map((mod, i) => {
              const isBase = mod.key === 'scolaire' || mod.key === 'finance';
              return (
                <motion.div
                  key={mod.key}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: (i % 4) * 0.07 }}
                  viewport={{ once: true, margin: '-60px' }}
                  className={`group relative p-6 rounded-2xl border backdrop-blur transition-all duration-300 hover:-translate-y-1 ${
                    isBase
                      ? 'sm:col-span-2 border-teal-400/25 bg-gradient-to-br from-teal-400/10 via-white/[0.04] to-transparent hover:border-teal-300/50 hover:shadow-[0_0_50px_-12px_rgba(45,212,191,0.45)]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]'
                  }`}
                >
                  {isBase && (
                    <span className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-400/15 border border-teal-400/25 text-[10px] font-extrabold text-teal-300 uppercase tracking-wider">
                      <Star className="h-3 w-3" />
                      Plan de base
                    </span>
                  )}
                  <div className={`inline-flex p-3 rounded-xl mb-4 ${MODULE_ACCENTS[mod.key] || 'bg-white/10 text-slate-300'} group-hover:scale-110 transition-transform`}>
                    <mod.icon className="h-6 w-6" />
                  </div>
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <h3 className={`font-extrabold text-white ${isBase ? 'text-lg' : 'text-base'}`}>{mod.label}</h3>
                    <div className="text-right flex-shrink-0">
                      <span className={`font-extrabold ${isBase ? 'text-2xl text-teal-300' : 'text-lg text-white'}`}>{mod.price}</span>
                      <span className="text-[10px] font-bold text-slate-500 block">TND/mois</span>
                    </div>
                  </div>
                  <p className={`text-slate-400 ${isBase ? 'text-sm' : 'text-xs'} leading-relaxed`}>{mod.description}</p>
                </motion.div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ─── PRICING PLANS ─────────────────────────────────────────── */}
      <section id="pricing" className="py-20 sm:py-28 relative">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[400px] w-[700px] rounded-full bg-teal-500/10 blur-[140px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
              <Zap className="h-3.5 w-3.5" />
              Tarifs simples
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Un plan pour chaque étape
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Commencez par la base — <span className="text-white font-bold">Scolaire &amp; Finance</span> — et évoluez à votre rythme.
            </p>
          </div>

          {/* Billing cycle toggle */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex items-center p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2.5 rounded-xl text-sm font-extrabold transition-all ${
                  billingCycle === 'monthly' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
              >
                Mensuel
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-6 py-2.5 rounded-xl text-sm font-extrabold transition-all flex items-center gap-2 ${
                  billingCycle === 'annual' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
              >
                Annuel
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${billingCycle === 'annual' ? 'bg-teal-500 text-white' : 'bg-teal-400/20 text-teal-300'}`}>
                  -20%
                </span>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">

            {PLANS.map((plan, idx) => {
              const base = modulesPrice(plan.moduleKeys);
              const price = billingCycle === 'monthly' ? base : base * 0.8;
              const yearlyTotal = base * 12 * 0.8;
              return (
                <motion.div
                  key={plan.key}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: idx * 0.12 }}
                  viewport={{ once: true, margin: '-60px' }}
                  className={`relative flex flex-col p-8 rounded-3xl border backdrop-blur ${
                    plan.featured
                      ? 'border-teal-400/40 bg-gradient-to-b from-teal-400/10 via-slate-900/80 to-slate-900/80 shadow-[0_0_70px_-18px_rgba(45,212,191,0.5)] lg:-translate-y-3'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  {plan.badge && (
                    <span className={`absolute -top-3.5 left-8 px-3.5 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                      plan.featured ? 'bg-gradient-to-r from-teal-400 to-cyan-400 text-slate-950 shadow-lg shadow-teal-500/40' : 'bg-white/10 text-slate-300 border border-white/10'
                    }`}>
                      {plan.badge}
                    </span>
                  )}

                  <div className="mb-1 text-lg font-extrabold text-white">{plan.name}</div>
                  <p className="text-sm text-slate-400 leading-relaxed mb-6 min-h-[40px]">{plan.tagline}</p>

                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-5xl font-extrabold text-white tracking-tight">
                      {billingCycle === 'annual' ? price.toFixed(0) : price}
                    </span>
                    <span className="text-sm font-bold text-slate-500 pb-1.5">TND / mois</span>
                  </div>
                  <div className="text-xs font-bold text-slate-500 mb-6 h-4">
                    {billingCycle === 'annual'
                      ? `Facturé ${yearlyTotal.toFixed(0)} TND / an — économisez ${(base * 12 * 0.2).toFixed(0)} TND`
                      : 'Sans engagement, résiliable à tout moment'}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.moduleKeys.map(key => {
                      const mod = ALL_MODULES.find(m => m.key === key)!;
                      return (
                        <li key={key} className="flex items-center gap-3 text-sm">
                          <span className={`p-1 rounded-md ${MODULE_ACCENTS[key] || 'bg-white/10 text-slate-300'}`}>
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-bold text-slate-200 flex-1">{mod.label}</span>
                          <span className="text-xs font-bold text-slate-500">{mod.price} TND</span>
                        </li>
                      );
                    })}
                  </ul>

                  <button
                    onClick={() => applyPlan(plan)}
                    className={`w-full py-3.5 rounded-2xl font-extrabold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                      plan.featured
                        ? 'bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 shadow-lg shadow-teal-500/30 hover:shadow-teal-400/50 hover:-translate-y-0.5'
                        : 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
                    }`}
                  >
                    Choisir {plan.name}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </motion.div>
              );
            })}
          </div>

          {/* ── Custom calculator ── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: '-60px' }}
            className="mt-14 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur overflow-hidden"
          >
            <div className="p-7 sm:p-9 border-b border-white/5">
              <h3 className="text-lg font-extrabold text-white mb-1.5 flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-teal-400/15">
                  <Sparkles className="h-5 w-5 text-teal-300" />
                </span>
                Composez votre plan sur mesure
              </h3>
              <p className="text-sm text-slate-400">
                Sélectionnez les modules dont votre académie a besoin — le prix s’adapte automatiquement.
              </p>
            </div>

            {/* Module selection grid */}
            <div className="p-7 sm:p-9 border-b border-white/5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ALL_MODULES.map(mod => {
                  const isSelected = selectedModules.includes(mod.key);
                  const isBase = mod.key === 'scolaire' || mod.key === 'finance';
                  return (
                    <button
                      key={mod.key}
                      onClick={() => toggleModule(mod.key)}
                      className={`group p-4 rounded-2xl border text-left transition-all duration-200 flex items-center gap-3.5 ${
                        isSelected
                          ? 'border-teal-400/50 bg-teal-400/10 shadow-[0_0_30px_-10px_rgba(45,212,191,0.4)]'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl flex-shrink-0 transition-colors ${MODULE_ACCENTS[mod.key] || 'bg-white/10 text-slate-300'}`}>
                        <mod.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-white truncate">{mod.label}</span>
                          {isBase && <span className="text-[9px] font-extrabold text-teal-300 bg-teal-400/15 border border-teal-400/25 rounded-full px-2 py-0.5 uppercase tracking-wide flex-shrink-0">Base</span>}
                        </div>
                        <div className="text-xs text-slate-500 font-semibold truncate">{mod.description}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-base font-extrabold ${isSelected ? 'text-teal-300' : 'text-white'}`}>{mod.price}</div>
                        <div className="text-[9px] font-bold text-slate-500">TND/mois</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price summary */}
            <div className="p-7 sm:p-9 bg-gradient-to-br from-teal-400/10 via-white/[0.04] to-blue-500/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">

                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="text-sm font-bold text-slate-400">
                      {selectedModules.length} module{selectedModules.length > 1 ? 's' : ''} sélectionné{selectedModules.length > 1 ? 's' : ''}
                    </span>
                    {matchedPlan && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-400/15 border border-teal-400/30 text-[11px] font-extrabold text-teal-300">
                        <Check className="h-3 w-3" />
                        Plan {matchedPlan.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-5xl font-extrabold text-white tracking-tight">
                      {billingCycle === 'monthly' ? monthlyPrice : annualMonthly.toFixed(0)}
                    </span>
                    <span className="text-sm font-bold text-slate-400 pb-1.5">TND {billingCycle === 'monthly' ? '/ mois' : '/ mois (annuel)'}</span>
                  </div>
                  {billingCycle === 'annual' && (
                    <div className="mt-2 text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4" />
                      {annualTotal.toFixed(0)} TND facturé à l’année · économie de {savings.toFixed(0)} TND
                    </div>
                  )}
                </div>

                <button
                  onClick={() => scrollToSection('contact')}
                  className="px-8 py-4 bg-gradient-to-r from-teal-400 to-cyan-500 hover:from-teal-300 hover:to-cyan-400 text-slate-950 font-extrabold rounded-2xl shadow-xl shadow-teal-500/25 transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  Démarrer l’essai gratuit
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-7 mt-7 border-t border-white/10">
                {[
                  { icon: Users, title: 'Élèves illimités', sub: 'Aucune limite' },
                  { icon: ShieldCheck, title: 'Utilisateurs', sub: 'Multi-comptes inclus' },
                  { icon: Star, title: 'Support', sub: '7j/7 inclus' }
                ].map(f => (
                  <div key={f.title} className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <f.icon className="h-5 w-5 text-teal-300" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-500">{f.title}</div>
                      <div className="text-sm font-extrabold text-white">{f.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
              Questions fréquentes
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Tout ce que vous devez savoir
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  className={`rounded-2xl border backdrop-blur overflow-hidden transition-colors duration-300 ${
                    open ? 'border-teal-400/30 bg-teal-400/[0.06]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full p-5 sm:p-6 flex items-center justify-between text-left gap-4"
                  >
                    <span className="text-sm sm:text-base font-extrabold text-white">{faq.q}</span>
                    <span className={`p-1.5 rounded-lg flex-shrink-0 transition-all duration-300 ${open ? 'bg-teal-400/20 text-teal-300 rotate-180' : 'bg-white/5 text-slate-500'}`}>
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 sm:px-6 pb-6 text-sm text-slate-400 leading-relaxed">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ─── CONTACT / TRIAL FORM ──────────────────────────────────── */}
      <section id="contact" className="py-20 sm:py-28 relative">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-teal-500/10 blur-[150px] pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">

          {formSubmitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-20 rounded-3xl border border-teal-400/20 bg-white/[0.03] backdrop-blur"
            >
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 shadow-xl shadow-teal-500/40 mb-7">
                <CheckCircle2 className="h-10 w-10 text-slate-950" />
              </div>
              <h3 className="text-3xl font-extrabold text-white mb-4">Demande envoyée avec succès !</h3>
              <p className="text-lg text-slate-400 mb-8 max-w-md mx-auto">
                Notre équipe vous contactera dans les 24h pour configurer votre essai gratuit.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-7 py-3 bg-white/10 text-white font-bold rounded-xl border border-white/15 hover:bg-white/15 transition"
              >
                Retour à l’accueil
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-14 items-start">

              {/* Left pitch */}
              <div className="lg:sticky lg:top-28">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
                  Démarrez gratuitement
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-tight leading-tight">
                  Essai gratuit,
                  <br />
                  14 jours. Sans carte.
                </h2>
                <p className="text-slate-400 text-lg leading-relaxed mb-8">
                  Accès complet à tous les modules, configuration gratuite par notre équipe.
                  Vous ne payez que ce que vous activez — à partir du plan de base{' '}
                  <span className="text-white font-bold">Scolaire + Finance</span>.
                </p>

                <ul className="space-y-4">
                  {[
                    'Accès immédiat après validation',
                    'Configuration de votre centre offerte',
                    'Vos données conservées même après l’essai',
                    'Assistance WhatsApp dédiée'
                  ].map(t => (
                    <li key={t} className="flex items-center gap-3 text-sm font-bold text-slate-300">
                      <span className="p-1.5 rounded-lg bg-teal-400/15 text-teal-300">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Form card */}
              <form onSubmit={handleFormSubmit} className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-7 sm:p-9 shadow-2xl shadow-black/40">

                {/* request type segmented control */}
                <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-white/5 border border-white/10 mb-7">
                  {requestTypes.map(rt => (
                    <button
                      key={rt.key}
                      type="button"
                      onClick={() => setRequestType(rt.key)}
                      className={`py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
                        requestType === rt.key
                          ? 'bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 shadow-lg shadow-teal-500/25'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {rt.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Votre nom complet *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                      placeholder="Ahmed Ben Ali"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Nom de votre académie *</label>
                    <input
                      type="text"
                      required
                      value={academyName}
                      onChange={e => setAcademyName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                      placeholder="Excellence Academy"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                      placeholder="contact@academy.tn"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Téléphone *</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                      placeholder="+216 XX XXX XXX"
                    />
                  </div>
                </div>

                <div className="mb-7">
                  <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Message (optionnel)</label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition resize-none focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                    placeholder="Dites-nous en plus sur vos besoins…"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-gradient-to-r from-teal-400 to-cyan-500 hover:from-teal-300 hover:to-cyan-400 text-slate-950 font-extrabold text-base rounded-2xl shadow-xl shadow-teal-500/25 transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    'Envoi en cours…'
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Démarrer mon essai gratuit
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] font-semibold text-slate-600 mt-4">
                  Plan sélectionné : {selectedModules.length} module{selectedModules.length > 1 ? 's' : ''}
                  {matchedPlan ? ` — Plan ${matchedPlan.name}` : ''}
                </p>

              </form>
            </div>
          )}

        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────────────────────────── */}
      <footer className="pt-14 pb-10 border-t border-white/5 bg-slate-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">

            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 p-1.5 shadow-lg shadow-teal-500/20 flex items-center justify-center">
                  <img src={logo} alt={centerName} className="w-full h-full object-contain brightness-0 invert" />
                </div>
                <span className="text-base font-extrabold text-white">{centerName}</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                La solution de gestion académique modulaire pour la Tunisie. Commencez avec le plan de base Scolaire + Finance, évoluez à votre rythme.
              </p>
            </div>

            <div>
              <div className="text-xs font-extrabold text-slate-500 uppercase tracking-[0.15em] mb-4">Navigation</div>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => scrollToSection('features')} className="text-left text-sm font-bold text-slate-400 hover:text-teal-300 transition w-fit">Modules</button>
                <button onClick={() => scrollToSection('pricing')} className="text-left text-sm font-bold text-slate-400 hover:text-teal-300 transition w-fit">Tarifs</button>
                <button onClick={() => scrollToSection('faq')} className="text-left text-sm font-bold text-slate-400 hover:text-teal-300 transition w-fit">FAQ</button>
                <button onClick={() => scrollToSection('contact')} className="text-left text-sm font-bold text-slate-400 hover:text-teal-300 transition w-fit">Contact</button>
                <button onClick={onOpenLogin} className="text-left text-sm font-bold text-slate-400 hover:text-teal-300 transition w-fit">Connexion</button>
              </div>
            </div>

            <div>
              <div className="text-xs font-extrabold text-slate-500 uppercase tracking-[0.15em] mb-4">Le plan de base</div>
              <div className="rounded-2xl border border-teal-400/20 bg-teal-400/5 p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <GraduationCap className="h-4 w-4 text-teal-300" />
                  <span className="text-sm font-extrabold text-white">Essentiel — 40 TND/mois</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Scolaire &amp; Notes + Finance &amp; Paiements. Élèves illimités, support 7j/7 inclus.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-7 border-t border-white/5 text-center">
            <p className="text-slate-600 text-xs font-semibold">
              © {new Date().getFullYear()} System Academy. Tous droits réservés.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
