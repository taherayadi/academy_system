import React, { useState, useMemo, useEffect, useRef } from 'react';
import { submitDemoRequestApi } from '../api';
import { motion, AnimatePresence, useInView, useScroll, useSpring } from 'motion/react';
import {
  GraduationCap,
  Users,
  Clock,
  Bus,
  Utensils,
  BookOpen,
  Award,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ChevronDown,
  Lock,
  LogIn,
  Send,
  Calendar,
  DollarSign,
  TrendingUp,
  Zap,
  Star,
  Check,
  Plus,
  Rocket,
  Search,
  Bell,
  Receipt,
  Layers,
  X,
  Quote,
  CreditCard
} from 'lucide-react';
import logo from '../assets/logo.png';

interface LandingPageProps {
  onOpenLogin: () => void;
  centerName?: string;
}

// ─── Module catalogue (landing only — bibliotheque & pointage élèves exclus) ──
const BASE_KEYS = ['scolaire', 'finance'] as const;

const ALL_MODULES = [
  { key: 'scolaire', label: 'Scolaire & Notes', icon: GraduationCap, price: 20, description: 'Fiches élèves, notes, moyennes et bulletins par trimestre.' },
  { key: 'finance', label: 'Finance & Paiements', icon: DollarSign, price: 20, description: 'Reçus, encaissements, chèques et statistiques de revenus.' },
  { key: 'etude', label: 'Étude Surveillée', icon: BookOpen, price: 15, description: 'Planning hebdomadaire, présences, horaires.' },
  { key: 'coursParticuliers', label: 'Cours Particuliers', icon: Users, price: 15, description: 'Cours 1-à-1, tarification, enseignants.' },
  { key: 'revision', label: 'Révision Examens', icon: Award, price: 15, description: 'Séances de révision, groupes, présences.' },
  { key: 'formations', label: 'Formations', icon: Sparkles, price: 15, description: 'Ateliers, stages vacances, plannings.' },
  { key: 'cantine', label: 'Cantine & Repas', icon: Utensils, price: 18, description: 'Menus hebdomadaires, abonnements, pointage.' },
  { key: 'transport', label: 'Transport Scolaire', icon: Bus, price: 15, description: 'Circuits, feuilles de route, chauffeurs.' },
  { key: 'events', label: 'Événements & Sorties', icon: Calendar, price: 15, description: 'Inscriptions, sorties scolaires.' },
  { key: 'staff', label: 'Personnel & Salaires', icon: ShieldCheck, price: 12, description: 'Équipe, paie, pointages, congés.' }
] as const;

const ADDON_MODULES = ALL_MODULES.filter(m => !(BASE_KEYS as readonly string[]).includes(m.key));
const BASE_MODULES = ALL_MODULES.filter(m => (BASE_KEYS as readonly string[]).includes(m.key));

// Accent tint per module (literal classes so the Tailwind JIT sees them)
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
  staff: 'bg-indigo-400/15 text-indigo-300'
};

const modulesPrice = (keys: readonly string[]) =>
  keys.reduce((sum, key) => sum + (ALL_MODULES.find(m => m.key === key)?.price || 0), 0);

// ─── Animated counter (stats band) ─────────────────────────────────
function Counter({ to, suffix = '', duration = 1500 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return <span ref={ref}>{val.toLocaleString('fr-TN')}{suffix}</span>;
}

// ─── Hero mock data ────────────────────────────────────────────────
const MOCK_BARS = [
  { m: 'Sep', v: 34 }, { m: 'Oct', v: 52 }, { m: 'Nov', v: 44 },
  { m: 'Déc', v: 68 }, { m: 'Jan', v: 58 }, { m: 'Fév', v: 88 }
];

const BASE_PRICE = modulesPrice(BASE_KEYS); // 40 TND

export default function LandingPage({ onOpenLogin, centerName = 'System Academy' }: LandingPageProps) {
  // ── Selection state : base toujours incluse, on ne peut qu'ajouter ──
  const [selectedModules, setSelectedModules] = useState<string[]>([...BASE_KEYS]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Contact / demo form
  const [requestType, setRequestType] = useState<'trial' | 'demo' | 'info'>('trial');
  const [fullName, setFullName] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Sticky selection bar visibility
  const [showBar, setShowBar] = useState(false);

  // Scroll progress
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });

  // ── Pricing math ──
  const addonKeys = useMemo(() => selectedModules.filter(k => !(BASE_KEYS as readonly string[]).includes(k)), [selectedModules]);
  const { monthlyPrice, annualMonthly, annualTotal, savings } = useMemo(() => {
    const monthly = modulesPrice(selectedModules);
    return {
      monthlyPrice: monthly,
      annualMonthly: monthly * 0.8,
      annualTotal: monthly * 12 * 0.8,
      savings: monthly * 12 * 0.2
    };
  }, [selectedModules]);

  // ── Selection logic : la base est verrouillée, on ne peut qu'ajouter ──
  const toggleModule = (key: string) => {
    if ((BASE_KEYS as readonly string[]).includes(key)) return; // base non retirable
    setSelectedModules(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // ── Sticky bar : visible après le hero, caché sur la section contact ──
  useEffect(() => {
    const onScroll = () => {
      const contact = document.getElementById('contact');
      const contactTop = contact ? contact.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
      setShowBar(window.scrollY > window.innerHeight * 0.85 && contactTop > window.innerHeight * 0.45);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
          requestedModules: selectedModules,
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
      a: 'Chaque abonnement démarre avec la base Scolaire & Notes + Finance & Paiements (40 TND/mois) : fiches élèves, notes et bulletins, carnets de paiements, reçus et statistiques de revenus. Ces deux modules sont toujours inclus et ne peuvent pas être retirés.'
    },
    {
      q: 'Comment ajouter des modules ?',
      a: 'Depuis la page Tarifs ou votre tableau de bord, activez les modules additionnels en un clic — Étude, Cantine, Transport, Cours Particuliers… Chaque module s’ajoute à votre abonnement au prix affiché, sans frais d’activation.'
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
      a: 'Oui, sans engagement de durée. Vous pouvez ajouter des modules à tout moment ; les changements prennent effet au cycle de facturation suivant.'
    },
    {
      q: 'Mes données sont-elles en sécurité ?',
      a: 'Vos données sont hébergées sur l’infrastructure Cloudflare avec sauvegardes régulières, et chaque centre est isolé dans son propre espace sécurisé.'
    }
  ];

  const requestTypes: { key: 'trial' | 'demo' | 'info'; label: string }[] = [
    { key: 'trial', label: 'Essai gratuit' },
    { key: 'demo', label: 'Démo guidée' },
    { key: 'info', label: 'Plus d’infos' }
  ];

  const testimonials = [
    {
      quote: 'J’ai démarré avec la base Scolaire + Finance. Trois mois plus tard, j’ai activé la cantine puis le transport — en un clic, sans rien réinstaller.',
      name: 'Rim Ben Salah',
      role: 'Directrice · Étoile Academy, Sfax',
      initials: 'RB',
      tint: 'from-teal-400 to-cyan-500'
    },
    {
      quote: 'Les reçus et le suivi des chèques nous ont fait gagner un temps fou. Fini les cahiers et les tableurs — tout est centralisé.',
      name: 'Karim Trabelsi',
      role: 'Gérant · Al Nour Center, Tunis',
      initials: 'KT',
      tint: 'from-violet-400 to-fuchsia-500'
    },
    {
      quote: 'Simple pour toute l’équipe, même les moins techniques. Et le support répond en minutes, pas en jours.',
      name: 'Salma Gharbi',
      role: 'Directrice pédagogique · Élite Studies, Sousse',
      initials: 'SG',
      tint: 'from-amber-400 to-orange-500'
    }
  ];

  return (
    <div className="min-h-screen bg-[#060a16] text-slate-200 font-sans antialiased overflow-x-clip selection:bg-teal-400/30" dir="ltr">

      {/* ─── SCROLL PROGRESS ───────────────────────────────────────── */}
      <motion.div
        style={{ scaleX: progress }}
        className="fixed top-0 left-0 right-0 h-[3px] z-[70] origin-left bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500"
      />

      {/* ─── AURORA BACKGROUND ─────────────────────────────────────── */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-56 left-1/2 -translate-x-1/2 h-[620px] w-[1100px] rounded-full bg-teal-500/15 blur-[160px]" />
        <div className="absolute top-1/3 -left-52 h-[460px] w-[460px] rounded-full bg-cyan-600/10 blur-[130px]" />
        <div className="absolute top-1/2 -right-52 h-[520px] w-[520px] rounded-full bg-violet-600/10 blur-[140px]" />
        <div className="absolute bottom-0 left-1/4 h-[420px] w-[640px] rounded-full bg-blue-600/10 blur-[150px]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.055) 1px, transparent 1px)',
            backgroundSize: '54px 54px',
            maskImage: 'radial-gradient(ellipse 85% 50% at 50% 0%, black 25%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 85% 50% at 50% 0%, black 25%, transparent 100%)'
          }}
        />
      </div>

      {/* ─── NAVIGATION ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#060a16]/75 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

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
            <button onClick={() => scrollToSection('base')} className="px-4 py-1.5 text-sm font-bold text-slate-400 hover:text-white transition rounded-full hover:bg-white/5">La base</button>
            <button onClick={() => scrollToSection('modules')} className="px-4 py-1.5 text-sm font-bold text-slate-400 hover:text-white transition rounded-full hover:bg-white/5">Modules</button>
            <button onClick={() => scrollToSection('pricing')} className="px-4 py-1.5 text-sm font-bold text-slate-400 hover:text-white transition rounded-full hover:bg-white/5">Tarifs</button>
            <button onClick={() => scrollToSection('faq')} className="px-4 py-1.5 text-sm font-bold text-slate-400 hover:text-white transition rounded-full hover:bg-white/5">FAQ</button>
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={onOpenLogin} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-bold rounded-xl transition">
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Connexion</span>
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 text-sm font-extrabold rounded-xl shadow-lg shadow-teal-500/25 transition hover:shadow-teal-400/40 hover:-translate-y-px"
            >
              Essai gratuit
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── HERO ──────────────────────────────────────────────────── */}
      <section className="relative pt-16 sm:pt-24 pb-14">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">

            {/* ── Copy ── */}
            <div className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55 }}
                className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/5 border border-teal-400/20 backdrop-blur mb-7"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400"></span>
                </span>
                <span className="text-[13px] font-bold text-teal-200">Base Scolaire + Finance — 40 TND/mois</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.08 }}
                className="text-[2.6rem] leading-[1.08] sm:text-6xl lg:text-[4.2rem] font-extrabold text-white tracking-tight mb-6"
              >
                Votre académie,
                <br />
                <span className="bg-gradient-to-r from-teal-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  sous contrôle total.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.16 }}
                className="text-lg text-slate-400 max-w-xl mx-auto lg:mx-0 mb-9 leading-relaxed"
              >
                Chaque abonnement démarre avec la base{' '}
                <span className="text-white font-bold">Scolaire &amp; Notes</span> +{' '}
                <span className="text-white font-bold">Finance &amp; Paiements</span>.
                Ajoutez des modules à la carte — étude, cantine, transport — uniquement
                quand vous en avez besoin.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.24 }}
                className="flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3.5 mb-9"
              >
                <button
                  onClick={() => scrollToSection('contact')}
                  className="group w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 font-extrabold text-base rounded-2xl shadow-xl shadow-teal-500/25 transition-all duration-300 hover:shadow-teal-400/40 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  Démarrer gratuitement
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => scrollToSection('pricing')}
                  className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold text-base rounded-2xl border border-white/15 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  <Layers className="h-5 w-5 text-teal-300" />
                  Composer mon abonnement
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-sm text-slate-500"
              >
                {['Essai 14 jours', 'Sans carte bancaire', 'Sans engagement'].map(t => (
                  <div key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-teal-400" />
                    <span className="font-bold">{t}</span>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* ── Product visual ── */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.3 }}
              className="relative mx-auto w-full max-w-[520px]"
            >
              <div className="absolute -inset-8 bg-gradient-to-tr from-teal-500/25 via-cyan-500/10 to-violet-500/20 blur-3xl rounded-[3rem]" />

              <motion.div
                animate={{ y: [0, -7, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                className="relative rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
              >
                {/* window chrome */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5 bg-white/[0.03]">
                  <span className="h-3 w-3 rounded-full bg-rose-500/70" />
                  <span className="h-3 w-3 rounded-full bg-amber-400/70" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
                  <div className="ml-3 hidden sm:flex items-center gap-2 text-[11px] text-slate-500 font-bold">
                    <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
                    app.system-academy.tn
                  </div>
                  <div className="ml-auto flex items-center gap-3.5 text-slate-500">
                    <Search className="h-4 w-4" />
                    <Bell className="h-4 w-4" />
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-teal-400 to-blue-500" />
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-extrabold text-white">Tableau de bord</div>
                    <div className="text-[10px] font-bold text-slate-500 border border-white/10 rounded-full px-3 py-1">2025–2026</div>
                  </div>

                  {/* stat cards */}
                  <div className="grid grid-cols-3 gap-2.5 mb-4">
                    {[
                      { label: 'Élèves inscrits', value: '248', delta: '+12%', icon: Users, tone: 'text-teal-300' },
                      { label: 'Encaissé · mois', value: '4 320', unit: 'TND', delta: '+8%', icon: CreditCard, tone: 'text-emerald-300' },
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
                            transition={{ duration: 0.9, delay: 0.9 + i * 0.12, ease: 'easeOut' }}
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

                  {/* payments */}
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
              </motion.div>

              {/* floating card : base incluse */}
              <motion.div
                animate={{ y: [0, -9, 0] }}
                transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                className="absolute -top-6 -right-2 sm:-right-6 rounded-2xl border border-teal-400/25 bg-slate-950/95 backdrop-blur px-4 py-3 shadow-2xl shadow-black/50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-3 w-3 text-teal-300" />
                  <span className="text-[10px] font-extrabold text-teal-300 uppercase tracking-wider">Base incluse</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {BASE_MODULES.map(m => (
                    <span key={m.key} className="flex items-center gap-1 text-[10px] font-bold text-white bg-white/10 rounded-full px-2.5 py-1">
                      <m.icon className="h-3 w-3 text-teal-300" />
                      {m.label.split(' ')[0]}
                    </span>
                  ))}
                </div>
              </motion.div>

              {/* floating card : module ajouté */}
              <motion.div
                animate={{ y: [0, 9, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                className="absolute -bottom-6 -left-2 sm:-left-8 rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur px-4 py-3 shadow-2xl shadow-black/50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-400/15">
                    <Utensils className="h-4 w-4 text-orange-300" />
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                      Cantine ajoutée
                      <span className="p-0.5 rounded-full bg-emerald-400/20">
                        <Plus className="h-2.5 w-2.5 text-emerald-300" />
                      </span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-500">+18 TND/mois</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── MARQUEE ───────────────────────────────────────────────── */}
      <section className="relative border-y border-white/5 bg-white/[0.02] py-5 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[#060a16] to-transparent pointer-events-none"
        />
        <div
          className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[#060a16] to-transparent pointer-events-none"
        />
        <div className="flex w-max animate-marquee gap-3">
          {[...ALL_MODULES, ...ALL_MODULES].map((m, i) => (
            <div
              key={`${m.key}-${i}`}
              className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 whitespace-nowrap"
            >
              <m.icon className="h-4 w-4 text-teal-300" />
              <span className="text-sm font-bold text-slate-300">{m.label}</span>
              <span className="text-xs font-extrabold text-slate-500">{m.price} TND</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── STATS ─────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-10 text-center">
          {[
            { value: 10, label: 'Modules disponibles', suffix: '' },
            { value: 40, label: 'TND — le plan de base / mois', suffix: '' },
            { value: 14, label: 'Jours d’essai gratuit', suffix: '' },
            { value: 0, label: 'Limite d’élèves & d’utilisateurs', suffix: '' }
          ].map(s => (
            <div key={s.label}>
              <div className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-teal-300 to-cyan-400 bg-clip-text text-transparent mb-2 tracking-tight">
                <Counter to={s.value} suffix={s.suffix} />
              </div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider leading-relaxed">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ──────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
              <Zap className="h-3.5 w-3.5" />
              Simple par conception
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Opérationnel en trois étapes
            </h2>
          </div>

          <div className="relative grid md:grid-cols-3 gap-10 md:gap-6">
            {/* connector line */}
            <div className="hidden md:block absolute top-7 left-[16%] right-[16%] h-px bg-gradient-to-r from-teal-400/50 via-cyan-400/30 to-blue-400/50" />

            {[
              {
                n: '01',
                title: 'Démarrez avec la base',
                text: 'Scolaire & Notes et Finance & Paiements sont inclus dans chaque abonnement — élèves, notes, reçus et encaissements dès le premier jour.',
                icon: Layers
              },
              {
                n: '02',
                title: 'Ajoutez à la carte',
                text: 'Activez de nouveaux modules en un clic quand votre centre évolue : étude surveillée, cantine, transport, cours particuliers…',
                icon: Plus
              },
              {
                n: '03',
                title: 'Pilotez votre académie',
                text: 'Tableaux de bord, statistiques de revenus et alertes — tout est automatisé. Vous vous concentrez sur vos élèves.',
                icon: Rocket
              }
            ].map((step, i) => (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                viewport={{ once: true, margin: '-60px' }}
                className="relative text-center"
              >
                <div className="relative inline-flex items-center justify-center mb-5">
                  <div className="absolute inset-0 rounded-2xl bg-teal-400/20 blur-xl" />
                  <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400/20 to-cyan-500/10 border border-teal-400/30 flex items-center justify-center">
                    <step.icon className="h-6 w-6 text-teal-300" />
                  </div>
                  <span className="absolute -top-2 -right-2 text-[10px] font-extrabold text-teal-300 bg-[#060a16] border border-teal-400/30 rounded-full px-1.5 py-0.5">
                    {step.n}
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BASE PLAN SECTION ─────────────────────────────────────── */}
      <section id="base" className="py-16 sm:py-24 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[300px] w-[700px] rounded-full bg-teal-500/10 blur-[130px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
              <Lock className="h-3.5 w-3.5" />
              Le plan de base
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Deux modules. Toujours inclus.
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Le socle de chaque abonnement — <span className="text-white font-bold">Scolaire &amp; Finance</span> pour 40 TND/mois.
              Vous ne pouvez pas les retirer, et vous n’aurez jamais besoin de le faire.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {BASE_MODULES.map((mod, i) => (
              <motion.div
                key={mod.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: i * 0.12 }}
                viewport={{ once: true, margin: '-60px' }}
                className="group relative rounded-3xl border border-teal-400/25 bg-gradient-to-b from-teal-400/[0.08] via-white/[0.03] to-transparent p-7 sm:p-8 overflow-hidden hover:border-teal-300/40 transition-colors duration-300"
              >
                <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl group-hover:bg-teal-400/20 transition-colors duration-500" />

                <div className="relative">
                  <div className="flex items-start justify-between mb-6">
                    <div className={`p-3.5 rounded-2xl ${MODULE_ACCENTS[mod.key]}`}>
                      <mod.icon className="h-7 w-7" />
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-400/15 border border-teal-400/25 text-[10px] font-extrabold text-teal-300 uppercase tracking-wider">
                      <Lock className="h-3 w-3" />
                      Inclus
                    </span>
                  </div>

                  <h3 className="text-2xl font-extrabold text-white mb-2">{mod.label}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed mb-6">{mod.description}</p>

                  <ul className="space-y-3 mb-7">
                    {(mod.key === 'scolaire'
                      ? [
                          'Fiches élèves complètes : parents, fratries, autorisations',
                          'Notes par trimestre — devoirs et synthèses',
                          'Moyennes automatiques et élèves à risque',
                          'Import intelligent de fiches scannées (IA)'
                        ]
                      : [
                          'Carnet de paiements par élève avec reçus',
                          'Répartition des revenus par service',
                          'Gestion des chèques et de leur encaissement',
                          'Dépenses et synthèses financières mensuelles'
                        ]
                    ).map(f => (
                      <li key={f} className="flex items-start gap-3 text-sm text-slate-300">
                        <span className="p-1 rounded-md bg-teal-400/15 text-teal-300 mt-0.5">
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="font-semibold">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* mini mock UI */}
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    {mod.key === 'scolaire' ? (
                      <div className="space-y-2">
                        <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">Bulletin · Trimestre 1</div>
                        {[
                          { s: 'Mathématiques', v: 15.25, w: '76%' },
                          { s: 'Français', v: 14.5, w: '72%' },
                          { s: 'Physique', v: 16.75, w: '84%' }
                        ].map(r => (
                          <div key={r.s} className="flex items-center gap-3">
                            <span className="text-[11px] font-bold text-slate-400 w-24 truncate">{r.s}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: r.w }}
                                viewport={{ once: true }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-400"
                              />
                            </div>
                            <span className="text-[11px] font-extrabold text-white w-10 text-right">{r.v.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Revenus · Janvier</span>
                          <span className="text-[10px] font-extrabold text-emerald-300">+12%</span>
                        </div>
                        {[
                          { s: 'Suivi scolaire', v: 1860 },
                          { s: 'Étude', v: 1240 },
                          { s: 'Cantine', v: 920 }
                        ].map(r => (
                          <div key={r.s} className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-400">{r.s}</span>
                            <span className="font-extrabold text-white">{r.v.toLocaleString('fr-TN')} TND</span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-slate-300">Total</span>
                          <span className="text-sm font-extrabold text-emerald-300">4 020 TND</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* base price banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-5 rounded-3xl border border-teal-400/25 bg-gradient-to-r from-teal-400/10 via-cyan-400/5 to-transparent px-7 py-6"
          >
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="p-3 rounded-2xl bg-teal-400/15">
                <ShieldCheck className="h-6 w-6 text-teal-300" />
              </div>
              <div>
                <div className="text-white font-extrabold text-lg">Le plan de base</div>
                <div className="text-slate-400 text-sm font-semibold">Scolaire &amp; Notes + Finance &amp; Paiements — élèves et utilisateurs illimités</div>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-right">
                <div className="text-3xl font-extrabold text-white">
                  {BASE_PRICE} <span className="text-sm font-bold text-slate-500">TND/mois</span>
                </div>
              </div>
              <button
                onClick={() => scrollToSection('contact')}
                className="group px-6 py-3.5 bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 font-extrabold text-sm rounded-2xl shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-400/40 hover:-translate-y-0.5 flex items-center gap-2 whitespace-nowrap"
              >
                Démarrer
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>

        </div>
      </section>

      {/* ─── ADD-ON MODULES (interactive) ──────────────────────────── */}
      <section id="modules" className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
              <Sparkles className="h-3.5 w-3.5" />
              Modules additionnels
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Étendez votre base, à la carte
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Touchez un module pour l’ajouter à votre sélection — le total se met à jour en direct.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ADDON_MODULES.map((mod, i) => {
              const selected = selectedModules.includes(mod.key);
              return (
                <motion.button
                  key={mod.key}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
                  viewport={{ once: true, margin: '-40px' }}
                  onClick={() => toggleModule(mod.key)}
                  className={`group relative text-left p-5 rounded-2xl border backdrop-blur transition-all duration-300 hover:-translate-y-1 ${
                    selected
                      ? 'border-teal-400/50 bg-teal-400/[0.08] shadow-[0_0_40px_-12px_rgba(45,212,191,0.5)]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]'
                  }`}
                >
                  {/* selected check */}
                  <AnimatePresence>
                    {selected && (
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="absolute top-3.5 right-3.5 p-1 rounded-full bg-teal-400 text-slate-950 shadow-lg shadow-teal-400/40"
                      >
                        <Check className="h-3 w-3" />
                      </motion.span>
                    )}
                  </AnimatePresence>

                  <div className={`inline-flex p-2.5 rounded-xl mb-4 ${MODULE_ACCENTS[mod.key]} group-hover:scale-110 transition-transform`}>
                    <mod.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-extrabold text-white mb-1.5">{mod.label}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">{mod.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-extrabold text-white">
                      {mod.price}<span className="text-[10px] font-bold text-slate-500 ml-1">TND/mois</span>
                    </span>
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full transition-colors ${
                      selected ? 'bg-teal-400/20 text-teal-300' : 'bg-white/5 text-slate-500 group-hover:text-slate-300'
                    }`}>
                      {selected ? 'Ajouté' : '+ Ajouter'}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>

        </div>
      </section>

      {/* ─── PRICING CONFIGURATOR ──────────────────────────────────── */}
      <section id="pricing" className="py-16 sm:py-24 relative">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[420px] w-[760px] rounded-full bg-teal-500/10 blur-[150px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
              <Zap className="h-3.5 w-3.5" />
              Calculateur d’abonnement
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Votre base, vos modules, votre prix
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
              La base est toujours incluse. Ajoutez ou retirez des modules — le prix s’adapte instantanément.
            </p>
          </div>

          {/* billing toggle */}
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

          <div className="grid lg:grid-cols-[1fr_370px] gap-6 items-start">

            {/* ── Left : base + addons ── */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur overflow-hidden">

              {/* base (locked) */}
              <div className="p-6 sm:p-7 border-b border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-teal-300" />
                    Votre base — toujours incluse
                  </h3>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-300 bg-teal-400/10 border border-teal-400/25 rounded-full px-2.5 py-1">
                    Non retirable
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {BASE_MODULES.map(mod => (
                    <div key={mod.key} className="flex items-center gap-3.5 p-4 rounded-2xl border border-teal-400/25 bg-teal-400/[0.07]">
                      <div className={`p-2.5 rounded-xl ${MODULE_ACCENTS[mod.key]}`}>
                        <mod.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-extrabold text-white truncate">{mod.label}</div>
                        <div className="text-[11px] font-semibold text-slate-500 truncate">{mod.description}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-base font-extrabold text-teal-300">{mod.price}</div>
                        <div className="text-[9px] font-bold text-slate-500">TND/mois</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* addons */}
              <div className="p-6 sm:p-7">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2 mb-4">
                  <Plus className="h-3.5 w-3.5 text-teal-300" />
                  Modules additionnels — ajoutez à volonté
                </h3>
                <div className="space-y-2.5">
                  {ADDON_MODULES.map(mod => {
                    const on = selectedModules.includes(mod.key);
                    return (
                      <button
                        key={mod.key}
                        onClick={() => toggleModule(mod.key)}
                        className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all duration-200 ${
                          on
                            ? 'border-teal-400/50 bg-teal-400/[0.08]'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className={`p-2 rounded-lg flex-shrink-0 ${MODULE_ACCENTS[mod.key]}`}>
                          <mod.icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-extrabold text-white truncate">{mod.label}</div>
                          <div className="text-[11px] font-semibold text-slate-500 truncate">{mod.description}</div>
                        </div>
                        <div className="text-right flex-shrink-0 mr-1">
                          <div className={`text-sm font-extrabold ${on ? 'text-teal-300' : 'text-white'}`}>+{mod.price}</div>
                          <div className="text-[9px] font-bold text-slate-500">TND/mois</div>
                        </div>
                        {/* switch */}
                        <span className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200 ${on ? 'bg-teal-400' : 'bg-white/15'}`}>
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${on ? 'left-[22px]' : 'left-0.5'}`} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Right : summary ── */}
            <div className="lg:sticky lg:top-24">
              <div className="rounded-3xl border border-teal-400/25 bg-gradient-to-b from-teal-400/[0.1] via-slate-950/80 to-slate-950/80 backdrop-blur overflow-hidden shadow-[0_0_70px_-18px_rgba(45,212,191,0.45)]">
                <div className="p-7">
                  <div className="text-xs font-extrabold text-slate-500 uppercase tracking-[0.15em] mb-5">Récapitulatif</div>

                  {/* base line */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-slate-300 flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-teal-300" />
                      Base (2 modules)
                    </span>
                    <span className="text-sm font-extrabold text-white">{BASE_PRICE} TND</span>
                  </div>

                  {/* addon lines */}
                  <AnimatePresence initial={false}>
                    {addonKeys.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-xs font-semibold text-slate-600 py-2 pl-6"
                      >
                        Aucun module additionnel — ajoutez-en à gauche pour composer votre offre.
                      </motion.div>
                    )}
                    {addonKeys.map(key => {
                      const mod = ALL_MODULES.find(m => m.key === key)!;
                      return (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <div className="flex items-center justify-between py-1.5">
                            <span className="text-sm font-bold text-slate-400 flex items-center gap-2 pl-6">
                              <mod.icon className="h-3.5 w-3.5 text-slate-500" />
                              {mod.label}
                            </span>
                            <span className="text-sm font-extrabold text-slate-300">+{mod.price} TND</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* total */}
                  <div className="mt-5 pt-5 border-t border-white/10">
                    <div className="flex items-end justify-between mb-1">
                      <span className="text-sm font-extrabold text-white">
                        {selectedModules.length} module{selectedModules.length > 1 ? 's' : ''}
                      </span>
                      <div className="flex items-end gap-1.5">
                        <span className="text-5xl font-extrabold text-white tracking-tight">
                          {billingCycle === 'monthly' ? monthlyPrice : annualMonthly.toFixed(0)}
                        </span>
                        <span className="text-xs font-bold text-slate-500 pb-1.5">TND/mois</span>
                      </div>
                    </div>
                    {billingCycle === 'annual' ? (
                      <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {annualTotal.toFixed(0)} TND/an · économie de {savings.toFixed(0)} TND
                      </div>
                    ) : (
                      <div className="text-xs font-bold text-slate-600">Sans engagement, résiliable à tout moment</div>
                    )}
                  </div>

                  <button
                    onClick={() => scrollToSection('contact')}
                    className="group w-full mt-6 py-4 bg-gradient-to-r from-teal-400 to-cyan-500 hover:from-teal-300 hover:to-cyan-400 text-slate-950 font-extrabold text-sm rounded-2xl shadow-xl shadow-teal-500/25 transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    Démarrer l’essai gratuit
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <p className="text-center text-[11px] font-semibold text-slate-600 mt-3">
                    Votre sélection sera transmise avec votre demande
                  </p>
                </div>

                <div className="grid grid-cols-3 border-t border-white/10 divide-x divide-white/10">
                  {[
                    { icon: Users, t: 'Élèves', s: 'Illimités' },
                    { icon: ShieldCheck, t: 'Comptes', s: 'Multiples' },
                    { icon: Star, t: 'Support', s: '7j/7' }
                  ].map(f => (
                    <div key={f.t} className="py-4 px-2 text-center">
                      <f.icon className="h-4 w-4 text-teal-300 mx-auto mb-1.5" />
                      <div className="text-[10px] font-bold text-slate-500">{f.t}</div>
                      <div className="text-[11px] font-extrabold text-white">{f.s}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ─── TESTIMONIALS ──────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
              <Star className="h-3.5 w-3.5" />
              Ils nous font confiance
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Des académies comme la vôtre
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <motion.figure
                key={t.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true, margin: '-60px' }}
                className="relative p-7 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur hover:border-white/20 transition-colors duration-300 flex flex-col"
              >
                <Quote className="h-6 w-6 text-teal-400/40 mb-4" />
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <blockquote className="text-sm text-slate-300 leading-relaxed flex-1">
                  « {t.quote} »
                </blockquote>
                <figcaption className="mt-6 pt-5 border-t border-white/10 flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${t.tint} flex items-center justify-center text-xs font-extrabold text-slate-950`}>
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-white">{t.name}</div>
                    <div className="text-[11px] font-semibold text-slate-500">{t.role}</div>
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────── */}
      <section id="faq" className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[1fr_1.4fr] gap-12">

          <div className="lg:sticky lg:top-28 self-start">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
              Questions fréquentes
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-5 leading-tight">
              Tout ce que vous devez savoir
            </h2>
            <p className="text-slate-400 leading-relaxed mb-8">
              Une question spécifique à votre académie ? Notre équipe répond en quelques minutes, 7 jours sur 7.
            </p>
            <button
              onClick={() => scrollToSection('contact')}
              className="px-6 py-3.5 bg-white/5 hover:bg-white/10 border border-white/15 text-white font-bold text-sm rounded-2xl transition-all hover:-translate-y-0.5 inline-flex items-center gap-2"
            >
              <Send className="h-4 w-4 text-teal-300" />
              Poser une question
            </button>
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

      {/* ─── CONTACT / TRIAL ───────────────────────────────────────── */}
      <section id="contact" className="py-16 sm:py-24 relative">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[400px] w-[820px] rounded-full bg-teal-500/10 blur-[150px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

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
              <p className="text-lg text-slate-400 mb-2 max-w-md mx-auto">
                Notre équipe vous contactera dans les 24h pour configurer votre essai gratuit.
              </p>
              <p className="text-sm font-bold text-teal-300 mb-8">
                Configuration transmise : Base + {addonKeys.length} module{addonKeys.length > 1 ? 's' : ''} additionnel{addonKeys.length > 1 ? 's' : ''} · {monthlyPrice} TND/mois
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-7 py-3 bg-white/10 text-white font-bold rounded-xl border border-white/15 hover:bg-white/15 transition"
              >
                Retour à l’accueil
              </button>
            </motion.div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 lg:gap-12 items-start">

              {/* ── Left : pitch + config récap ── */}
              <div className="lg:sticky lg:top-28">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 text-teal-300 text-xs font-extrabold uppercase tracking-[0.15em] mb-5">
                  Démarrez gratuitement
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-tight leading-tight">
                  Essai gratuit, 14 jours.
                  <br />Sans carte bancaire.
                </h2>
                <p className="text-slate-400 text-lg leading-relaxed mb-8">
                  Configuration gratuite par notre équipe. Vous ne payez que ce que vous activez,
                  à partir du plan de base <span className="text-white font-bold">Scolaire + Finance</span>.
                </p>

                {/* config summary — envoyée avec la demande */}
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-[0.15em]">Votre configuration</div>
                    <button
                      onClick={() => scrollToSection('pricing')}
                      className="text-[11px] font-extrabold text-teal-300 hover:text-teal-200 transition inline-flex items-center gap-1"
                    >
                      Modifier <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="space-y-2 mb-4">
                    {BASE_MODULES.map(mod => (
                      <div key={mod.key} className="flex items-center gap-2.5 rounded-xl bg-teal-400/[0.08] border border-teal-400/25 px-3.5 py-2.5">
                        <mod.icon className="h-4 w-4 text-teal-300" />
                        <span className="text-xs font-extrabold text-white flex-1">{mod.label}</span>
                        <Lock className="h-3 w-3 text-teal-400" />
                      </div>
                    ))}
                    <AnimatePresence initial={false}>
                      {addonKeys.map(key => {
                        const mod = ALL_MODULES.find(m => m.key === key)!;
                        return (
                          <motion.div
                            key={key}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-2.5 rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5"
                          >
                            <mod.icon className="h-4 w-4 text-slate-400" />
                            <span className="text-xs font-extrabold text-white flex-1">{mod.label}</span>
                            <span className="text-[10px] font-extrabold text-slate-500">+{mod.price}</span>
                            <button
                              onClick={() => toggleModule(key)}
                              className="p-0.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition"
                              title="Retirer ce module"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <span className="text-xs font-bold text-slate-500">
                      {selectedModules.length} modules au total
                    </span>
                    <span className="text-lg font-extrabold text-white">
                      {billingCycle === 'monthly' ? monthlyPrice : annualMonthly.toFixed(0)} TND/mois
                    </span>
                  </div>
                </div>

                <ul className="space-y-3.5">
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

              {/* ── Right : form ── */}
              <form onSubmit={handleFormSubmit} className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-7 sm:p-9 shadow-2xl shadow-black/40">

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
                      type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                      placeholder="Ahmed Ben Ali"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Nom de votre académie *</label>
                    <input
                      type="text" required value={academyName} onChange={e => setAcademyName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                      placeholder="Excellence Academy"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Email *</label>
                    <input
                      type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                      placeholder="contact@academy.tn"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Téléphone *</label>
                    <input
                      type="tel" required value={phone} onChange={e => setPhone(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                      placeholder="+216 XX XXX XXX"
                    />
                  </div>
                </div>

                <div className="mb-7">
                  <label className="block text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Message (optionnel)</label>
                  <textarea
                    rows={4} value={message} onChange={e => setMessage(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-600 font-semibold text-sm outline-none transition resize-none focus:border-teal-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-teal-400/10"
                    placeholder="Dites-nous en plus sur vos besoins…"
                  />
                </div>

                <button
                  type="submit" disabled={isSubmitting}
                  className="w-full py-4 bg-gradient-to-r from-teal-400 to-cyan-500 hover:from-teal-300 hover:to-cyan-400 text-slate-950 font-extrabold text-base rounded-2xl shadow-xl shadow-teal-500/25 transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Envoi en cours…' : (
                    <>
                      <Send className="h-5 w-5" />
                      Démarrer mon essai gratuit
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] font-semibold text-slate-600 mt-4 leading-relaxed">
                  Sera envoyé avec votre demande : <span className="text-slate-400">Base (Scolaire + Finance)</span>
                  {addonKeys.length > 0 && <> + <span className="text-teal-300">{addonKeys.length} module{addonKeys.length > 1 ? 's' : ''} additionnel{addonKeys.length > 1 ? 's' : ''}</span></>}
                  {' '}· {billingCycle === 'monthly' ? monthlyPrice : annualMonthly.toFixed(0)} TND/mois
                </p>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────────────────────────── */}
      <footer className="pt-16 pb-10 border-t border-white/5 bg-[#04070f]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">

            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 p-1.5 shadow-lg shadow-teal-500/20 flex items-center justify-center">
                  <img src={logo} alt={centerName} className="w-full h-full object-contain brightness-0 invert" />
                </div>
                <span className="text-base font-extrabold text-white">{centerName}</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed max-w-sm mb-6">
                La solution tunisienne de gestion académique modulaire. Chaque abonnement inclut la base
                Scolaire + Finance — puis évolue à votre rythme, module par module.
              </p>
              <button
                onClick={() => scrollToSection('contact')}
                className="px-5 py-3 bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 text-sm font-extrabold rounded-xl shadow-lg shadow-teal-500/20 transition hover:-translate-y-0.5"
              >
                Démarrer l’essai gratuit
              </button>
            </div>

            <div>
              <div className="text-xs font-extrabold text-slate-500 uppercase tracking-[0.15em] mb-4">Navigation</div>
              <div className="space-y-2.5">
                <button onClick={() => scrollToSection('base')} className="block text-sm font-bold text-slate-400 hover:text-teal-300 transition">Le plan de base</button>
                <button onClick={() => scrollToSection('modules')} className="block text-sm font-bold text-slate-400 hover:text-teal-300 transition">Modules additionnels</button>
                <button onClick={() => scrollToSection('pricing')} className="block text-sm font-bold text-slate-400 hover:text-teal-300 transition">Tarifs</button>
                <button onClick={() => scrollToSection('faq')} className="block text-sm font-bold text-slate-400 hover:text-teal-300 transition">FAQ</button>
                <button onClick={onOpenLogin} className="block text-sm font-bold text-slate-400 hover:text-teal-300 transition">Connexion</button>
              </div>
            </div>

            <div>
              <div className="text-xs font-extrabold text-slate-500 uppercase tracking-[0.15em] mb-4">La base incluse</div>
              <div className="rounded-2xl border border-teal-400/20 bg-teal-400/5 p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <GraduationCap className="h-4 w-4 text-teal-300" />
                  <span className="text-sm font-extrabold text-white">40 TND/mois</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Scolaire &amp; Notes + Finance &amp; Paiements. Élèves et utilisateurs illimités, support 7j/7.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-7 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-slate-600 text-xs font-semibold">
              © {new Date().getFullYear()} System Academy. Tous droits réservés.
            </p>
            <p className="text-slate-700 text-xs font-bold">Conçu en Tunisie 🇹🇳</p>
          </div>
        </div>
      </footer>

      {/* ─── STICKY SELECTION BAR ──────────────────────────────────── */}
      <AnimatePresence>
        {showBar && !formSubmitted && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed bottom-4 sm:bottom-6 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:ml-[-280px] sm:w-[560px] z-[60]"
          >
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-teal-400/25 bg-slate-950/90 backdrop-blur-xl px-5 py-3.5 shadow-2xl shadow-black/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-teal-400/15 flex-shrink-0">
                  <Layers className="h-4 w-4 text-teal-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-white truncate">
                    Base + {addonKeys.length} module{addonKeys.length > 1 ? 's' : ''} additionnel{addonKeys.length > 1 ? 's' : ''}
                  </div>
                  <div className="text-[11px] font-bold text-teal-300">
                    {billingCycle === 'monthly' ? monthlyPrice : annualMonthly.toFixed(0)} TND/mois
                    {billingCycle === 'annual' && <span className="text-slate-500"> · annuel</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={() => scrollToSection('contact')}
                className="group flex-shrink-0 px-5 py-2.5 bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 text-sm font-extrabold rounded-xl shadow-lg shadow-teal-500/25 transition hover:-translate-y-px flex items-center gap-1.5"
              >
                Continuer
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
