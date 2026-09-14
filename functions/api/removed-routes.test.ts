import { describe, it, expect } from 'vitest';
import { onRequest as catchAll, isRemovedCenterRoute, REMOVED_CENTER_ROUTES } from './[[path]]';
import * as demoRequests from './demo-requests';
import * as centers from './centers';
import * as centerPlans from './center-plans';
import * as platformBilling from './platform-billing';
import * as lib from './_lib';

/**
 * Availability contract for the SaaS/center split:
 *   • removed operational routes answer with a controlled JSON 404 (never a
 *     crash, never the SPA HTML, never center business logic);
 *   • endpoints that the center application owns keep exactly the method set
 *     the platform needs — submissions are NOT exported, so Pages Functions
 *     answers 405 before any handler could run.
 */

describe('catch-all /api/* — controlled 404', () => {
  it.each([
    '/api/students', '/api/staff', '/api/meals', '/api/state', '/api/settings',
    '/api/courses', '/api/formations', '/api/expenses', '/api/slots',
    '/api/student-attendance', '/api/timesheets', '/api/sessions',
    '/api/revision-seances', '/api/external-students', '/api/meal-forfait-closures',
    '/api/upload-logo', '/api/center-logo', '/api/public-pricing',
    '/api/advertisements/active', '/api/nonexistent', '/api/',
  ])('%s → 404 JSON ROUTE_REMOVED for any method', async (path) => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await catchAll({ request: new Request(`https://x.test${path}`, { method }), env: { DB: {} }, next: async () => new Response('leaked') } as any);
      expect(res.status).toBe(404);
      const data: any = await res.json();
      expect(data.code).toBe('ROUTE_REMOVED');
    }
  });

  it('never delegates to a downstream handler (no next() fallthrough)', async () => {
    let nextCalled = false;
    await catchAll({
      request: new Request('https://x.test/api/students'),
      env: { DB: {} },
      next: async () => { nextCalled = true; return new Response('leaked'); },
    } as any);
    expect(nextCalled).toBe(false);
  });
});

describe('isRemovedCenterRoute', () => {
  it('matches the removed center surface including subpaths and query strings', () => {
    for (const route of REMOVED_CENTER_ROUTES) {
      expect(isRemovedCenterRoute(route)).toBe(true);
      expect(isRemovedCenterRoute(route + '/123')).toBe(true);
      expect(isRemovedCenterRoute(route + '?id=1')).toBe(true);
    }
    expect(REMOVED_CENTER_ROUTES).toContain('/api/students');
    expect(REMOVED_CENTER_ROUTES).toContain('/api/state');
  });

  it('does NOT match platform routes (they are served by real handlers)', () => {
    for (const kept of ['/api/centers', '/api/center-plans', '/api/platform-billing', '/api/demo-requests', '/api/auth/login']) {
      expect(isRemovedCenterRoute(kept)).toBe(false);
    }
  });

  it('does not prefix-match loosely (/api/students vs /api/students-archive-x)', () => {
    expect(isRemovedCenterRoute('/api/students-archive')).toBe(false);
  });
});

describe('method surface of kept routes — submissions removed', () => {
  it('demo-requests has NO POST export (public demo submission is center-app only)', () => {
    expect((demoRequests as any).onRequestPost).toBeUndefined();
    expect((demoRequests as any).onRequestGet).toBeTypeOf('function');
    expect((demoRequests as any).onRequestPatch).toBeTypeOf('function');
    expect((demoRequests as any).onRequestDelete).toBeTypeOf('function');
  });

  it('centers keeps the full lifecycle surface (list/create/edit/delete)', () => {
    for (const m of ['onRequestGet', 'onRequestPost', 'onRequestPatch', 'onRequestDelete']) {
      expect((centers as any)[m]).toBeTypeOf('function');
    }
  });

  it('center-plans exposes GET + POST only (platform plan engine)', () => {
    expect((centerPlans as any).onRequestGet).toBeTypeOf('function');
    expect((centerPlans as any).onRequestPost).toBeTypeOf('function');
    expect((centerPlans as any).onRequestDelete).toBeUndefined();
  });

  it('platform-billing exposes GET + POST + PATCH + DELETE (invoices + prices)', () => {
    for (const m of ['onRequestGet', 'onRequestPost', 'onRequestPatch', 'onRequestDelete']) {
      expect((platformBilling as any)[m]).toBeTypeOf('function');
    }
  });
});

describe('_lib — the center session plumbing is gone from this app', () => {
  it('exports the platform session API, not the legacy one', () => {
    expect(typeof lib.validateSession).toBe('function');
    expect(typeof lib.createPlatformSession).toBe('function');
    expect(typeof lib.ensurePlatformSessionsTable).toBe('function');
    expect(lib.PLATFORM_SESSION_COOKIE).toBe('tc_platform_session');
    expect(lib.PLATFORM_ROLE).toBe('platform_super_admin');
    // The legacy center session helpers must not exist in this codebase.
    expect((lib as any).ensureSessionsTable).toBeUndefined();
    expect((lib as any).getContextCenterId).toBeUndefined();
    // …and none of the center data-layer functions survived here.
    for (const gone of [
      'readStudents', 'writeStudents', 'readStaff', 'writeStaff',
      'readState', 'writeState', 'readSettings', 'writeSettings',
      'readMealPlans', 'readExpenses', 'writeExpenses',
      'readSlots', 'writeSlots', 'readSessions', 'writeSessions',
    ]) {
      expect((lib as any)[gone]).toBeUndefined();
    }
  });
});
