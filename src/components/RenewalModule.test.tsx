import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import * as api from '../api';

vi.mock('../api', () => ({
  fetchPublicModulePricesApi: vi.fn(),
  fetchRenewalRequestsApi: vi.fn(),
  createRenewalRequestApi: vi.fn(),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('./Toast', () => ({
  useToast: () => ({
    success: toastSuccess,
    error: toastError,
    info: vi.fn(),
    warning: vi.fn(),
    showToast: vi.fn(),
  }),
}));

import RenewalModule from './RenewalModule';
import type { CenterTenant } from '../types';

const DAY = 86400000;
const NOW = Date.UTC(2026, 2, 1, 9, 0, 0);

const PRICES: Record<string, number> = {
  scolaire: 50, finance: 40, studentTimeSheets: 0, etude: 30,
  coursParticuliers: 25, revision: 20, formations: 35,
  cantine: 45, transport: 40, events: 15, staff: 30,
};

const center = (over: Partial<CenterTenant> = {}): CenterTenant => ({
  id: 'c1',
  name: 'Centre Alpha',
  plan: 'starter',
  enabledModules: ['scolaire', 'studentTimeSheets', 'finance'],
  status: 'active',
  trialEndsAt: null,
  subscriptionEndsAt: NOW + 12 * DAY,
  billingCycle: 'monthly',
  createdAt: NOW - 60 * DAY,
  ...over,
} as CenterTenant);

const request = (over: Record<string, unknown> = {}) => ({
  id: 'r1', centerId: 'c1', kind: 'renewal', currentPlan: 'starter', currentStatus: 'active',
  currentModules: ['scolaire'], requestedPlan: 'starter',
  requestedModules: ['scolaire', 'finance'], billingCycle: 'monthly',
  amount: 90, status: 'pending', effectiveAt: NOW + 12 * DAY, note: '',
  decisionNote: '', decidedBy: '', decidedAt: null, createdAt: NOW - DAY, updatedAt: NOW - DAY,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  (api.fetchPublicModulePricesApi as ReturnType<typeof vi.fn>).mockResolvedValue(PRICES);
  (api.fetchRenewalRequestsApi as ReturnType<typeof vi.fn>).mockResolvedValue({ requests: [], history: [] });
  (api.createRenewalRequestApi as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, id: 'new' });
});

describe('RenewalModule — current plan and time left', () => {
  it('shows the current offer, the days left and the renewal date', async () => {
    render(<RenewalModule center={center()} />);

    await waitFor(() => expect(api.fetchRenewalRequestsApi).toHaveBeenCalled());
    expect(screen.getByText('Renouvellement')).toBeTruthy();
    expect(screen.getAllByText('Offre actuelle').length).toBeGreaterThan(0);
    expect(screen.getByText('12 jours')).toBeTruthy();
    expect(screen.getByText(/Échéance/)).toBeTruthy();
    expect(screen.getByText('Temps restant')).toBeTruthy();
  });

  it('reports an elapsed subscription', async () => {
    render(<RenewalModule center={center({ subscriptionEndsAt: NOW - 3 * DAY })} />);
    await waitFor(() => expect(screen.getByText('Échu')).toBeTruthy());
  });
});

describe('RenewalModule — plan simulator', () => {
  it('computes the total from the selected modules (same catalogue as the landing page)', async () => {
    render(<RenewalModule center={center()} />);
    await waitFor(() => expect(screen.getByText('Simulateur de plan')).toBeTruthy());

    // Base = scolaire 50 + finance 40 + Jd. Horaires 0 (offert) = 90 TND.
    await waitFor(() => expect(screen.getByText('90 TND')).toBeTruthy());

    // Cocher « Étude Surveillée » (+30) → 120 TND.
    const etudeLabel = screen.getByText('Étude Surveillée').closest('label') as HTMLLabelElement;
    fireEvent.click(etudeLabel.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await waitFor(() => expect(screen.getByText('120 TND')).toBeTruthy());
  });

  it('picking the Growth offer loads its preset modules and reprices', async () => {
    render(<RenewalModule center={center()} />);
    await waitFor(() => expect(screen.getByText('Growth')).toBeTruthy());

    fireEvent.click(screen.getByText('Growth'));

    // Growth = base (90) + étude 30 + cours 25 + révision 20 = 165 TND.
    await waitFor(() => expect(screen.getByText('165 TND')).toBeTruthy());
  });

  it('switching to annual applies the 20 % discount (12 months −20 %)', async () => {
    render(<RenewalModule center={center()} />);
    await waitFor(() => expect(screen.getByText('90 TND')).toBeTruthy());
    fireEvent.click(screen.getByText('Annuel'));
    // 90 × 12 = 1080, remisé de 20 % → 864 TND.
    await waitFor(() => expect(screen.getByText('864 TND')).toBeTruthy());
    expect(screen.getByText('1080 TND')).toBeTruthy(); // prix barré
    expect(screen.getByText('−20 %')).toBeTruthy();
  });

  it('the offer follows the modules actually ticked', async () => {
    render(<RenewalModule center={center()} />);
    await waitFor(() => expect(screen.getByText('Simulateur de plan')).toBeTruthy());

    // « Basic » apparaît aussi dans l'en-tête → on cible le bouton d'offre.
    const tier = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

    // Base seule → Basic.
    fireEvent.click(tier('Basic'));
    await waitFor(() => expect(screen.getByText('90 TND')).toBeTruthy());

    // Un module de plus → l'offre passe à Growth (+30).
    const etude = screen.getByText('Étude Surveillée').closest('label') as HTMLLabelElement;
    fireEvent.click(etude.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await waitFor(() => expect(screen.getByText('120 TND')).toBeTruthy());

    // Tous les modules → Pro.
    fireEvent.click(tier('Pro'));
    await waitFor(() => expect(screen.getByText('330 TND')).toBeTruthy());
  });
});

describe('RenewalModule — submitting a request', () => {
  it('sends a renewal when the offer does not change', async () => {
    render(<RenewalModule center={center()} />);
    await waitFor(() => expect(screen.getByText(/Demander le renouvellement/)).toBeTruthy());

    fireEvent.click(screen.getByText(/Demander le renouvellement/));

    await waitFor(() => expect(api.createRenewalRequestApi).toHaveBeenCalled());
    expect(api.createRenewalRequestApi).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'renewal',
      requestedPlan: 'starter',
      billingCycle: 'monthly',
      amount: 90,
    }));
  });

  it('sends an upgrade when a higher offer is picked', async () => {
    render(<RenewalModule center={center()} />);
    await waitFor(() => expect(screen.getByText('Pro')).toBeTruthy());

    fireEvent.click(screen.getByText('Pro'));
    await waitFor(() => expect(screen.getByText(/Demander le changement d/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Demander le changement d/));

    await waitFor(() => expect(api.createRenewalRequestApi).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'upgrade',
      requestedPlan: 'pro',
    })));
  });

  it('reloads the list after a successful submission', async () => {
    render(<RenewalModule center={center()} />);
    await waitFor(() => expect(screen.getByText(/Demander le renouvellement/)).toBeTruthy());
    expect(api.fetchRenewalRequestsApi).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(/Demander le renouvellement/));
    await waitFor(() => expect(api.fetchRenewalRequestsApi).toHaveBeenCalledTimes(2));
  });
});

describe('RenewalModule — requests and history', () => {
  it('lists the center requests with their status', async () => {
    (api.fetchRenewalRequestsApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      requests: [
        request({ id: 'r1', status: 'pending' }),
        request({ id: 'r2', status: 'approved', requestedPlan: 'growth', decisionNote: 'OK' }),
        request({ id: 'r3', status: 'rejected', requestedPlan: 'pro', decisionNote: 'Dossier incomplet' }),
      ],
      history: [],
    });

    render(<RenewalModule center={center()} />);

    await waitFor(() => expect(screen.getByText('Renouvellement · Basic')).toBeTruthy());
    expect(screen.getAllByText('En attente').length).toBeGreaterThan(0);
    expect(screen.getByText('Acceptée')).toBeTruthy();
    expect(screen.getByText('Refusée')).toBeTruthy();
    expect(screen.getByText(/Dossier incomplet/)).toBeTruthy();
  });

  it('shows the plan history of the center', async () => {
    (api.fetchRenewalRequestsApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      requests: [],
      history: [
        { id: 'h1', action: 'plan_set', details: 'Passage à Growth', amount: 165, invoiceNumber: null, createdAt: NOW - 30 * DAY },
      ],
    });

    render(<RenewalModule center={center()} />);

    // Jamais la clé technique brute : un libellé lisible est affiché.
    await waitFor(() => expect(screen.getByText('Plan défini')).toBeTruthy());
    expect(screen.queryByText('plan_set')).toBeNull();
    expect(screen.getByText('Passage à Growth')).toBeTruthy();
    expect(screen.getByText('165 TND')).toBeTruthy();
  });

  it('says so when there is nothing yet', async () => {
    render(<RenewalModule center={center()} />);
    await waitFor(() => expect(screen.getByText('Aucune demande pour le moment.')).toBeTruthy());
    expect(screen.getByText('Aucun historique pour le moment.')).toBeTruthy();
  });
});

describe('RenewalModule — manual refresh only (no auto-refresh)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads once on open and never auto-refreshes (no polling, no focus fetch)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const fetchMock = api.fetchRenewalRequestsApi as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ requests: [request({ status: 'pending' })], history: [] });
    render(<RenewalModule center={center()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Two minutes pass: no background refresh at any cadence.
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Regaining focus / visibility does not fetch either.
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('En attente')).toBeTruthy();
  });

  it('reloads the list only when the refresh button is clicked', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const fetchMock = api.fetchRenewalRequestsApi as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ requests: [request({ status: 'approved', decidedAt: NOW })], history: [] });
    render(<RenewalModule center={center()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText('Acceptée')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /actualiser/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the platform payment methods (virement with RIB) above my requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    (api.fetchRenewalRequestsApi as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ requests: [], history: [] });
    render(<RenewalModule center={center()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(screen.getByText('Moyens de paiement')).toBeTruthy();
    expect(screen.getByText('Attijari Bank')).toBeTruthy();
    expect(screen.getByText('AYADI TAHER')).toBeTruthy();
    expect(screen.getByText('04073158006372281336')).toBeTruthy();
  });
});

describe('RenewalModule — module compatibility with the center type (T023, remark 4)', () => {
  it('never offers study addons to a crèche but keeps an enabled one displayed (R9)', async () => {
    render(
      <RenewalModule
        center={center({ centerType: 'creche', enabledModules: ['scolaire', 'studentTimeSheets', 'finance', 'etude'] })}
        centerType="creche"
      />
    );
    await waitFor(() => expect(screen.getByText('Simulateur de plan')).toBeTruthy());

    // Incompatible study modules are never offered as toggle rows.
    expect(screen.queryByText('Étude Surveillée')).toBeNull();
    expect(screen.queryByText('Cours Particuliers')).toBeNull();
    expect(screen.queryByText('Révision Examens')).toBeNull();
    expect(screen.queryByText('Formations')).toBeNull();

    // Compatible addons remain offered.
    for (const label of ['Cantine & Repas', 'Transport Scolaire', 'Événements & Sorties', 'Personnel & Salaires', 'Activités & Planning', 'Compétences & Skills']) {
      expect(screen.getByText(label), label).toBeTruthy();
    }

    // The already-enabled étude is displayed, never hidden (research R9).
    expect(screen.getByText(/Étude Surveillée — reste actif/)).toBeTruthy();

    // The availability counter reflects the filtered catalog (base 3 + 6 offered).
    expect(screen.getByText(/sur 9 disponibles/)).toBeTruthy();
  });

  it('offers every addon to a formation center (regression)', async () => {
    render(<RenewalModule center={center({ centerType: 'formation' })} centerType="formation" />);
    await waitFor(() => expect(screen.getByText('Simulateur de plan')).toBeTruthy());
    expect(screen.getByText('Étude Surveillée')).toBeTruthy();
    expect(screen.getByText(/sur 13 disponibles/)).toBeTruthy();
  });

  it('offers every addon when the type is unknown/empty (legacy passthrough)', async () => {
    render(<RenewalModule center={center()} />);
    await waitFor(() => expect(screen.getByText('Étude Surveillée')).toBeTruthy());
    expect(screen.getByText(/sur 13 disponibles/)).toBeTruthy();
  });

  it('tier presets never re-introduce incompatible modules for a crèche', async () => {
    render(<RenewalModule center={center({ centerType: 'creche' })} centerType="creche" />);
    await waitFor(() => expect(screen.getByText('Simulateur de plan')).toBeTruthy());

    fireEvent.click(screen.getByText('Pro'));
    await waitFor(() => expect(screen.getByText(/Demander le changement d/)).toBeTruthy());

    // Study modules stay absent from the offer grid even under the Pro preset.
    expect(screen.queryByText('Étude Surveillée')).toBeNull();
    expect(screen.queryByText('Révision Examens')).toBeNull();
  });
});

// ─── Revision C (remark 7): Pro is reachable for every center type ────────
// Uses a LOCAL extended price fixture (adds the two new modules) so the shared
// PRICES fixture and every pre-revision-C assertion above stay untouched.

const PRICES_RC = { ...PRICES, activites: 45, competences: 45 };

const crècheAddonLabels = [
  'Cantine & Repas', 'Transport Scolaire', 'Événements & Sorties',
  'Personnel & Salaires', 'Activités & Planning', 'Compétences & Skills'
];

const CRÈCHE_ADDON_KEYS = ['cantine', 'transport', 'events', 'staff', 'activites', 'competences'];

const LABEL_TO_KEY: Record<string, string> = {
  'Cantine & Repas': 'cantine',
  'Transport Scolaire': 'transport',
  'Événements & Sorties': 'events',
  'Personnel & Salaires': 'staff',
  'Activités & Planning': 'activites',
  'Compétences & Skills': 'competences'
};

describe('RenewalModule — type-aware plan derivation (revision C, remark 7)', () => {
  beforeEach(() => {
    (api.fetchPublicModulePricesApi as ReturnType<typeof vi.fn>).mockResolvedValue(PRICES_RC);
  });

  function tickAddon(label: string) {
    const box = screen.getByText(label).closest('label') as HTMLLabelElement;
    fireEvent.click(box.querySelector('input[type="checkbox"]') as HTMLInputElement);
  }

  it('derives Pro for a crèche ticking every offered addon and submits requestedPlan pro', async () => {
    render(<RenewalModule center={center()} centerType="creche" />);
    await waitFor(() => expect(screen.getByText('Simulateur de plan')).toBeTruthy());

    for (const label of crècheAddonLabels) tickAddon(label);

    // Submit: the derived tier must be Pro — not Growth (remark 7's exact bug).
    await waitFor(() => expect(screen.getByText(/Demander le changement d/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Demander le changement d/));
    await waitFor(() => expect(api.createRenewalRequestApi).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'upgrade',
      requestedPlan: 'pro',
      requestedModules: ['scolaire', 'studentTimeSheets', 'finance', ...CRÈCHE_ADDON_KEYS],
    })));
  });

  it('loads exactly the 9 applicable keys when the Pro tier button is pressed for a crèche', async () => {
    render(<RenewalModule center={center()} centerType="creche" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Pro/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Pro/ }));
    // No study addon ever becomes offered (revision B filter, unchanged)…
    expect(screen.queryByText('Étude Surveillée')).toBeNull();
    // …and every compatible addon is selected (9 applicable = 3 base + 6 addons).
    await waitFor(() => {
      const checked = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));
      expect(checked.length).toBe(9);
    });
  });

  it('keeps the full-catalog Pro for a formation center (regression)', async () => {
    render(<RenewalModule center={center()} centerType="formation" />);
    await waitFor(() => expect(screen.getByText('Simulateur de plan')).toBeTruthy());
    for (const label of [...crècheAddonLabels, 'Étude Surveillée', 'Cours Particuliers', 'Révision Examens', 'Formations']) {
      tickAddon(label);
    }
    await waitFor(() => expect(screen.getByText(/Demander le changement d/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Demander le changement d/));
    await waitFor(() => expect(api.createRenewalRequestApi).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'upgrade',
      requestedPlan: 'pro',
    })));
  });

  it('keeps Basic for a crèche with the base only', async () => {
    render(<RenewalModule center={center()} centerType="creche" />);
    await waitFor(() => expect(screen.getByText('Simulateur de plan')).toBeTruthy());
    expect(screen.getByText(/Demander le renouvellement/)).toBeTruthy(); // not an upgrade
    fireEvent.click(screen.getByText(/Demander le renouvellement/));
    await waitFor(() => expect(api.createRenewalRequestApi).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'renewal',
      requestedPlan: 'starter',
    })));
  });
});
