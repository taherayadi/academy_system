import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTES } from './_middleware';
import { APPLICATION, isDeploymentRole } from './_deployment';

const root = resolve(import.meta.dirname, '../..');
const source = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('center and landing repository architecture', () => {
  it('is permanently a center application, never a request-selected mode', () => {
    expect(APPLICATION).toBe('center');
    for (const role of ['admin', 'super_admin', 'restricted_admin']) expect(isDeploymentRole(role)).toBe(true);
    for (const role of ['platform_super_admin', 'unknown', '', null]) expect(isDeploymentRole(role)).toBe(false);
  });

  it('does not contain platform screens or management handlers', () => {
    for (const file of [
      'src/components/PlatformAdminDashboard.tsx',
      'src/components/RenewalReviewModal.tsx',
      'src/utils/planChange.ts',
      'functions/api/platform-billing.ts',
      'functions/api/platform-advertisements.ts',
      'functions/api/platform-upload-logo.ts',
      'functions/api/center-plans.ts',
      'functions/api/planLogic.ts',
      'functions/api/_planHistory.ts',
    ]) expect(existsSync(resolve(root, file)), file).toBe(false);
  });

  it('does not import admin screens or call management APIs from the browser', () => {
    const app = source('src/App.tsx');
    expect(app).toContain("import LandingPage from './components/LandingPage'");
    expect(app).toContain("import Dashboard from './components/Dashboard'");
    for (const marker of ['PlatformAdminDashboard', 'RenewalReviewModal', 'platformCenters', 'platformFinance']) expect(app).not.toContain(marker);
    const api = source('src/api.ts');
    for (const marker of ['/platform-billing', '/platform-advertisements', '/platform-upload-logo', '/center-plans', 'decideRenewalRequestApi', 'createCenterApi', 'deleteCenterApi']) expect(api).not.toContain(marker);
  });

  it('retains public landing and center-only subscription operations', () => {
    expect(ROUTES['/api/public-pricing']).toEqual(['GET']);
    expect(ROUTES['/api/advertisements/active']).toEqual(['GET']);
    expect(ROUTES['/api/demo-requests']).toEqual(['POST']);
    expect(ROUTES['/api/centers']).toEqual(['GET']);
    expect(ROUTES['/api/renewal-requests']).toEqual(['GET', 'POST']);
    for (const route of Object.keys(ROUTES)) {
      expect(route).not.toMatch(/^\/api\/platform-/);
      expect(route).not.toBe('/api/center-plans');
    }
  });
});
