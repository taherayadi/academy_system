import React, { useState, useMemo, useEffect, useRef } from 'react';
import { submitDemoRequestApi } from '../api';
import { motion, AnimatePresence, useInView, useScroll, useSpring } from 'motion/react';
import {
  GraduationCap,
  Users,
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
  CreditCard,
  Clock
} from 'lucide-react';
import icon from '../assets/icon.png';

interface LandingPageProps {
  onOpenLogin: () => void;
  centerName?: string;
}

// ─── Module catalogue (landing only — bibliotheque & pointage élèves exclus) ──
const BASE_KEYS = ['scolaire', 'studentTimeSheets', 'finance'] as const;

const ALL_MODULES = [
  { key: 'scolaire', label: 'Scolaire & Notes', icon: GraduationCap, price: 20, description: 'Fiches élèves, notes, moyennes et bulletins par trimestre.' },
  { key: 'finance', label: 'Finance & Paiements', icon: DollarSign, price: 20, description: 'Reçus, encaissements, chèques et statistiques de revenus.' },
  { key: 'studentTimeSheets', label: 'Jd. Horaires', icon: Clock, price: 0, description: 'Pointage journalier des entrées/sorties des élèves — offert avec la base.', bundled: true },
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

const modulesPrice = (keys: readonly string[]) =>
  keys.reduce((sum, key) => sum + (ALL_MODULES.find(m => m.key === key)?.price || 0), 0);

// ─── Animated counter (stats band) ─────────────────────────────────
function Counter({ to, duration = 1500 }: { to: number; duration?: number }) {
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

  return <span ref={ref}>{val.toLocaleString('fr-TN')}</span>;
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
  const [centerType, setCenterType] = useState<'jardin' | 'formation' | ''>('');
  const [fullName, setFullName] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
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

  // ── Sticky bar : visible après le hero, cachée sur la section contact ──
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
    setFormError('');

    // Type d'établissement requis : jardin d'enfant ou centre de formation
    if (!centerType) {
      setFormError('Sélectionnez le type de votre établissement (jardin d’enfant ou centre de formation).');
      return;
    }

    // Téléphone tunisien : exactement 8 chiffres (le préfixe +216 est toléré)
    let phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.startsWith('216') && phoneDigits.length === 11) {
      phoneDigits = phoneDigits.slice(3);
    }
    if (phoneDigits.length !== 8) {
      setFormError('Le numéro de téléphone doit contenir exactement 8 chiffres (ex : 20 123 456).');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitDemoRequestApi({
        requestType,
        fullName,
        academyName,
        email,
        phone: phoneDigits,
        estimatedSize: `${selectedModules.length} modules`,
        requestedModules: selectedModules,
        centerType,
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
    { key: 'info', label: 'Plus d’infos' }
  ];

  const centerTypes: { key: 'jardin' | 'formation'; label: string; hint: string }[] = [
    { key: 'jardin', label: 'Jardin d’enfant', hint: 'Préscolaire · maternelle' },
    { key: 'formation', label: 'Centre de formation', hint: 'Soutien · cours · formations' }
  ];

  const testimonials = [
    {
      quote: 'J’ai démarré avec la base Scolaire + Finance. Trois mois plus tard, j’ai activé la cantine puis le transport — en un clic, sans rien réinstaller.',
      name: 'Rim Ben Salah',
      role: 'Directrice · Étoile Academy, Sfax',
      initials: 'RB'
    },
    {
      quote: 'Les reçus et le suivi des chèques nous ont fait gagner un temps fou. Fini les cahiers et les tableurs — tout est centralisé.',
      name: 'Karim Trabelsi',
      role: 'Gérant · Al Nour Center, Tunis',
      initials: 'KT'
    },
    {
      quote: 'Simple pour toute l’équipe, même les moins techniques. Et le support répond en minutes, pas en jours.',
      name: 'Salma Gharbi',
      role: 'Directrice pédagogique · Élite Studies, Sousse',
      initials: 'SG'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-800 font-sans antialiased overflow-x-clip" dir="ltr">

      {/* ─── SCROLL PROGRESS ───────────────────────────────────────── */}
      <motion.div
        style={{ scaleX: progress }}
        className="fixed top-0 left-0 right-0 h-[3px] z-[70] origin-left bg-gradient-to-r from-[#257C86] to-blue-500"
      />

      {/* ─── NAVIGATION ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-[#257C86]/25 flex items-center justify-center bg-gradient-to-br from-[#257C86] to-[#1e626b]">
              <img src={icon} alt={centerName} className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-base font-black tracking-tight text-slate-900">{centerName}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em]">Gestion Académique</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/70 px-2 py-1 shadow-sm">
            <button onClick={() => scrollToSection('base')} className="px-4 py-1.5 text-sm font-bold text-slate-600 hover:text-[#257C86] transition rounded-full hover:bg-[#257C86]/5">La base</button>
            <button onClick={() => scrollToSection('modules')} className="px-4 py-1.5 text-sm font-bold text-slate-600 hover:text-[#257C86] transition rounded-full hover:bg-[#257C86]/5">Modules</button>
            <button onClick={() => scrollToSection('pricing')} className="px-4 py-1.5 text-sm font-bold text-slate-600 hover:text-[#257C86] transition rounded-full hover:bg-[#257C86]/5">Tarifs</button>
            <button onClick={() => scrollToSection('faq')} className="px-4 py-1.5 text-sm font-bold text-slate-600 hover:text-[#257C86] transition rounded-full hover:bg-[#257C86]/5">FAQ</button>
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={onOpenLogin} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl transition shadow-sm">
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Connexion</span>
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-[#257C86] hover:bg-[#1e626b] text-white text-sm font-extrabold rounded-xl shadow-md shadow-[#257C86]/25 transition"
            >
              Essai gratuit
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── HERO ──────────────────────────────────────────────────── */}
      <section className="relative pt-14 sm:pt-20 pb-14 overflow-hidden">
        {/* soft light washes, same spirit as master */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#257C86]/[0.06] via-transparent to-blue-500/[0.05] pointer-events-none" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[380px] w-[720px] rounded-full bg-[#257C86]/[0.07] blur-[120px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">

            {/* ── Copy ── */}
            <div className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55 }}
                className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-gradient-to-r from-[#257C86]/10 to-blue-500/10 border border-[#257C86]/20 mb-7"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#257C86] opacity-50"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#257C86]"></span>
                </span>
                <span className="text-[13px] font-bold text-slate-700">Base Scolaire + Finance + Jd. Horaires offert — 40 TND/mois</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.08 }}
                className="text-[2.6rem] leading-[1.1] sm:text-6xl font-black text-slate-900 tracking-tight mb-6"
              >
                Votre académie,
                <br />
                <span className="bg-gradient-to-r from-[#257C86] to-blue-600 bg-clip-text text-transparent">
                  sous contrôle total.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.16 }}
                className="text-lg text-slate-600 max-w-xl mx-auto lg:mx-0 mb-9 leading-relaxed font-medium"
              >
                Chaque abonnement démarre avec la base{' '}
                <span className="text-slate-900 font-black">Scolaire &amp; Notes</span> +{' '}
                <span className="text-slate-900 font-black">Finance &amp; Paiements</span>,
                avec <span className="text-slate-900 font-black">Jd. Horaires</span> offert.
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
                  className="group w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:from-[#1e626b] hover:to-[#257C86] text-white font-black text-base rounded-2xl shadow-xl shadow-[#257C86]/25 transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  Démarrer gratuitement
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => scrollToSection('pricing')}
                  className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-50 text-slate-800 font-bold text-base rounded-2xl border-2 border-slate-200 transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  <Layers className="h-5 w-5 text-[#257C86]" />
                  Composer mon abonnement
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-sm"
              >
                {['Essai 14 jours', 'Sans carte bancaire', 'Sans engagement'].map(t => (
                  <div key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="font-bold text-slate-600">{t}</span>
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
              <div className="absolute -inset-6 bg-gradient-to-tr from-[#257C86]/15 via-blue-400/10 to-transparent blur-3xl rounded-[3rem] pointer-events-none" />

              <motion.div
                animate={{ y: [0, -7, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                className="relative rounded-2xl bg-white border border-slate-200/80 shadow-2xl shadow-slate-900/10 overflow-hidden"
              >
                {/* window chrome */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/80">
                  <span className="h-3 w-3 rounded-full bg-rose-400/80" />
                  <span className="h-3 w-3 rounded-full bg-amber-400/80" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                  <div className="ml-3 hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-bold">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#257C86]" />
                    app.system-academy.tn
                  </div>
                  <div className="ml-auto flex items-center gap-3.5 text-slate-400">
                    <Search className="h-4 w-4" />
                    <Bell className="h-4 w-4" />
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#257C86] to-blue-500" />
                  </div>
                </div>

                <div className="grid grid-cols-[52px_1fr] sm:grid-cols-[150px_1fr]">
                  {/* sidebar */}
                  <div className="border-r border-slate-100 bg-slate-50/50 py-3 px-2 sm:px-2.5 space-y-1">
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
                        className={`flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] sm:text-[11px] font-bold ${
                          item.active ? 'bg-[#257C86]/10 text-[#257C86]' : 'text-slate-400'
                        }`}
                      >
                        <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="hidden sm:inline">{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* main panel */}
                  <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-sm font-black text-slate-900">Tableau de bord</div>
                      <div className="text-[10px] font-bold text-slate-400 border border-slate-200 rounded-full px-3 py-1 bg-white">2025–2026</div>
                    </div>

                    {/* stat cards */}
                    <div className="grid grid-cols-3 gap-2.5 mb-4">
                      {[
                        { label: 'Élèves inscrits', value: '248', delta: '+12%', icon: Users, tone: 'text-[#257C86]' },
                        { label: 'Encaissé · mois', value: '4 320', unit: 'TND', delta: '+8%', icon: CreditCard, tone: 'text-emerald-600' },
                        { label: 'Chèques en attente', value: '3', delta: '2 cashés', icon: Receipt, tone: 'text-amber-600' }
                      ].map(s => (
                        <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <s.icon className={`h-3.5 w-3.5 ${s.tone}`} />
                            <span className="text-[9px] font-bold text-emerald-600">{s.delta}</span>
                          </div>
                          <div className="text-base sm:text-lg font-black text-slate-900 leading-none">
                            {s.value}<span className="text-[10px] text-slate-400 font-bold ml-1">{s.unit}</span>
                          </div>
                          <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-1">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* chart */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 mb-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[11px] font-black text-slate-700">Revenus par mois</div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-[#257C86]">
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
                                  ? 'bg-gradient-to-t from-[#257C86] to-[#3aa5b0] shadow-md shadow-[#257C86]/30'
                                  : 'bg-[#257C86]/15'
                              }`}
                            />
                            <span className="text-[9px] font-bold text-slate-400">{b.m}</span>
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
                        <div key={p.name} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-2.5">
                          <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-500">
                            {p.name.split(' ').map(w => w[0]).join('')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold text-slate-800 truncate">{p.name}</div>
                            <div className="text-[9px] font-semibold text-slate-400">{p.detail}</div>
                          </div>
                          <div className="text-[11px] font-black text-slate-900">{p.amount}</div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${p.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            {p.ok ? 'Payé' : 'En attente'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* floating card : base incluse */}
              <motion.div
                animate={{ y: [0, -9, 0] }}
                transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                className="absolute -top-6 -right-2 sm:-right-6 rounded-2xl bg-white border border-[#257C86]/25 shadow-xl shadow-slate-900/10 px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-3 w-3 text-[#257C86]" />
                  <span className="text-[10px] font-black text-[#257C86] uppercase tracking-wider">Base incluse</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {BASE_MODULES.map(m => (
                    <span key={m.key} className="flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 rounded-full px-2.5 py-1">
                      <m.icon className="h-3 w-3 text-[#257C86]" />
                      {m.label.split(' ')[0]}
                    </span>
                  ))}
                </div>
              </motion.div>

              {/* floating card : module ajouté */}
              <motion.div
                animate={{ y: [0, 9, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                className="absolute -bottom-6 -left-2 sm:-left-8 rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-900/10 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-50 border border-orange-100">
                    <Utensils className="h-4 w-4 text-orange-500" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      Cantine ajoutée
                      <span className="p-0.5 rounded-full bg-emerald-50 border border-emerald-100">
                        <Plus className="h-2.5 w-2.5 text-emerald-600" />
                      </span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">+18 TND/mois</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── MARQUEE ───────────────────────────────────────────────── */}
      <section className="relative border-y border-slate-200/70 bg-white py-5 overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-white to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-white to-transparent pointer-events-none" />
        <div className="flex w-max animate-marquee gap-3">
          {[...ALL_MODULES, ...ALL_MODULES].map((m, i) => (
            <div
              key={`${m.key}-${i}`}
              className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-slate-50/70 px-5 py-2.5 whitespace-nowrap"
            >
              <m.icon className="h-4 w-4 text-[#257C86]" />
              <span className="text-sm font-bold text-slate-700">{m.label}</span>
              <span className="text-xs font-black text-slate-400">{m.price === 0 ? 'Inclus' : `${m.price} TND`}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── STATS ─────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-10 text-center">
          {[
            { value: 10, label: 'Modules disponibles' },
            { value: 40, label: 'TND — le plan de base / mois' },
            { value: 14, label: 'Jours d’essai gratuit' },
            { value: 0, label: 'Limite d’élèves & d’utilisateurs' }
          ].map(s => (
            <div key={s.label}>
              <div className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-[#257C86] to-blue-600 bg-clip-text text-transparent mb-2 tracking-tight">
                <Counter to={s.value} />
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
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#257C86]/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-5">
              Simple par conception
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Opérationnel en trois étapes
            </h2>
          </div>

          <div className="relative grid md:grid-cols-3 gap-10 md:gap-6">
            {/* connector line */}
            <div className="hidden md:block absolute top-7 left-[16%] right-[16%] h-px bg-gradient-to-r from-[#257C86]/40 via-slate-200 to-[#257C86]/40" />

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
                  <div className="absolute inset-0 rounded-2xl bg-[#257C86]/15 blur-lg" />
                  <div className="relative w-14 h-14 rounded-2xl bg-white border border-[#257C86]/25 shadow-md shadow-[#257C86]/10 flex items-center justify-center">
                    <step.icon className="h-6 w-6 text-[#257C86]" />
                  </div>
                  <span className="absolute -top-2 -right-2 text-[10px] font-black text-white bg-[#257C86] border-2 border-white rounded-full px-1.5 py-0.5 shadow">
                    {step.n}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 mb-2">{step.title}</h3>
                <p className="text-sm text-slate-600 font-medium leading-relaxed max-w-xs mx-auto">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BASE PLAN SECTION ─────────────────────────────────────── */}
      <section id="base" className="py-16 sm:py-24 bg-white border-y border-slate-200/70 relative overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-[300px] w-[700px] rounded-full bg-[#257C86]/[0.06] blur-[110px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#257C86]/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-5">
              <Lock className="h-3.5 w-3.5" />
              Le plan de base
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Trois modules. Toujours inclus.
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto leading-relaxed font-medium">
              Le socle de chaque abonnement — <span className="text-slate-900 font-black">Scolaire &amp; Finance</span> pour 40 TND/mois,
              avec <span className="text-slate-900 font-black">Jd. Horaires</span> offert. Vous ne pouvez pas les retirer, et vous n’aurez jamais besoin de le faire.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {BASE_MODULES.filter(m => m.price > 0).map((mod, i) => (
              <motion.div
                key={mod.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: i * 0.12 }}
                viewport={{ once: true, margin: '-60px' }}
                className="group relative rounded-3xl border border-[#257C86]/25 bg-gradient-to-b from-[#257C86]/[0.05] to-white p-7 sm:p-8 overflow-hidden hover:border-[#257C86]/40 hover:shadow-xl hover:shadow-[#257C86]/10 transition-all duration-300"
              >
                <div className="relative">
                  <div className="flex items-start justify-between mb-6">
                    <div className="p-3.5 rounded-2xl bg-[#257C86]/10">
                      <mod.icon className="h-7 w-7 text-[#257C86]" />
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#257C86]/10 border border-[#257C86]/25 text-[10px] font-black text-[#257C86] uppercase tracking-wider">
                      <Lock className="h-3 w-3" />
                      Inclus
                    </span>
                  </div>

                  <h3 className="text-2xl font-black text-slate-900 mb-2">{mod.label}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed font-medium mb-6">{mod.description}</p>

                  <ul className="space-y-3 mb-7">
                    {(mod.key === 'scolaire'
                      ? [
                          'Fiches élèves complètes : parents, fratries, autorisations',
                          'Notes par trimestre — devoirs et synthèses',
                          'Moyennes automatiques et élèves à risque',
                          'Réinscriptions rapides depuis une année précédente'
                        ]
                      : [
                          'Carnet de paiements par élève avec reçus',
                          'Répartition des revenus par service',
                          'Gestion des chèques et de leur encaissement',
                          'Dépenses et synthèses financières mensuelles'
                        ]
                    ).map(f => (
                      <li key={f} className="flex items-start gap-3 text-sm text-slate-700">
                        <span className="p-1 rounded-md bg-[#257C86]/10 text-[#257C86] mt-0.5">
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="font-semibold">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* mini mock UI */}
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                    {mod.key === 'scolaire' ? (
                      <div className="space-y-2">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Bulletin · Trimestre 1</div>
                        {[
                          { s: 'Mathématiques', v: 15.25, w: '76%' },
                          { s: 'Français', v: 14.5, w: '72%' },
                          { s: 'Physique', v: 16.75, w: '84%' }
                        ].map(r => (
                          <div key={r.s} className="flex items-center gap-3">
                            <span className="text-[11px] font-bold text-slate-500 w-24 truncate">{r.s}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: r.w }}
                                viewport={{ once: true }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className="h-full rounded-full bg-gradient-to-r from-[#257C86] to-[#3aa5b0]"
                              />
                            </div>
                            <span className="text-[11px] font-black text-slate-900 w-10 text-right">{r.v.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Revenus · Janvier</span>
                          <span className="text-[10px] font-black text-emerald-600">+12%</span>
                        </div>
                        {[
                          { s: 'Suivi scolaire', v: 1860 },
                          { s: 'Étude', v: 1240 },
                          { s: 'Cantine', v: 920 }
                        ].map(r => (
                          <div key={r.s} className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-500">{r.s}</span>
                            <span className="font-black text-slate-900">{r.v.toLocaleString('fr-TN')} TND</span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                          <span className="text-[11px] font-black text-slate-700">Total</span>
                          <span className="text-sm font-black text-[#257C86]">4 020 TND</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Jd. Horaires — bundled with the base, no extra cost */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className="mt-6 rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-[#257C86]/[0.04] p-6 sm:p-7 flex flex-col sm:flex-row items-center gap-6 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-600/5 transition-all duration-300"
          >
            <div className="p-3.5 rounded-2xl bg-emerald-100 border border-emerald-200 flex-shrink-0">
              <Clock className="h-7 w-7 text-emerald-600" />
            </div>
            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 mb-1.5">
                <h3 className="text-lg font-black text-slate-900">Jd. Horaires — Pointage Élèves</h3>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                  <Check className="h-3 w-3" />
                  Offert avec la base
                </span>
              </div>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Pointage journalier des entrées et sorties de vos élèves. Pas de tarif dédié :
                ce module est <span className="font-black text-emerald-700">inclus gratuitement avec Scolaire</span>,
                pour chaque abonnement — dès le plan de base.
              </p>
            </div>
            <div className="text-center flex-shrink-0">
              <div className="text-2xl font-black text-emerald-600">Inclus</div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">0 TND supplémentaire</div>
            </div>
          </motion.div>

          {/* base price banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-5 rounded-3xl border border-[#257C86]/25 bg-gradient-to-r from-[#257C86]/10 via-[#257C86]/5 to-blue-50/50 px-7 py-6"
          >
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="p-3 rounded-2xl bg-white border border-[#257C86]/20 shadow-sm">
                <ShieldCheck className="h-6 w-6 text-[#257C86]" />
              </div>
              <div>
                <div className="text-slate-900 font-black text-lg">Le plan de base</div>
                <div className="text-slate-600 text-sm font-semibold">Scolaire &amp; Notes + Jd. Horaires + Finance &amp; Paiements — élèves et utilisateurs illimités</div>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-right">
                <div className="text-3xl font-black text-slate-900">
                  {BASE_PRICE} <span className="text-sm font-bold text-slate-500">TND/mois</span>
                </div>
              </div>
              <button
                onClick={() => scrollToSection('contact')}
                className="group px-6 py-3.5 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:from-[#1e626b] hover:to-[#257C86] text-white font-black text-sm rounded-2xl shadow-lg shadow-[#257C86]/25 transition-all hover:-translate-y-0.5 flex items-center gap-2 whitespace-nowrap"
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
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#257C86]/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-5">
              Modules additionnels
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Étendez votre base, à la carte
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto leading-relaxed font-medium">
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
                  className={`group relative text-left p-5 rounded-2xl border bg-gradient-to-br transition-all duration-300 hover:-translate-y-1 ${
                    selected
                      ? 'border-[#257C86] from-[#257C86]/[0.07] to-white shadow-lg shadow-[#257C86]/10'
                      : 'border-slate-200/70 from-white to-slate-50/50 hover:border-[#257C86]/30 hover:shadow-lg hover:shadow-slate-900/5'
                  }`}
                >
                  {/* selected check */}
                  <AnimatePresence>
                    {selected && (
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="absolute top-3.5 right-3.5 p-1 rounded-full bg-[#257C86] text-white shadow-md shadow-[#257C86]/30"
                      >
                        <Check className="h-3 w-3" />
                      </motion.span>
                    )}
                  </AnimatePresence>

                  <div className="inline-flex p-2.5 rounded-xl bg-[#257C86]/10 mb-4 group-hover:scale-110 transition-transform">
                    <mod.icon className="h-5 w-5 text-[#257C86]" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 mb-1.5">{mod.label}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium mb-4">{mod.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-slate-900">
                      {mod.price}<span className="text-[10px] font-bold text-slate-400 ml-1">TND/mois</span>
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full transition-colors ${
                      selected ? 'bg-[#257C86]/15 text-[#257C86]' : 'bg-slate-100 text-slate-400 group-hover:text-slate-600'
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
      <section id="pricing" className="py-16 sm:py-24 bg-white border-y border-slate-200/70 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[380px] w-[720px] rounded-full bg-[#257C86]/[0.06] blur-[130px] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#257C86]/10 to-blue-500/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-5">
              <Zap className="h-3.5 w-3.5" />
              Calculateur d’abonnement
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Votre base, vos modules, votre prix
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto leading-relaxed font-medium">
              La base est toujours incluse. Ajoutez ou retirez des modules — le prix s’adapte instantanément.
            </p>
          </div>

          {/* billing toggle */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex items-center p-1.5 bg-white border-2 border-slate-200 rounded-2xl shadow-lg">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${
                  billingCycle === 'monthly' ? 'bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mensuel
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${
                  billingCycle === 'annual' ? 'bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Annuel
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${billingCycle === 'annual' ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                  -20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_370px] gap-6 items-start">

            {/* ── Left : base + addons ── */}
            <div className="rounded-3xl bg-white border border-slate-200/70 shadow-xl shadow-slate-900/5 overflow-hidden">

              {/* base (locked) */}
              <div className="p-6 sm:p-7 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-[#257C86]" />
                    Votre base — toujours incluse
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#257C86] bg-[#257C86]/10 border border-[#257C86]/25 rounded-full px-2.5 py-1">
                    Non retirable
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {BASE_MODULES.filter(m => m.price > 0).map(mod => (
                    <div key={mod.key} className="flex items-center gap-3.5 p-4 rounded-2xl border border-[#257C86]/30 bg-white shadow-sm">
                      <div className="p-2.5 rounded-xl bg-[#257C86]/10">
                        <mod.icon className="h-5 w-5 text-[#257C86]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-900 truncate">{mod.label}</div>
                        <div className="text-[11px] font-semibold text-slate-500 truncate">{mod.description}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-base font-black text-[#257C86]">{mod.price}</div>
                        <div className="text-[9px] font-bold text-slate-400">TND/mois</div>
                      </div>
                    </div>
                  ))}
                  {/* Jd. Horaires — bundled, no tarif */}
                  <div className="sm:col-span-2 flex items-center gap-3.5 p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60">
                    <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-200">
                      <Clock className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-slate-900">Jd. Horaires — Pointage Élèves</div>
                      <div className="text-[11px] font-semibold text-slate-500">Entrées/sorties journalières — offert avec Scolaire</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-base font-black text-emerald-600">Inclus</div>
                      <div className="text-[9px] font-bold text-slate-400">0 TND</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* addons */}
              <div className="p-6 sm:p-7">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-4">
                  <Plus className="h-3.5 w-3.5 text-[#257C86]" />
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
                            ? 'border-[#257C86] bg-[#257C86]/[0.05]'
                            : 'border-slate-200 bg-white hover:border-[#257C86]/30 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="p-2 rounded-lg bg-[#257C86]/10 flex-shrink-0">
                          <mod.icon className="h-4 w-4 text-[#257C86]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-slate-900 truncate">{mod.label}</div>
                          <div className="text-[11px] font-semibold text-slate-500 truncate">{mod.description}</div>
                        </div>
                        <div className="text-right flex-shrink-0 mr-1">
                          <div className={`text-sm font-black ${on ? 'text-[#257C86]' : 'text-slate-900'}`}>+{mod.price}</div>
                          <div className="text-[9px] font-bold text-slate-400">TND/mois</div>
                        </div>
                        {/* switch */}
                        <span className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200 ${on ? 'bg-[#257C86]' : 'bg-slate-200'}`}>
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
              <div className="rounded-3xl bg-white border border-slate-200/70 shadow-xl shadow-slate-900/5 overflow-hidden">
                <div className="p-7 bg-gradient-to-b from-[#257C86]/[0.06] to-white">
                  <div className="text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-5">Récapitulatif</div>

                  {/* base line */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-slate-600 flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-[#257C86]" />
                      Base (3 modules)
                    </span>
                    <span className="text-sm font-black text-slate-900">{BASE_PRICE} TND</span>
                  </div>
                  <div className="flex items-center justify-between mb-3 pl-6">
                    <span className="text-xs font-bold text-slate-400 flex items-center gap-2">
                      <Clock className="h-3 w-3 text-emerald-500" />
                      dont Jd. Horaires
                    </span>
                    <span className="text-xs font-black text-emerald-600">Inclus — offert</span>
                  </div>

                  {/* addon lines */}
                  <AnimatePresence initial={false}>
                    {addonKeys.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-xs font-semibold text-slate-400 py-2 pl-6"
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
                            <span className="text-sm font-bold text-slate-500 flex items-center gap-2 pl-6">
                              <mod.icon className="h-3.5 w-3.5 text-slate-400" />
                              {mod.label}
                            </span>
                            <span className="text-sm font-black text-slate-700">+{mod.price} TND</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* total */}
                  <div className="mt-5 pt-5 border-t border-slate-200/70">
                    <div className="flex items-end justify-between mb-1">
                      <span className="text-sm font-black text-slate-900">
                        {selectedModules.length} module{selectedModules.length > 1 ? 's' : ''}
                      </span>
                      <div className="flex items-end gap-1.5">
                        <span className="text-5xl font-black text-slate-900 tracking-tight">
                          {billingCycle === 'monthly' ? monthlyPrice : annualMonthly.toFixed(0)}
                        </span>
                        <span className="text-xs font-bold text-slate-500 pb-1.5">TND/mois</span>
                      </div>
                    </div>
                    {billingCycle === 'annual' ? (
                      <div className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {annualTotal.toFixed(0)} TND/an · économie de {savings.toFixed(0)} TND
                      </div>
                    ) : (
                      <div className="text-xs font-bold text-slate-400">Sans engagement, résiliable à tout moment</div>
                    )}
                  </div>

                  <button
                    onClick={() => scrollToSection('contact')}
                    className="group w-full mt-6 py-4 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:from-[#1e626b] hover:to-[#257C86] text-white font-black text-sm rounded-2xl shadow-xl shadow-[#257C86]/25 transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    Démarrer l’essai gratuit
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <p className="text-center text-[11px] font-semibold text-slate-400 mt-3">
                    Votre sélection sera transmise avec votre demande
                  </p>
                </div>

                <div className="grid grid-cols-3 border-t border-slate-200/70 divide-x divide-slate-200/70 bg-slate-50/50">
                  {[
                    { icon: Users, t: 'Élèves', s: 'Illimités' },
                    { icon: ShieldCheck, t: 'Comptes', s: 'Multiples' },
                    { icon: Star, t: 'Support', s: '7j/7' }
                  ].map(f => (
                    <div key={f.t} className="py-4 px-2 text-center">
                      <f.icon className="h-4 w-4 text-[#257C86] mx-auto mb-1.5" />
                      <div className="text-[10px] font-bold text-slate-400">{f.t}</div>
                      <div className="text-[11px] font-black text-slate-900">{f.s}</div>
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
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#257C86]/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-5">
              Ils nous font confiance
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
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
                className="relative p-7 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/50 hover:border-[#257C86]/30 hover:shadow-xl hover:shadow-slate-900/5 transition-all duration-300 flex flex-col"
              >
                <Quote className="h-6 w-6 text-[#257C86]/30 mb-4" />
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <blockquote className="text-sm text-slate-700 leading-relaxed flex-1 font-medium">
                  « {t.quote} »
                </blockquote>
                <figcaption className="mt-6 pt-5 border-t border-slate-200/70 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#257C86] to-[#3aa5b0] flex items-center justify-center text-xs font-black text-white">
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900">{t.name}</div>
                    <div className="text-[11px] font-semibold text-slate-500">{t.role}</div>
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────── */}
      <section id="faq" className="py-16 sm:py-24 bg-white border-y border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[1fr_1.4fr] gap-12">

          <div className="lg:sticky lg:top-28 self-start">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#257C86]/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-5">
              Questions fréquentes
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight mb-5 leading-tight">
              Tout ce que vous devez savoir
            </h2>
            <p className="text-slate-600 leading-relaxed font-medium mb-8">
              Une question spécifique à votre académie ? Notre équipe répond en quelques minutes, 7 jours sur 7.
            </p>
            <button
              onClick={() => scrollToSection('contact')}
              className="px-6 py-3.5 bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-800 font-bold text-sm rounded-2xl transition-all hover:-translate-y-0.5 inline-flex items-center gap-2"
            >
              <Send className="h-4 w-4 text-[#257C86]" />
              Poser une question
            </button>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${
                    open ? 'border-[#257C86]/30 bg-gradient-to-br from-[#257C86]/[0.04] to-white' : 'border-slate-200/70 bg-gradient-to-br from-white to-slate-50/50 hover:border-slate-300'
                  }`}
                >
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full p-5 sm:p-6 flex items-center justify-between text-left gap-4"
                  >
                    <span className="text-sm sm:text-base font-black text-slate-900">{faq.q}</span>
                    <span className={`p-1.5 rounded-lg flex-shrink-0 transition-all duration-300 ${open ? 'bg-[#257C86]/10 text-[#257C86] rotate-180' : 'bg-slate-100 text-slate-400'}`}>
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
                        <div className="px-5 sm:px-6 pb-6 text-sm text-slate-600 leading-relaxed font-medium">
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
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

          {formSubmitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-20 rounded-3xl border border-[#257C86]/20 bg-white shadow-xl shadow-slate-900/5"
            >
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#257C86] to-[#1e626b] shadow-xl shadow-[#257C86]/30 mb-7">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-4">Demande envoyée avec succès !</h3>
              <p className="text-lg text-slate-600 mb-2 max-w-md mx-auto font-medium">
                Notre équipe vous contactera dans les 24h pour configurer votre essai gratuit.
              </p>
              <p className="text-sm font-black text-[#257C86] mb-8">
                Configuration transmise : Base + {addonKeys.length} module{addonKeys.length > 1 ? 's' : ''} additionnel{addonKeys.length > 1 ? 's' : ''} · {monthlyPrice} TND/mois
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-7 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-200 transition"
              >
                Retour à l’accueil
              </button>
            </motion.div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 lg:gap-12 items-start">

              {/* ── Left : pitch + config récap ── */}
              <div className="lg:sticky lg:top-28">
                <span className="inline-block px-4 py-1.5 rounded-full bg-[#257C86]/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-5">
                  Démarrez gratuitement
                </span>
                <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4 tracking-tight leading-tight">
                  Essai gratuit, 14 jours.
                  <br />Sans carte bancaire.
                </h2>
                <p className="text-slate-600 text-lg leading-relaxed font-medium mb-8">
                  Configuration gratuite par notre équipe. Vous ne payez que ce que vous activez,
                  à partir du plan de base <span className="text-slate-900 font-black">Scolaire + Finance</span>.
                </p>

                {/* config summary — envoyée avec la demande */}
                <div className="rounded-3xl bg-white border border-slate-200/70 shadow-lg shadow-slate-900/5 p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-xs font-black text-slate-400 uppercase tracking-[0.15em]">Votre configuration</div>
                    <button
                      onClick={() => scrollToSection('pricing')}
                      className="text-[11px] font-black text-[#257C86] hover:text-[#1e626b] transition inline-flex items-center gap-1"
                    >
                      Modifier <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="space-y-2 mb-4">
                    {BASE_MODULES.map(mod => (
                      <div key={mod.key} className="flex items-center gap-2.5 rounded-xl bg-[#257C86]/[0.06] border border-[#257C86]/25 px-3.5 py-2.5">
                        <mod.icon className="h-4 w-4 text-[#257C86]" />
                        <span className="text-xs font-black text-slate-800 flex-1">{mod.label}</span>
                        <Lock className="h-3 w-3 text-[#257C86]" />
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
                            className="flex items-center gap-2.5 rounded-xl bg-white border border-slate-200 px-3.5 py-2.5"
                          >
                            <mod.icon className="h-4 w-4 text-slate-400" />
                            <span className="text-xs font-black text-slate-800 flex-1">{mod.label}</span>
                            <span className="text-[10px] font-black text-slate-400">+{mod.price}</span>
                            <button
                              onClick={() => toggleModule(key)}
                              className="p-0.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
                              title="Retirer ce module"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-200/70">
                    <span className="text-xs font-bold text-slate-500">
                      {selectedModules.length} modules au total
                    </span>
                    <span className="text-lg font-black text-slate-900">
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
                    <li key={t} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                      <span className="p-1.5 rounded-lg bg-[#257C86]/10 text-[#257C86]">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* ── Right : form ── */}
              <form onSubmit={handleFormSubmit} className="rounded-3xl bg-white border border-slate-200/70 shadow-2xl shadow-slate-900/10 p-7 sm:p-9">

                <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100 border border-slate-200 mb-7">
                  {requestTypes.map(rt => (
                    <button
                      key={rt.key}
                      type="button"
                      onClick={() => setRequestType(rt.key)}
                      className={`py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
                        requestType === rt.key
                          ? 'bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white shadow-md'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {rt.label}
                    </button>
                  ))}
                </div>

                {/* Type d'établissement */}
                <div className="mb-5">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Type d’établissement *</label>
                  <div className="grid grid-cols-2 gap-3">
                    {centerTypes.map(ct => {
                      const active = centerType === ct.key;
                      return (
                        <button
                          key={ct.key}
                          type="button"
                          onClick={() => { setCenterType(ct.key); setFormError(''); }}
                          className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                            active
                              ? 'border-[#257C86] bg-[#257C86]/[0.06] shadow-md shadow-[#257C86]/10'
                              : 'border-slate-200 bg-white hover:border-[#257C86]/40 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 mb-1">
                            <span className={`h-2.5 w-2.5 rounded-full border-2 transition-colors ${active ? 'border-[#257C86] bg-[#257C86]' : 'border-slate-300'}`} />
                            <span className={`text-sm font-black ${active ? 'text-[#257C86]' : 'text-slate-800'}`}>{ct.label}</span>
                          </div>
                          <span className="block text-[11px] font-semibold text-slate-400 pr-5">{ct.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {formError && (
                  <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center">
                    ⚠️ {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Votre nom complet *</label>
                    <input
                      type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 font-semibold text-sm outline-none transition focus:border-[#257C86] focus:ring-0"
                      placeholder="Ahmed Ben Ali"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Nom de votre académie *</label>
                    <input
                      type="text" required value={academyName} onChange={e => setAcademyName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 font-semibold text-sm outline-none transition focus:border-[#257C86] focus:ring-0"
                      placeholder="Excellence Academy"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Email *</label>
                    <input
                      type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 font-semibold text-sm outline-none transition focus:border-[#257C86] focus:ring-0"
                      placeholder="contact@academy.tn"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Téléphone * <span className="text-slate-400 font-bold normal-case tracking-normal">(8 chiffres)</span></label>
                    <input
                      type="tel" required inputMode="numeric" maxLength={8} autoComplete="tel"
                      value={phone}
                      onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 8)); setFormError(''); }}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 font-semibold text-sm outline-none transition focus:border-[#257C86] focus:ring-0"
                      placeholder="20 123 456"
                    />
                  </div>
                </div>

                <div className="mb-7">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Message (optionnel)</label>
                  <textarea
                    rows={4} value={message} onChange={e => setMessage(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 font-semibold text-sm outline-none transition resize-none focus:border-[#257C86] focus:ring-0"
                    placeholder="Dites-nous en plus sur vos besoins…"
                  />
                </div>

                <button
                  type="submit" disabled={isSubmitting}
                  className="w-full py-4 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:from-[#1e626b] hover:to-[#257C86] text-white font-black text-base rounded-2xl shadow-xl shadow-[#257C86]/25 transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Envoi en cours…' : (
                    <>
                      <Send className="h-5 w-5" />
                      Démarrer mon essai gratuit
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] font-semibold text-slate-400 mt-4 leading-relaxed">
                  Sera envoyé avec votre demande : <span className="text-slate-600">Base (Scolaire + Finance)</span>
                  {addonKeys.length > 0 && <> + <span className="text-[#257C86] font-bold">{addonKeys.length} module{addonKeys.length > 1 ? 's' : ''} additionnel{addonKeys.length > 1 ? 's' : ''}</span></>}
                  {' '}· {billingCycle === 'monthly' ? monthlyPrice : annualMonthly.toFixed(0)} TND/mois
                </p>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────────────────────────── */}
      <footer className="pt-16 pb-10 border-t border-slate-200/70 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">

            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl overflow-hidden shadow-md shadow-[#257C86]/20 flex items-center justify-center bg-gradient-to-br from-[#257C86] to-[#1e626b]">
                  <img src={icon} alt={centerName} className="w-full h-full object-cover" />
                </div>
                <span className="text-base font-black text-slate-900">{centerName}</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed max-w-sm font-medium mb-6">
                La solution tunisienne de gestion académique modulaire. Chaque abonnement inclut la base
                Scolaire + Finance, avec Jd. Horaires offert — puis évolue à votre rythme, module par module.
              </p>
              <button
                onClick={() => scrollToSection('contact')}
                className="px-5 py-3 bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white text-sm font-black rounded-xl shadow-lg shadow-[#257C86]/25 transition hover:-translate-y-0.5"
              >
                Démarrer l’essai gratuit
              </button>
            </div>

            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-4">Navigation</div>
              <div className="space-y-2.5">
                <button onClick={() => scrollToSection('base')} className="block text-sm font-bold text-slate-600 hover:text-[#257C86] transition">Le plan de base</button>
                <button onClick={() => scrollToSection('modules')} className="block text-sm font-bold text-slate-600 hover:text-[#257C86] transition">Modules additionnels</button>
                <button onClick={() => scrollToSection('pricing')} className="block text-sm font-bold text-slate-600 hover:text-[#257C86] transition">Tarifs</button>
                <button onClick={() => scrollToSection('faq')} className="block text-sm font-bold text-slate-600 hover:text-[#257C86] transition">FAQ</button>
                <button onClick={onOpenLogin} className="block text-sm font-bold text-slate-600 hover:text-[#257C86] transition">Connexion</button>
              </div>
            </div>

            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-[0.15em] mb-4">La base incluse</div>
              <div className="rounded-2xl border border-[#257C86]/25 bg-[#257C86]/[0.05] p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <GraduationCap className="h-4 w-4 text-[#257C86]" />
                  <span className="text-sm font-black text-slate-900">40 TND/mois</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Scolaire &amp; Notes + Finance &amp; Paiements. Élèves et utilisateurs illimités, support 7j/7.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-7 border-t border-slate-200/70 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-slate-400 text-xs font-bold">
              © {new Date().getFullYear()} System Academy. Tous droits réservés.
            </p>
            <p className="text-slate-400 text-xs font-bold">Conçu en Tunisie 🇹🇳</p>
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
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl shadow-slate-900/15 px-5 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-[#257C86]/10 flex-shrink-0">
                  <Layers className="h-4 w-4 text-[#257C86]" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-slate-900 truncate">
                    Base + {addonKeys.length} module{addonKeys.length > 1 ? 's' : ''} additionnel{addonKeys.length > 1 ? 's' : ''}
                  </div>
                  <div className="text-[11px] font-bold text-[#257C86]">
                    {billingCycle === 'monthly' ? monthlyPrice : annualMonthly.toFixed(0)} TND/mois
                    {billingCycle === 'annual' && <span className="text-slate-400"> · annuel</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={() => scrollToSection('contact')}
                className="group flex-shrink-0 px-5 py-2.5 bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white text-sm font-black rounded-xl shadow-lg shadow-[#257C86]/25 transition hover:-translate-y-px flex items-center gap-1.5"
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
