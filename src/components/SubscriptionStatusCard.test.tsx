import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubscriptionStatusCard, { resolveSubscriptionStatus, daysUntil } from './SubscriptionStatusCard';
import type { SubscriptionStatusInfo } from './SubscriptionStatusCard';

const DAY = 86400000;
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // 15 janvier 2026, midi UTC

const info = (over: Partial<SubscriptionStatusInfo> = {}): SubscriptionStatusInfo => ({
  status: 'active',
  ...over,
});

describe('daysUntil', () => {
  it('counts whole days left (0 = today, negative = overdue)', () => {
    expect(daysUntil(NOW + 3 * DAY, NOW)).toBe(3);
    expect(daysUntil(NOW + 2 * DAY, NOW)).toBe(2);
    expect(daysUntil(NOW, NOW)).toBe(0);
    expect(daysUntil(NOW - DAY, NOW)).toBe(-1);
  });

  it('returns null without a usable timestamp', () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil(undefined, NOW)).toBeNull();
  });
});

describe('resolveSubscriptionStatus', () => {
  it('trial ending soon → amber with the days left', () => {
    const view = resolveSubscriptionStatus(info({ status: 'trial', trialEndsAt: NOW + 3 * DAY }), NOW);
    expect(view?.tone).toBe('amber');
    expect(view?.title).toContain('3 jours restants');
    expect(view?.daysLeft).toBe(3);
  });

  it('last trial day → amber « Dernier jour d’essai »', () => {
    const view = resolveSubscriptionStatus(info({ status: 'trial', trialEndsAt: NOW }), NOW);
    expect(view?.tone).toBe('amber');
    expect(view?.title).toBe('Dernier jour d’essai');
    expect(view?.daysLeft).toBe(0);
  });

  it('trial overdue → red', () => {
    const view = resolveSubscriptionStatus(info({ status: 'trial', trialEndsAt: NOW - 2 * DAY }), NOW);
    expect(view?.tone).toBe('red');
    expect(view?.title).toBe('Période d’essai terminée');
  });

  it('active plan renewing within 14 days → amber', () => {
    const view = resolveSubscriptionStatus(info({ status: 'active', subscriptionEndsAt: NOW + 5 * DAY }), NOW);
    expect(view?.tone).toBe('amber');
    expect(view?.title).toContain('Renouvellement dans 5 jours');
  });

  it('active plan far from renewal → nothing to show', () => {
    expect(resolveSubscriptionStatus(info({ status: 'active', subscriptionEndsAt: NOW + 40 * DAY }), NOW)).toBeNull();
  });

  it('suspended or expired → red', () => {
    expect(resolveSubscriptionStatus(info({ status: 'suspended' }), NOW)?.tone).toBe('red');
    expect(resolveSubscriptionStatus(info({ status: 'expired' }), NOW)?.tone).toBe('red');
  });
});

describe('SubscriptionStatusCard', () => {
  it('renders the amber alert at the top of the dashboard data', () => {
    render(<SubscriptionStatusCard subscription={info({ status: 'trial', trialEndsAt: NOW + 2 * DAY })} now={NOW} />);
    const card = screen.getByTestId('subscription-status-card');
    expect(card.getAttribute('data-tone')).toBe('amber');
    expect(card.className).toContain('bg-amber-50');
    expect(screen.getByText(/2 jours restants/)).toBeTruthy();
    // Sous-titre arabe de la branche « essai bientôt terminé ».
    expect(screen.getByText(/الفترة التجريبية/)).toBeTruthy();
    // Le badge de jours restants est bien affiché.
    expect(screen.getByText('2 j')).toBeTruthy();
  });

  it('renders red for a suspended subscription', () => {
    render(<SubscriptionStatusCard subscription={info({ status: 'suspended' })} now={NOW} />);
    const card = screen.getByTestId('subscription-status-card');
    expect(card.getAttribute('data-tone')).toBe('red');
    expect(card.className).toContain('bg-red-50');
    expect(screen.getByText('Abonnement suspendu')).toBeTruthy();
  });

  it('renders nothing when there is no alert and no subscription', () => {
    const { container } = render(<SubscriptionStatusCard subscription={info({ status: 'active', subscriptionEndsAt: NOW + 40 * DAY })} now={NOW} />);
    expect(container.firstChild).toBeNull();
    const empty = render(<SubscriptionStatusCard subscription={null} now={NOW} />);
    expect(empty.container.firstChild).toBeNull();
  });
});
