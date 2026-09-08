import React, { useState, useMemo } from 'react';
import { submitDemoRequestApi } from '../api';
import { motion } from 'motion/react';
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
  Mail,
  MapPin,
  ChevronDown,
  ChevronUp,
  LogIn,
  Send,
  Building2,
  Calendar,
  DollarSign,
  TrendingUp,
  Zap,
  Star
} from 'lucide-react';
import logo from '../assets/logo.png';

interface LandingPageProps {
  onOpenLogin: () => void;
  centerName?: string;
}

// Module definitions with pricing
const ALL_MODULES = [
  { key: 'scolaire', label: 'Scolaire & Notes', icon: GraduationCap, price: 20, description: 'Fiches élèves, notes, bulletins' },
  { key: 'finance', label: 'Finance & Paiements', icon: DollarSign, price: 20, description: 'Reçus, encaissements, statistiques' },
  { key: 'etude', label: 'Étude Surveillée', icon: BookOpen, price: 15, description: 'Planning, présences, horaires' },
  { key: 'coursParticuliers', label: 'Cours Particuliers', icon: Users, price: 15, description: 'Cours 1-à-1, tarification' },
  { key: 'revision', label: 'Révision Examens', icon: Award, price: 15, description: 'Séances révision, groupes' },
  { key: 'formations', label: 'Formations', icon: Sparkles, price: 15, description: 'Ateliers, stages vacances' },
  { key: 'cantine', label: 'Cantine & Repas', icon: Utensils, price: 18, description: 'Abonnements, pointage repas' },
  { key: 'transport', label: 'Transport Scolaire', icon: Bus, price: 15, description: 'Feuilles route, circuits' },
  { key: 'events', label: 'Événements & Sorties', icon: Calendar, price: 15, description: 'Inscriptions, sorties scolaires' },
  { key: 'bibliotheque', label: 'Bibliothèque', icon: BookOpen, price: 12, description: 'Prêts livres, inventaire' },
  { key: 'studentTimeSheets', label: 'Pointage Élèves', icon: Clock, price: 12, description: 'Entrées/sorties journalières' },
  { key: 'staff', label: 'Personnel & Salaires', icon: ShieldCheck, price: 12, description: 'Équipe, paie, pointages' }
];

export default function LandingPage({ onOpenLogin, centerName = 'System Academy' }: LandingPageProps) {
  // Module pricing state
  const [selectedModules, setSelectedModules] = useState<string[]>(['scolaire', 'finance']);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Contact / Demo Form state
  const [requestType, setRequestType] = useState<'trial' | 'demo' | 'info'>('trial');
  const [fullName, setFullName] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // FAQ Accordion
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Calculate pricing
  const { monthlyPrice, annualPrice, savings } = useMemo(() => {
    const monthly = selectedModules.reduce((sum, key) => {
      const mod = ALL_MODULES.find(m => m.key === key);
      return sum + (mod?.price || 0);
    }, 0);
    const annual = monthly * 12 * 0.8; // 20% discount
    const save = monthly * 12 - annual;
    return { monthlyPrice: monthly, annualPrice: annual, savings: save };
  }, [selectedModules]);

  const toggleModule = (key: string) => {
    setSelectedModules(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
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
        requestedModules: selectedModules.join(','),
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
      q: "Comment fonctionne la tarification par module ?",
      a: "Vous choisissez uniquement les modules dont vous avez besoin. Chaque module a un prix mensuel fixe (12-20 TND/mois). Vous pouvez ajouter ou retirer des modules à tout moment selon l'évolution de votre centre."
    },
    {
      q: "Puis-je commencer avec quelques modules et en ajouter plus tard ?",
      a: "Absolument ! Vous pouvez démarrer avec les modules essentiels (Scolaire + Finance par exemple) et activer de nouveaux modules quand vous en avez besoin. Pas de frais d'activation supplémentaires."
    },
    {
      q: "Y a-t-il une limite au nombre d'élèves ou d'utilisateurs ?",
      a: "Non, aucune limite ! Le prix dépend uniquement des modules activés, pas du nombre d'élèves, de parents ou d'utilisateurs. Vous pouvez gérer 10 ou 500 élèves au même tarif."
    },
    {
      q: "Comment fonctionne l'essai gratuit de 14 jours ?",
      a: "Essai gratuit total sans carte bancaire. Tous les modules sont accessibles pendant 14 jours. Vos données restent même après l'essai si vous souscrivez."
    },
    {
      q: "Puis-je annuler ou changer mes modules à tout moment ?",
      a: "Oui, sans engagement de durée. Modifiez vos modules depuis votre tableau de bord ou contactez-nous. Les changements prennent effet au cycle suivant."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-800 font-sans" dir="ltr">

      {/* ─── NAVIGATION ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#257C86] to-[#1e626b] p-1.5 shadow-lg shadow-[#257C86]/20 flex items-center justify-center">
              <img src={logo} alt={centerName} className="w-full h-full object-contain brightness-0 invert" />
            </div>
            <div>
              <div className="text-base font-black tracking-tight text-slate-900">{centerName}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Gestion Académique</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <button onClick={() => scrollToSection('features')} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-[#257C86] transition rounded-lg hover:bg-slate-50">Modules</button>
            <button onClick={() => scrollToSection('pricing')} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-[#257C86] transition rounded-lg hover:bg-slate-50">Tarifs</button>
            <button onClick={() => scrollToSection('faq')} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-[#257C86] transition rounded-lg hover:bg-slate-50">FAQ</button>
            <button onClick={() => scrollToSection('contact')} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-[#257C86] transition rounded-lg hover:bg-slate-50">Contact</button>
          </nav>

          <button onClick={onOpenLogin} className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition shadow-lg shadow-slate-900/10">
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Connexion</span>
          </button>
        </div>
      </header>

      {/* ─── HERO SECTION ───────────────────────────────────────────── */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#257C86]/5 via-transparent to-blue-500/5"></div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#257C86]/10 to-blue-500/10 border border-[#257C86]/20 mb-6"
          >
            <Zap className="h-4 w-4 text-[#257C86]" />
            <span className="text-sm font-bold text-slate-700">Tarification modulaire • Payez uniquement ce que vous utilisez</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight mb-6 leading-tight"
          >
            Gérez votre académie
            <br />
            <span className="bg-gradient-to-r from-[#257C86] to-blue-600 bg-clip-text text-transparent">
              avec les modules dont vous avez besoin
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg text-slate-600 max-w-2xl mx-auto mb-10 font-medium leading-relaxed"
          >
            Choisissez vos modules, activez-les en un clic. De 12 à 20 TND par module.
            <br />Aucune limite d'élèves. Aucun engagement.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
          >
            <button
              onClick={() => scrollToSection('contact')}
              className="group px-8 py-4 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:from-[#1e626b] hover:to-[#257C86] text-white font-black text-base rounded-2xl shadow-xl shadow-[#257C86]/25 transition-all duration-300 flex items-center gap-2"
            >
              Essai gratuit 14 jours
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="px-8 py-4 bg-white hover:bg-slate-50 text-slate-800 font-bold text-base rounded-2xl border-2 border-slate-200 transition-all duration-300"
            >
              Calculer mon tarif
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex items-center justify-center gap-6 text-sm"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="font-bold text-slate-600">Sans carte bancaire</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="font-bold text-slate-600">Sans engagement</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="font-bold text-slate-600">Support inclus</span>
            </div>
          </motion.div>

        </div>
      </section>

      {/* ─── FEATURES GRID ──────────────────────────────────────────── */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#257C86]/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-4">
              12 Modules Disponibles
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              Activez uniquement ce dont vous avez besoin
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto font-medium">
              Chaque module est autonome et prêt à l'emploi. Activez-les en un clic depuis votre tableau de bord.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {ALL_MODULES.map((mod, i) => (
              <motion.div
                key={mod.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                viewport={{ once: true }}
                className="group p-6 bg-gradient-to-br from-white to-slate-50/50 rounded-2xl border border-slate-200/60 hover:border-[#257C86]/30 hover:shadow-xl hover:shadow-[#257C86]/5 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-gradient-to-br from-[#257C86]/10 to-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                    <mod.icon className="h-6 w-6 text-[#257C86]" />
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-[#257C86]">{mod.price}</div>
                    <div className="text-xs font-bold text-slate-400">TND/mois</div>
                  </div>
                </div>
                <h3 className="text-base font-black text-slate-900 mb-2">{mod.label}</h3>
                <p className="text-sm text-slate-600 font-medium">{mod.description}</p>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* ─── INTERACTIVE PRICING CALCULATOR ────────────────────────── */}
      <section id="pricing" className="py-20 bg-gradient-to-br from-slate-50 to-blue-50/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 rounded-full bg-gradient-to-r from-[#257C86]/10 to-blue-500/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-4">
              Calculateur de Tarif
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              Composez votre abonnement sur mesure
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto font-medium">
              Sélectionnez les modules dont votre académie a besoin. Le prix s'adapte automatiquement.
            </p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex items-center p-1.5 bg-white border-2 border-slate-200 rounded-2xl shadow-lg">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-3 rounded-xl text-sm font-black transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mensuel
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-6 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${
                  billingCycle === 'annual'
                    ? 'bg-gradient-to-r from-[#257C86] to-[#1e626b] text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Annuel
                <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-xs font-black">
                  -20%
                </span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl shadow-slate-900/10 border border-slate-200/50 overflow-hidden">

            {/* Module Selection Grid */}
            <div className="p-8 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#257C86]" />
                Sélectionnez vos modules
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ALL_MODULES.map(mod => {
                  const isSelected = selectedModules.includes(mod.key);
                  return (
                    <button
                      key={mod.key}
                      onClick={() => toggleModule(mod.key)}
                      className={`group p-4 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-[#257C86] bg-gradient-to-br from-[#257C86]/5 to-blue-500/5 shadow-md'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg transition-colors ${
                            isSelected ? 'bg-[#257C86] text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                          }`}>
                            <mod.icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-black text-slate-900">{mod.label}</div>
                            <div className="text-xs text-slate-500 font-medium">{mod.description}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-black ${isSelected ? 'text-[#257C86]' : 'text-slate-900'}`}>
                            {mod.price}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">TND/mois</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price Summary */}
            <div className="p-8 bg-gradient-to-br from-slate-50 to-blue-50/30">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-sm font-bold text-slate-500 mb-1">
                    {selectedModules.length} module{selectedModules.length > 1 ? 's' : ''} sélectionné{selectedModules.length > 1 ? 's' : ''}
                  </div>
                  <div className="text-4xl font-black text-slate-900">
                    {billingCycle === 'monthly' ? monthlyPrice : annualPrice.toFixed(2)}
                    <span className="text-lg font-bold text-slate-500 ml-2">
                      TND {billingCycle === 'monthly' ? '/ mois' : '/ an'}
                    </span>
                  </div>
                  {billingCycle === 'annual' && (
                    <div className="mt-2 text-sm font-bold text-emerald-600 flex items-center gap-1">
                      <TrendingUp className="h-4 w-4" />
                      Économie de {savings.toFixed(2)} TND par an
                    </div>
                  )}
                </div>
                <button
                  onClick={() => scrollToSection('contact')}
                  className="px-8 py-4 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:from-[#1e626b] hover:to-[#257C86] text-white font-black rounded-2xl shadow-xl shadow-[#257C86]/25 transition-all flex items-center gap-2"
                >
                  Commencer l'essai
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-200/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg">
                    <Users className="h-5 w-5 text-[#257C86]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500">Élèves illimités</div>
                    <div className="text-sm font-black text-slate-900">Aucune limite</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg">
                    <ShieldCheck className="h-5 w-5 text-[#257C86]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500">Utilisateurs</div>
                    <div className="text-sm font-black text-slate-900">Multi-comptes inclus</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg">
                    <Star className="h-5 w-5 text-[#257C86]" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500">Support</div>
                    <div className="text-sm font-black text-slate-900">7j/7 inclus</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ─── FAQ SECTION ────────────────────────────────────────────── */}
      <section id="faq" className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 rounded-full bg-[#257C86]/10 text-[#257C86] text-xs font-black uppercase tracking-wider mb-4">
              Questions Fréquentes
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900">
              Tout ce que vous devez savoir
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-gradient-to-br from-white to-slate-50/50 rounded-2xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50/50 transition"
                >
                  <span className="text-base font-black text-slate-900 pr-4">{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="h-5 w-5 text-[#257C86] flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6 text-sm text-slate-600 leading-relaxed font-medium border-t border-slate-100 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ─── CONTACT FORM ───────────────────────────────────────────── */}
      <section id="contact" className="py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">

          {formSubmitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
            >
              <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500 rounded-full mb-6">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-3xl font-black mb-4">Demande envoyée avec succès !</h3>
              <p className="text-lg text-slate-300 mb-8">
                Notre équipe vous contactera dans les 24h pour configurer votre essai gratuit.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition"
              >
                Retour à l'accueil
              </button>
            </motion.div>
          ) : (
            <>
              <div className="text-center mb-12">
                <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 text-white text-xs font-black uppercase tracking-wider mb-4">
                  Démarrez Gratuitement
                </span>
                <h2 className="text-3xl sm:text-4xl font-black mb-4">
                  Essai gratuit 14 jours
                </h2>
                <p className="text-lg text-slate-300 max-w-2xl mx-auto">
                  Sans carte bancaire. Accès complet à tous les modules. Configuration gratuite par notre équipe.
                </p>
              </div>

              <form onSubmit={handleFormSubmit} className="bg-white rounded-3xl shadow-2xl p-8 text-slate-900">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Votre nom complet *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#257C86] focus:ring-0 outline-none transition"
                      placeholder="Ahmed Ben Ali"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Nom de votre académie *</label>
                    <input
                      type="text"
                      required
                      value={academyName}
                      onChange={e => setAcademyName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#257C86] focus:ring-0 outline-none transition"
                      placeholder="Excellence Academy"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#257C86] focus:ring-0 outline-none transition"
                      placeholder="contact@academy.tn"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Téléphone *</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#257C86] focus:ring-0 outline-none transition"
                      placeholder="+216 XX XXX XXX"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Message (optionnel)</label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#257C86] focus:ring-0 outline-none transition resize-none"
                    placeholder="Dites-nous en plus sur vos besoins..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-gradient-to-r from-[#257C86] to-[#1e626b] hover:from-[#1e626b] hover:to-[#257C86] text-white font-black text-lg rounded-2xl shadow-xl shadow-[#257C86]/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    'Envoi en cours...'
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Démarrer mon essai gratuit
                    </>
                  )}
                </button>

              </form>
            </>
          )}

        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="py-12 bg-slate-900 text-slate-400 text-sm border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#257C86] to-[#1e626b] p-1.5">
              <img src={logo} alt={centerName} className="w-full h-full object-contain brightness-0 invert" />
            </div>
            <span className="text-base font-black text-white">{centerName}</span>
          </div>
          <p className="text-slate-500 mb-2">La solution de gestion académique modulaire pour la Tunisie</p>
          <p className="text-slate-600 text-xs">© {new Date().getFullYear()} System Academy. Tous droits réservés.</p>
        </div>
      </footer>

    </div>
  );
}
