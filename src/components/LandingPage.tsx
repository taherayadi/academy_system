import React, { useState, useMemo } from 'react';
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
  FileText, 
  ChevronDown, 
  ChevronUp, 
  LogIn, 
  Send, 
  Building2, 
  Lock,
  Printer
} from 'lucide-react';
import logo from '../assets/logo.png';

interface LandingPageProps {
  onOpenLogin: () => void;
  centerName?: string;
}

export default function LandingPage({ onOpenLogin, centerName = 'Small Genious' }: LandingPageProps) {
  // Pricing simulator state
  const [studentCount, setStudentCount] = useState<number>(45);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Contact / Demo Form state
  const [requestType, setRequestType] = useState<'trial' | 'demo' | 'info'>('trial');
  const [fullName, setFullName] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [estimatedSize, setEstimatedSize] = useState('1 à 40 élèves');
  const [message, setMessage] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // FAQ Accordion open state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Calculate recommended plan based on slider
  const recommendedTier = useMemo(() => {
    if (studentCount <= 40) return 'starter';
    if (studentCount <= 100) return 'growth';
    if (studentCount <= 250) return 'pro';
    return 'custom';
  }, [studentCount]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const newRequest = {
      id: `REQ-${Date.now()}`,
      requestType,
      fullName,
      academyName,
      email,
      phone,
      estimatedSize,
      message,
      submittedAt: new Date().toISOString()
    };

    try {
      const existing = JSON.parse(localStorage.getItem('academy_demo_requests') || '[]');
      existing.unshift(newRequest);
      localStorage.setItem('academy_demo_requests', JSON.stringify(existing));
    } catch {}

    setTimeout(() => {
      setIsSubmitting(false);
      setFormSubmitted(true);
    }, 600);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const faqs = [
    {
      q: "Faut-il installer un logiciel ou acheter un serveur ?",
      a: "Absolument aucun matériel spécialisé n'est requis. Notre solution est 100% hébergée sur le cloud, accessible en temps réel depuis n'importe quel ordinateur (Windows, Mac), tablette ou smartphone via un simple navigateur web sécurisé."
    },
    {
      q: "Peut-on transférer notre fichier d'élèves existant depuis Excel ?",
      a: "Oui ! Notre équipe technique en Tunisie vous assiste gratuitement pour importer l'intégralité de vos listes d'élèves, coordonnées de parents et historiques sans aucune interruption de votre activité."
    },
    {
      q: "Comment fonctionne l'essai gratuit de 14 jours ?",
      a: "L'essai gratuit vous donne un accès total et immédiat à tous les modules sans carte bancaire ni engagement. Vous pouvez tester le système avec vos vraies données ou un environnement de démonstration."
    },
    {
      q: "Nos données financières et règlements sont-ils protégés ?",
      a: "La confidentialité et la sécurité sont absolues. Les reçus de paiement comportent une numérotation continue officielle, chaque transaction est horodatée et les sauvegardes automatiques garantissent qu'aucune donnée ne peut être perdue."
    },
    {
      q: "Le système prend-il en charge les cours particuliers et le transport ?",
      a: "Oui, tous ces modules sont inclus nativement : cours particuliers par enseignant, feuille de route automatique pour le chauffeur de bus, gestion de la cantine et carnet de suivi scolaire."
    }
  ];

  return (
    <div className="min-h-screen bg-[#FBFDFD] text-slate-800 font-sans selection:bg-[#257C86] selection:text-white" dir="ltr">
      
      {/* ─── 1. TOP NAVIGATION BAR ───────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-11 h-11 rounded-2xl bg-white border border-[#257C86]/20 p-1 shadow-xs flex items-center justify-center overflow-hidden">
              <img src={logo} alt={centerName} className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-black tracking-tight text-slate-900">
                  {centerName}
                </span>
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-[#EAF3F4] text-[#17555F]">
                  Académie
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400">Système de Gestion Tout-en-un</p>
            </div>
          </div>

          {/* Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-8 text-xs font-bold text-slate-600">
            <button onClick={() => scrollToSection('features')} className="hover:text-[#257C86] transition cursor-pointer">
              Fonctionnalités
            </button>
            <button onClick={() => scrollToSection('why-us')} className="hover:text-[#257C86] transition cursor-pointer">
              Pourquoi nous ?
            </button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-[#257C86] transition cursor-pointer">
              Tarifs
            </button>
            <button onClick={() => scrollToSection('simulator')} className="hover:text-[#257C86] transition cursor-pointer">
              Simulateur
            </button>
            <button onClick={() => scrollToSection('faq')} className="hover:text-[#257C86] transition cursor-pointer">
              FAQ
            </button>
            <button onClick={() => scrollToSection('contact')} className="hover:text-[#257C86] transition cursor-pointer">
              Contact & Démo
            </button>
          </nav>

          {/* Right CTA / Login */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#257C86] hover:bg-[#1E6A73] text-white text-xs font-black rounded-xl shadow-md shadow-[#257C86]/20 transition cursor-pointer"
            >
              <LogIn className="h-4 w-4 text-[#C8D400]" />
              <span>Espace Connexion</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── 2. HERO SECTION (Image 1 reference) ─────────────────── */}
      <section className="relative pt-12 pb-20 overflow-hidden">
        {/* Subtle Background glows */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-[#257C86]/10 via-[#C8D400]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center relative z-10">
          
          {/* Top Pill Badges */}
          <div className="inline-flex flex-wrap items-center justify-center gap-2 p-1 px-3.5 bg-white border border-[#257C86]/20 rounded-full shadow-xs mb-8 text-[11px] font-bold text-slate-700">
            <span className="flex items-center gap-1.5 text-[#17555F]">
              <span className="w-2 h-2 rounded-full bg-[#C8D400]" />
              Pensé et conçu pour les centres d'études et académies en Tunisie
            </span>
            <span className="text-slate-300 hidden sm:inline">•</span>
            <span className="text-slate-500 hidden sm:inline flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-[#257C86]" />
              Reçus certifiés & isolation stricte
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15] mb-6">
            Simplifiez toute la gestion de votre <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-[#257C86] via-[#1E6A73] to-[#103840] bg-clip-text text-transparent">
              centre éducatif ou académie
            </span> en Tunisie
          </h1>

          {/* Subtitle */}
          <p className="max-w-3xl mx-auto text-sm sm:text-base text-slate-600 font-medium leading-relaxed mb-8">
            Inscriptions, fiches élèves, reçus de paiements infalsifiables, emplois du temps collège & lycée, 
            cours particuliers, transport scolaire, cantine et suivi des résultats. 
            Un logiciel tout-en-un, ultra-sécurisé et 100% adapté à la réalité locale.
          </p>

          {/* Call to Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
            <button
              onClick={() => {
                setRequestType('trial');
                scrollToSection('contact');
              }}
              className="w-full sm:w-auto px-7 py-3.5 bg-[#257C86] hover:bg-[#1E6A73] text-white font-black text-sm rounded-2xl shadow-lg shadow-[#257C86]/25 hover:shadow-xl transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Demander un essai gratuit (14 jours)</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              onClick={() => scrollToSection('pricing')}
              className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-sm rounded-2xl transition cursor-pointer shadow-xs"
            >
              Voir les tarifs (dès 29 TND)
            </button>
          </div>

          {/* Trust Guarantees */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-bold text-slate-500 mb-14">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#257C86]" />
              <span>Sans engagement de durée</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#257C86]" />
              <span>Accès illimité tous rôles inclus</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#257C86]" />
              <span>Assistance & migration Excel offerte</span>
            </div>
          </div>

          {/* Highlights Card (Image 1 style) */}
          <div className="bg-white rounded-3xl border border-[#257C86]/20 shadow-xl p-6 sm:p-8 text-left">
            <div className="flex items-center gap-2 pb-4 mb-6 border-b border-slate-100 text-xs font-extrabold text-slate-500">
              <Lock className="h-4 w-4 text-[#257C86]" />
              <span>Un logiciel opérationnel complet, pensé pour toute votre équipe</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1.5 p-4 rounded-2xl bg-[#F8FAFB] border border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center mb-2">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <h4 className="font-black text-sm text-slate-900">Élèves & Inscriptions</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Fiches élèves complètes, coordonnées des parents, classes et niveaux conformes au cursus tunisien.
                </p>
              </div>

              <div className="space-y-1.5 p-4 rounded-2xl bg-[#F8FAFB] border border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center mb-2">
                  <Clock className="h-5 w-5" />
                </div>
                <h4 className="font-black text-sm text-slate-900">Emplois du temps</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Planification des séances d'études, fusion intelligente des créneaux et gestion des groupes.
                </p>
              </div>

              <div className="space-y-1.5 p-4 rounded-2xl bg-[#F8FAFB] border border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center mb-2">
                  <CreditCard className="h-5 w-5" />
                </div>
                <h4 className="font-black text-sm text-slate-900">Paiements & Reçus</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Édition instantanée de reçus officiels infalsifiables, suivi des impayés et gestion des remises.
                </p>
              </div>

              <div className="space-y-1.5 p-4 rounded-2xl bg-[#F8FAFB] border border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center mb-2">
                  <Bus className="h-5 w-5" />
                </div>
                <h4 className="font-black text-sm text-slate-900">Transport & Cantine</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Feuille de route quotidienne pour le chauffeur de bus et suivi des repas de la cantine.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] font-bold text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>Données sécurisées hébergées en environnement hautement protégé avec sauvegardes régulières.</span>
            </div>
          </div>

        </div>
      </section>

      {/* ─── 3. DIFFERENTIATORS SECTION (Image 2 reference) ────────── */}
      <section id="why-us" className="py-20 bg-[#F4F9FA] border-y border-slate-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="px-3 py-1 rounded-full bg-[#E0EFF1] text-[#17555F] text-xs font-black uppercase tracking-wider">
              Pourquoi choisir notre solution ?
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mt-3">
              Des différenciateurs concrets, taillés pour les académies et centres tunisiens
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-3">
              Pas de fonctionnalités gadgets. Un outil robuste, conforme aux réalités du marché local, 
              qui protège rigoureusement vos données et simplifie votre quotidien administratif.
            </p>
          </div>

          {/* Dark Highlight Card (Screenshot 2 style) */}
          <div className="bg-[#123E45] rounded-3xl text-white p-6 sm:p-10 shadow-2xl mb-8 relative overflow-hidden">
            <div className="max-w-2xl relative z-10 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-[11px] font-extrabold">
                <Lock className="h-3.5 w-3.5" />
                <span>Sécurité & Clarté financière</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black leading-snug">
                "Chaque paiement est tracé, chaque reçu est officiel et infalsifiable"
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                En Tunisie, la gestion de la trésorerie et la confiance des parents d'élèves sont primordiales. 
                Notre système génère automatiquement des reçus numérotés uniques avec historique des versements, 
                permettant un contrôle transparent des encaissements sans risque d'erreur ou d'omission.
              </p>
              <div className="flex flex-wrap gap-4 pt-2 text-xs font-bold text-emerald-200">
                <span>✓ Reçus imprimables instantanés</span>
                <span>✓ Traçabilité de chaque dinar</span>
                <span>✓ Suivi clair des remises accordées</span>
              </div>
            </div>

            {/* Subtle aesthetic icon watermark */}
            <CreditCard className="absolute -bottom-10 -right-10 w-72 h-72 text-white/5 pointer-events-none" />
          </div>

          {/* 3 Pillar Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Card 1 */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center">
                  <Building2 className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  100% Localisé
                </span>
              </div>
              <h4 className="font-black text-base text-slate-900">Pensé pour la Tunisie & vos réalités</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Finies les solutions étrangères inadaptées. Notre logiciel intègre nativement les niveaux tunisiens 
                (Primaire 1-6, Collège 7-9, Lycée 1ère à Bac avec toutes les filières), le dinar tunisien (TND) 
                et les calendriers scolaires nationaux.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  Confidentialité
                </span>
              </div>
              <h4 className="font-black text-base text-slate-900">Sécurité maximale de vos dossiers</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Vos données restent votre propriété exclusive. Dossiers médicaux, fiches familiales, coordonnées 
                des parents et montants des salaires de l'équipe sont cloisonnés et protégés contre les accès non autorisés.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center">
                  <Award className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  Tout-en-un
                </span>
              </div>
              <h4 className="font-black text-base text-slate-900">Tous les modules intégrés d'office</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Aucun coût additionnel caché. Vous disposez de la gestion d'études, des cours de révision d'examens, 
                des formations, du transport scolaire avec feuille de route, de la cantine et de la bibliothèque au même endroit.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ─── 4. FEATURES GRID ──────────────────────────────────────── */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="px-3 py-1 rounded-full bg-[#E0EFF1] text-[#17555F] text-xs font-black uppercase tracking-wider">
              Fonctionnalités Clés
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mt-3">
              Une boîte à outils complète pour piloter votre centre
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-2">
              Chaque module a été pensé avec les directeurs d'académies pour supprimer la paperasse et les erreurs de calcul.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <div className="p-6 rounded-3xl border border-slate-200/80 bg-white shadow-xs hover:border-[#257C86]/50 transition">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center font-bold mb-3">
                <FileText className="h-5 w-5" />
              </div>
              <h4 className="font-black text-base text-slate-900 mb-1">Fiches Inscriptions Officielles</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Impression de la fiche d'inscription officielle A4 avec signature du tuteur, antécédents médicaux et engagements.
              </p>
            </div>

            <div className="p-6 rounded-3xl border border-slate-200/80 bg-white shadow-xs hover:border-[#257C86]/50 transition">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center font-bold mb-3">
                <Printer className="h-5 w-5" />
              </div>
              <h4 className="font-black text-base text-slate-900 mb-1">Reçus de Paiement Imprimables</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Édition en un clic de reçus nets et propres sans entêtes web polluantes, avec historique complet des versements.
              </p>
            </div>

            <div className="p-6 rounded-3xl border border-slate-200/80 bg-white shadow-xs hover:border-[#257C86]/50 transition">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center font-bold mb-3">
                <Bus className="h-5 w-5" />
              </div>
              <h4 className="font-black text-base text-slate-900 mb-1">Feuille de Route Bus A4</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Calcul automatique des trajets aller-retour selon les horaires de sortie des écoles avec pointage des présences.
              </p>
            </div>

            <div className="p-6 rounded-3xl border border-slate-200/80 bg-white shadow-xs hover:border-[#257C86]/50 transition">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center font-bold mb-3">
                <BookOpen className="h-5 w-5" />
              </div>
              <h4 className="font-black text-base text-slate-900 mb-1">Cours Particuliers & Assurances</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Gestion des séances par matière et enseignant, paiement à la séance ou au forfait avec suivi de l'assurance scolaire.
              </p>
            </div>

            <div className="p-6 rounded-3xl border border-slate-200/80 bg-white shadow-xs hover:border-[#257C86]/50 transition">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center font-bold mb-3">
                <Utensils className="h-5 w-5" />
              </div>
              <h4 className="font-black text-base text-slate-900 mb-1">Cantine & Régimes Alimentaires</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Planning des menus hebdomadaires, comptage quotidien des repas servis et gestion des allergies ou régimes spécifiques.
              </p>
            </div>

            <div className="p-6 rounded-3xl border border-slate-200/80 bg-white shadow-xs hover:border-[#257C86]/50 transition">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3F4] text-[#257C86] flex items-center justify-center font-bold mb-3">
                <Users className="h-5 w-5" />
              </div>
              <h4 className="font-black text-base text-slate-900 mb-1">Personnel & Salaires Enseignants</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Fiches du personnel, suivi des heures travaillées, calcul des rémunérations et historique des acomptes versés.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ─── 5. PRICING & SIMULATOR SECTION (Image 3 reference) ───── */}
      <section id="pricing" className="py-20 bg-[#F4F9FA] border-t border-slate-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="px-3 py-1 rounded-full bg-[#E0EFF1] text-[#17555F] text-xs font-black uppercase tracking-wider">
              Tarification transparente en Dinars Tunisiens (TND)
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mt-3">
              Des tarifs simples, équitables et adaptés à votre taille
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-2">
              Facturation sans frais cachés. Vous ne payez que pour le palier correspondant à l'effectif réel de votre académie.
            </p>

            {/* Billing toggle */}
            <div className="mt-6 inline-flex items-center p-1 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  billingCycle === 'monthly' ? 'bg-[#257C86] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Paiement Mensuel
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  billingCycle === 'annual' ? 'bg-[#257C86] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Paiement Annuel</span>
                <span className="px-2 py-0.5 rounded-full bg-[#C8D400] text-slate-950 text-[10px] font-extrabold">
                  2 mois offerts
                </span>
              </button>
            </div>
          </div>

          {/* SIMULATOR (Image 3 style) */}
          <div id="simulator" className="max-w-2xl mx-auto bg-white rounded-3xl border border-[#257C86]/20 p-6 sm:p-8 shadow-lg mb-14 text-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Simulateur : Combien d'élèves compte votre académie ?
            </span>
            
            <div className="text-3xl sm:text-4xl font-black text-[#257C86] my-3">
              {studentCount} {studentCount >= 300 ? '+ élèves' : 'élèves'}
            </div>

            <div className="px-2 sm:px-6 my-4">
              <input
                type="range"
                min="10"
                max="320"
                step="5"
                value={studentCount}
                onChange={(e) => setStudentCount(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#257C86]"
              />
              <div className="flex justify-between text-[11px] font-bold text-slate-400 mt-2">
                <span>10 élèves</span>
                <span>50</span>
                <span>100</span>
                <span>200</span>
                <span>300+</span>
              </div>
            </div>

            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#EAF3F4] text-[#17555F] text-xs font-black border border-[#A0CBCF]/40">
              <Sparkles className="h-4 w-4 text-[#257C86]" />
              <span>
                Palier recommandé pour vous :{' '}
                <strong>
                  {recommendedTier === 'starter' && 'Starter (1 à 40 élèves)'}
                  {recommendedTier === 'growth' && 'Croissance (41 à 100 élèves)'}
                  {recommendedTier === 'pro' && 'Académie Pro (101 à 250 élèves)'}
                  {recommendedTier === 'custom' && 'Sur Mesure (Plus de 250 élèves)'}
                </strong>
              </span>
            </div>
          </div>

          {/* PRICING CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* TIER 1: STARTER */}
            <div className={`bg-white rounded-3xl p-6 border transition flex flex-col justify-between ${
              recommendedTier === 'starter'
                ? 'border-[#257C86] ring-2 ring-[#257C86]/20 shadow-xl relative'
                : 'border-slate-200 shadow-xs'
            }`}>
              <div>
                <h3 className="text-lg font-black text-slate-900">Starter</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">1 à 40 élèves</p>

                <div className="my-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900">
                      {billingCycle === 'monthly' ? '29.99' : '290'}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      TND {billingCycle === 'monthly' ? '/ mois' : '/ an'}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 mt-1">Sans engagement de durée</p>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-medium mb-6">
                  Parfait pour les nouveaux centres de soutien, études surveillées de quartier ou petits groupes.
                </p>

                <ul className="space-y-2.5 text-xs font-bold text-slate-600 border-t border-slate-100 pt-5">
                  <li className="flex items-center gap-2">✓ Fiches élèves & parents</li>
                  <li className="flex items-center gap-2">✓ Reçus de paiement imprimables</li>
                  <li className="flex items-center gap-2">✓ Emplois du temps & présences</li>
                  <li className="flex items-center gap-2">✓ Multi-utilisateurs inclus</li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setEstimatedSize('1 à 40 élèves');
                  scrollToSection('contact');
                }}
                className="mt-6 w-full py-2.5 bg-slate-100 hover:bg-[#257C86] hover:text-white text-slate-800 font-extrabold text-xs rounded-xl transition cursor-pointer"
              >
                Choisir Starter
              </button>
            </div>

            {/* TIER 2: CROISSANCE (MOST POPULAR) */}
            <div className={`bg-white rounded-3xl p-6 border transition flex flex-col justify-between ${
              recommendedTier === 'growth'
                ? 'border-[#257C86] ring-2 ring-[#257C86]/30 shadow-2xl relative scale-105'
                : 'border-[#257C86]/40 shadow-md relative'
            }`}>
              {/* Highlight badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#257C86] text-white text-[10px] font-black uppercase tracking-wider shadow-xs">
                ⭐ Le plus populaire
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900">Croissance</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">41 à 100 élèves</p>

                <div className="my-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-[#257C86]">
                      {billingCycle === 'monthly' ? '59.99' : '590'}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      TND {billingCycle === 'monthly' ? '/ mois' : '/ an'}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 mt-1">Facturation flexible</p>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-medium mb-6">
                  Pour les centres bien installés souhaitant automatiser leurs encaissements et la gestion des révisions.
                </p>

                <ul className="space-y-2.5 text-xs font-bold text-slate-700 border-t border-slate-100 pt-5">
                  <li className="flex items-center gap-2">✓ <strong>Tout Starter inclus</strong></li>
                  <li className="flex items-center gap-2">✓ Cours particuliers par matière</li>
                  <li className="flex items-center gap-2">✓ Séances de révision d'examens</li>
                  <li className="flex items-center gap-2">✓ Gestion des dépenses du centre</li>
                  <li className="flex items-center gap-2">✓ Support prioritaire 7j/7</li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setEstimatedSize('41 à 100 élèves');
                  scrollToSection('contact');
                }}
                className="mt-6 w-full py-2.5 bg-[#257C86] hover:bg-[#1E6A73] text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#257C86]/20 transition cursor-pointer"
              >
                Choisir Croissance
              </button>
            </div>

            {/* TIER 3: ACADÉMIE PRO */}
            <div className={`bg-white rounded-3xl p-6 border transition flex flex-col justify-between ${
              recommendedTier === 'pro'
                ? 'border-[#257C86] ring-2 ring-[#257C86]/20 shadow-xl relative'
                : 'border-slate-200 shadow-xs'
            }`}>
              <div>
                <h3 className="text-lg font-black text-slate-900">Académie Pro</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">101 à 250 élèves</p>

                <div className="my-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900">
                      {billingCycle === 'monthly' ? '99.99' : '990'}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      TND {billingCycle === 'monthly' ? '/ mois' : '/ an'}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 mt-1">Solution tout-en-un avancée</p>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-medium mb-6">
                  La solution complète pour piloter un centre multidisciplinaire avec transport et restauration.
                </p>

                <ul className="space-y-2.5 text-xs font-bold text-slate-600 border-t border-slate-100 pt-5">
                  <li className="flex items-center gap-2">✓ <strong>Tout Croissance inclus</strong></li>
                  <li className="flex items-center gap-2">✓ Module Transport (Feuilles de route)</li>
                  <li className="flex items-center gap-2">✓ Gestion Cantine & Repas</li>
                  <li className="flex items-center gap-2">✓ Gestion Bibliothèque & Prêts</li>
                  <li className="flex items-center gap-2">✓ Salaires & Pointages équipe</li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setEstimatedSize('101 à 250 élèves');
                  scrollToSection('contact');
                }}
                className="mt-6 w-full py-2.5 bg-slate-100 hover:bg-[#257C86] hover:text-white text-slate-800 font-extrabold text-xs rounded-xl transition cursor-pointer"
              >
                Choisir Académie Pro
              </button>
            </div>

            {/* TIER 4: SUR MESURE */}
            <div className={`bg-white rounded-3xl p-6 border transition flex flex-col justify-between ${
              recommendedTier === 'custom'
                ? 'border-[#257C86] ring-2 ring-[#257C86]/20 shadow-xl relative'
                : 'border-slate-200 shadow-xs'
            }`}>
              <div>
                <h3 className="text-lg font-black text-slate-900">Sur Mesure</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">Plus de 250 élèves / Réseaux</p>

                <div className="my-6">
                  <div className="text-2xl font-black text-slate-900">
                    Sur devis
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 mt-1">Accompagnement personnalisé</p>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-medium mb-6">
                  Pour les grands complexes éducatifs ou multi-succursales nécessitant une configuration dédiée.
                </p>

                <ul className="space-y-2.5 text-xs font-bold text-slate-600 border-t border-slate-100 pt-5">
                  <li className="flex items-center gap-2">✓ Multi-centres & filiales</li>
                  <li className="flex items-center gap-2">✓ Données et serveurs dédiés</li>
                  <li className="flex items-center gap-2">✓ Personnalisation sur mesure</li>
                  <li className="flex items-center gap-2">✓ Formation sur site possible</li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setEstimatedSize('Plus de 250 élèves');
                  scrollToSection('contact');
                }}
                className="mt-6 w-full py-2.5 bg-slate-100 hover:bg-[#257C86] hover:text-white text-slate-800 font-extrabold text-xs rounded-xl transition cursor-pointer"
              >
                Demander un devis
              </button>
            </div>

          </div>

        </div>
      </section>

      {/* ─── 6. CONTACT & DEMO REQUEST (Image 4 reference) ────────── */}
      <section id="contact" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            {/* Left Info Column */}
            <div className="lg:col-span-5 space-y-6">
              <span className="px-3 py-1 rounded-full bg-[#E0EFF1] text-[#17555F] text-xs font-black uppercase tracking-wider">
                Contact & Démonstration
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                Prêt à moderniser la gestion de votre académie ?
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                Remplissez le formulaire ci-contre pour demander une démonstration personnalisée, 
                tester l'outil gratuitement pendant 14 jours ou obtenir un devis adapté à votre effectif.
              </p>

              <div className="space-y-4 pt-4">
                <div className="p-4 rounded-2xl bg-[#F4F9FA] border border-slate-200/80 flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-white border border-[#257C86]/20 text-[#257C86] flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900">Email de l'équipe</h5>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">contact@academy-system.tn</p>
                    <span className="text-[10px] text-slate-400 font-medium">Réponse garantie sous 24h ouvrées</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#F4F9FA] border border-slate-200/80 flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-white border border-[#257C86]/20 text-[#257C86] flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900">Implantation locale</h5>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">Sfax / Tunis, Tunisie</p>
                    <span className="text-[10px] text-slate-400 font-medium">Équipe support disponible aux horaires tunisiens</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#F4F9FA] border border-slate-200/80 flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-white border border-[#257C86]/20 text-[#257C86] flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900">Protection des données</h5>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">Confidentialité totale garantie</p>
                    <span className="text-[10px] text-slate-400 font-medium">Vos coordonnées restent strictement confidentielles</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Form Card (Screenshot 4 style) */}
            <div className="lg:col-span-7 bg-[#FBFDFD] rounded-3xl border border-slate-200/90 shadow-xl p-6 sm:p-10">
              
              {formSubmitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-12 text-center space-y-4"
                >
                  <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">Demande envoyée avec succès !</h3>
                  <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                    Merci <strong>{fullName}</strong>. Notre équipe va vous contacter sur le numéro <strong>{phone}</strong> et par email afin d'activer votre accès d'essai sous 24h.
                  </p>
                  <button
                    onClick={() => {
                      setFormSubmitted(false);
                      setFullName('');
                      setEmail('');
                      setPhone('');
                      setMessage('');
                    }}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl cursor-pointer transition"
                  >
                    Envoyer une autre demande
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div>
                    <h3 className="font-black text-base text-slate-900">Formulaire de demande</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Tous les champs marqués d'une * sont requis</p>
                  </div>

                  {/* Nature de la demande (Toggle) */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">Nature de votre demande *</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setRequestType('trial')}
                        className={`py-2 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer border text-center ${
                          requestType === 'trial'
                            ? 'bg-[#257C86] text-white border-[#257C86] shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        Essai gratuit (14j)
                      </button>

                      <button
                        type="button"
                        onClick={() => setRequestType('demo')}
                        className={`py-2 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer border text-center ${
                          requestType === 'demo'
                            ? 'bg-[#257C86] text-white border-[#257C86] shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        Démo guidée
                      </button>

                      <button
                        type="button"
                        onClick={() => setRequestType('info')}
                        className={`py-2 px-3 rounded-xl text-xs font-extrabold transition cursor-pointer border text-center ${
                          requestType === 'info'
                            ? 'bg-[#257C86] text-white border-[#257C86] shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        Devis / Info
                      </button>
                    </div>
                  </div>

                  {/* Row 1: Name & Academy */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">Nom complet *</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ex: Mohamed Ben Salah"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#257C86]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">Nom du centre / académie *</label>
                      <input
                        type="text"
                        required
                        value={academyName}
                        onChange={(e) => setAcademyName(e.target.value)}
                        placeholder="Ex: Centre d'Études Ennajah"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#257C86]"
                      />
                    </div>
                  </div>

                  {/* Row 2: Email & Phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">Email professionnel *</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="contact@votre-centre.tn"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#257C86]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">Téléphone / WhatsApp *</label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+216 98 000 000"
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#257C86]"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Estimated Size */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">Taille approximative de votre académie *</label>
                    <select
                      value={estimatedSize}
                      onChange={(e) => setEstimatedSize(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#257C86]"
                    >
                      <option value="1 à 40 élèves">1 à 40 élèves (Starter - 29.99 TND/mois)</option>
                      <option value="41 à 100 élèves">41 à 100 élèves (Croissance - 59.99 TND/mois)</option>
                      <option value="101 à 250 élèves">101 à 250 élèves (Académie Pro - 99.99 TND/mois)</option>
                      <option value="Plus de 250 élèves">Plus de 250 élèves (Sur devis)</option>
                    </select>
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">Votre message ou besoins particuliers</label>
                    <textarea
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Ex: Nous souhaitons remplacer notre suivi Excel pour les études, le transport et les reçus de paiement..."
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#257C86]"
                    />
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-[#257C86] hover:bg-[#1E6A73] disabled:opacity-50 text-white font-black text-xs rounded-2xl shadow-lg shadow-[#257C86]/20 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    <span>{isSubmitting ? 'Envoi en cours...' : 'Envoyer ma demande'}</span>
                  </button>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 text-[11px] font-bold text-slate-400">
                    <span>Sans engagement • Accompagnement gratuit au démarrage</span>
                    <button
                      type="button"
                      onClick={onOpenLogin}
                      className="text-[#257C86] hover:underline font-extrabold cursor-pointer"
                    >
                      Déjà client ? Se connecter à l'espace de gestion →
                    </button>
                  </div>
                </form>
              )}

            </div>

          </div>

        </div>
      </section>

      {/* ─── 7. FAQ SECTION ────────────────────────────────────────── */}
      <section id="faq" className="py-20 bg-[#F4F9FA] border-t border-slate-200/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="px-3 py-1 rounded-full bg-[#E0EFF1] text-[#17555F] text-xs font-black uppercase tracking-wider">
              FAQ
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-3">
              Questions fréquemment posées
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-4 sm:p-5 text-left font-black text-xs sm:text-sm text-slate-900 flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-[#257C86] shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs text-slate-600 leading-relaxed font-medium border-t border-slate-100 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── 8. FOOTER ─────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={logo} alt={centerName} className="w-9 h-9 object-contain" />
            <div>
              <span className="font-black text-slate-900 text-sm">{centerName}</span>
              <p className="text-[10px] text-slate-400 font-bold">Plateforme de Gestion pour Académies et Centres Éducatifs en Tunisie</p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-bold text-slate-500">
            <button onClick={() => scrollToSection('features')} className="hover:text-[#257C86]">Fonctionnalités</button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-[#257C86]">Tarifs</button>
            <button onClick={() => scrollToSection('contact')} className="hover:text-[#257C86]">Contact</button>
            <button onClick={onOpenLogin} className="text-[#257C86] font-black hover:underline">Espace Connexion</button>
          </div>

          <div className="text-xs font-bold text-slate-400">
            © {new Date().getFullYear()} {centerName}. Tous droits réservés.
          </div>
        </div>
      </footer>

    </div>
  );
}

