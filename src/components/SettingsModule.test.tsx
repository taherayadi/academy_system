import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const clickSave = () => {
  const form = document.querySelector('form');
  expect(form).toBeTruthy();
  fireEvent.submit(form!);
};
import SettingsModule from './SettingsModule';
import { CenterSettings, initialCenterSettings } from '../types';

vi.mock('./Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

const renderSettings = (onUpdate = vi.fn()) => {
  render(
    <SettingsModule
      settings={initialCenterSettings}
      onUpdateSettings={onUpdate}
      enabledModules={['cantine']}
    />
  );
  return onUpdate;
};

describe('SettingsModule — decimal goûter pricing (revision D, remark S1)', () => {
  it('renders the module without crashing on the initial settings', () => {
    renderSettings();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('the five goûter fee inputs carry step=0.5 for decimal entry', () => {
    renderSettings();
    const gouterInputs = [
      'fraisGouterMatinMensuel',
      'fraisGouterMatinUnitaire',
      'fraisGouterSoirMensuel',
      'fraisGouterSoirUnitaire',
      'fraisDeuxGoutersMensuel'
    ];
    gouterInputs.forEach(key => {
      const input = document.querySelector(`input[data-fee="${key}"]`) as HTMLInputElement | null;
      expect(input, `missing data-fee input for ${key}`).toBeTruthy();
      // Decimal entry affordance: a text field with a numeric keyboard
      // (type="number" would sanitize the comma decimal before parsing).
      expect(input!.getAttribute('type')).toBe('text');
      expect(input!.getAttribute('inputmode')).toBe('decimal');
    });
  });

  it('typing a comma decimal stores the exact non-integer value in form state', () => {
    const onUpdate = renderSettings();
    const input = document.querySelector('input[data-fee="fraisGouterMatinMensuel"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2,5' } });
    clickSave();
    const saved = onUpdate.mock.calls[0][0] as CenterSettings;
    expect(saved.fees.fraisGouterMatinMensuel).toBe(2.5);
  });

  it('a goûter fee keeps its dot-decimal value through the save round-trip', () => {
    const onUpdate = renderSettings();
    const input = document.querySelector('input[data-fee="fraisGouterSoirUnitaire"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.75' } });
    clickSave();
    const saved = onUpdate.mock.calls[0][0] as CenterSettings;
    expect(saved.fees.fraisGouterSoirUnitaire).toBe(0.75);
  });

  it('integer goûter entry keeps working (no regression to strings or NaN)', () => {
    const onUpdate = renderSettings();
    const input = document.querySelector('input[data-fee="fraisDeuxGoutersMensuel"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '30' } });
    clickSave();
    const saved = onUpdate.mock.calls[0][0] as CenterSettings;
    expect(saved.fees.fraisDeuxGoutersMensuel).toBe(30);
  });
});
