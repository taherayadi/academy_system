import React from 'react';
import { AlertTriangle, CalendarClock, ShieldAlert } from 'lucide-react';
import type { CenterStatus, SaaSPlan } from '../types';

export interface SubscriptionStatusInfo {
  status: CenterStatus;
  plan?: SaaSPlan;
  trialEndsAt?: number | null;
  subscriptionEndsAt?: number | null;
  billingCycle?: 'monthly' | 'annual';
}

const DAY_MS = 86400000;

/** Jours entiers restants avant l'échéance (0 = aujourd'hui, négatif = dépassé). */
export function daysUntil(ts?: number | null, now: number = Date.now()): number | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  return Math.ceil((ts - now) / DAY_MS);
}

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

const plural = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;

export interface SubscriptionStatusView {
  tone: 'amber' | 'red';
  icon: typeof AlertTriangle;
  title: string;
  subtitle: string;
  message: string;
  daysLeft: number | null;
  dueDate: number | null;
}

/**
 * Carte d'alerte affichée en haut du tableau de bord centre : essai gratuit en
 * cours, renouvellement proche, abonnement expiré ou suspendu. Renvoie null
 * quand il n'y a rien à signaler (abonnement actif et lointain).
 */
export function resolveSubscriptionStatus(
  info: SubscriptionStatusInfo,
  now: number = Date.now(),
): SubscriptionStatusView | null {
  const { status, trialEndsAt, subscriptionEndsAt } = info;

  if (status === 'suspended') {
    return {
      tone: 'red',
      icon: ShieldAlert,
      title: 'Abonnement suspendu',
      subtitle: 'الاشتراك موقوف',
      message: 'L’accès à votre espace est suspendu. Contactez l’administrateur de la plateforme pour le réactiver.',
      daysLeft: null,
      dueDate: null,
    };
  }

  if (status === 'trial') {
    const days = daysUntil(trialEndsAt, now);
    if (days === null) {
      return {
        tone: 'amber',
        icon: CalendarClock,
        title: 'Période d’essai en cours',
        subtitle: 'الفترة التجريبية',
        message: 'Votre centre profite actuellement de la période d’essai gratuite.',
        daysLeft: null,
        dueDate: null,
      };
    }
    if (days < 0) {
      return {
        tone: 'red',
        icon: AlertTriangle,
        title: 'Période d’essai terminée',
        subtitle: 'انتهت الفترة التجريبية',
        message: 'Votre essai gratuit est arrivé à son terme. Souscrivez à une offre pour garder l’accès à votre espace.',
        daysLeft: days,
        dueDate: trialEndsAt ?? null,
      };
    }
    if (days === 0) {
      return {
        tone: 'amber',
        icon: AlertTriangle,
        title: 'Dernier jour d’essai',
        subtitle: 'آخر يوم من الفترة التجريبية',
        message: 'Votre essai gratuit se termine aujourd’hui. Souscrivez à une offre pour éviter toute interruption.',
        daysLeft: 0,
        dueDate: trialEndsAt ?? null,
      };
    }
    if (days <= 7) {
      return {
        tone: 'amber',
        icon: AlertTriangle,
        title: `Essai gratuit : ${plural(days)} restant${days > 1 ? 's' : ''}`,
        subtitle: 'قرب انتهاء الفترة التجريبية',
        message: `Votre essai gratuit se termine le ${formatDate(trialEndsAt as number)}. Souscrivez à une offre pour éviter toute interruption.`,
        daysLeft: days,
        dueDate: trialEndsAt ?? null,
      };
    }
    return {
      tone: 'amber',
      icon: CalendarClock,
      title: 'Période d’essai en cours',
      subtitle: 'الفترة التجريبية',
      message: `Il vous reste ${plural(days)} d’essai gratuit, jusqu’au ${formatDate(trialEndsAt as number)}.`,
      daysLeft: days,
      dueDate: trialEndsAt ?? null,
    };
  }

  if (status === 'expired') {
    return {
      tone: 'red',
      icon: AlertTriangle,
      title: 'Abonnement expiré',
      subtitle: 'انتهاء الاشتراك',
      message: 'Votre abonnement est arrivé à échéance. Renouvelez-le pour retrouver l’accès complet à votre espace.',
      daysLeft: daysUntil(subscriptionEndsAt, now),
      dueDate: subscriptionEndsAt ?? null,
    };
  }

  // Abonnement actif : on ne prévient qu'à l'approche de l'échéance.
  const days = daysUntil(subscriptionEndsAt, now);
  if (days === null) return null;
  if (days < 0) {
    return {
      tone: 'red',
      icon: AlertTriangle,
      title: 'Abonnement expiré',
      subtitle: 'انتهاء الاشتراك',
      message: 'Votre abonnement est arrivé à échéance. Renouvelez-le pour retrouver l’accès complet à votre espace.',
      daysLeft: days,
      dueDate: subscriptionEndsAt ?? null,
    };
  }
  if (days <= 14) {
    return {
      tone: 'amber',
      icon: CalendarClock,
      title: days === 0 ? 'Renouvellement aujourd’hui' : `Renouvellement dans ${plural(days)}`,
      subtitle: 'قرب موعد تجديد الاشتراك',
      message: `Votre abonnement arrive à échéance le ${formatDate(subscriptionEndsAt as number)}. Pensez au renouvellement pour éviter toute interruption.`,
      daysLeft: days,
      dueDate: subscriptionEndsAt ?? null,
    };
  }
  return null;
}

const TONE_CLASSES: Record<'amber' | 'red', { card: string; icon: string; badge: string }> = {
  amber: {
    card: 'bg-amber-50 border-amber-200',
    icon: 'bg-amber-100 text-amber-600',
    badge: 'bg-amber-100 text-amber-800',
  },
  red: {
    card: 'bg-red-50 border-red-200',
    icon: 'bg-red-100 text-red-600',
    badge: 'bg-red-100 text-red-800',
  },
};

export default function SubscriptionStatusCard({
  subscription,
  now = Date.now(),
}: {
  subscription?: SubscriptionStatusInfo | null;
  now?: number;
}) {
  const view = subscription ? resolveSubscriptionStatus(subscription, now) : null;
  if (!view) return null;

  const tone = TONE_CLASSES[view.tone];
  const Icon = view.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="subscription-status-card"
      data-tone={view.tone}
      className={`flex items-start gap-3 rounded-3xl border-2 p-4 shadow-sm sm:p-5 ${tone.card}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tone.icon}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-black text-slate-900">{view.title}</p>
          <span className="text-[11px] font-bold text-slate-500" dir="rtl">{view.subtitle}</span>
        </div>
        <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{view.message}</p>
      </div>
      {view.daysLeft !== null && (
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black tabular-nums ${tone.badge}`}>
          {view.daysLeft > 0 ? `${view.daysLeft} j` : view.daysLeft === 0 ? "aujourd’hui" : 'échu'}
        </span>
      )}
    </div>
  );
}
