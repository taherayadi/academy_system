/**
 * Catch-all for every /api/* path that is NOT served by this application.
 *
 * Cloudflare Pages resolves more specific route files first, so this file
 * only sees paths without a handler: the center-application routes removed by
 * the SaaS/center split (/api/students, /api/meals, /api/state, …), and any
 * probe. Two behaviors:
 *
 *   • Known removed center routes  → 404 { code: 'ROUTE_REMOVED' } with a
 *     message pointing at the center application (no HTML SPA fallback).
 *   • Anything else under /api/*    → the same controlled 404 — this backend
 *     never leaks a stack, never runs center logic, and never falls through
 *     to the SPA bundle.
 *
 * Unsupported methods on EXISTING routes are already answered by Pages with
 * its own 405 (e.g. POST /api/demo-requests has no handler anymore because
 * public demo submission belongs to the center app's deployment).
 */
import { removedRouteResponse } from './_lib';

/** Route prefixes that used to exist in the combined app and were removed. */
export const REMOVED_CENTER_ROUTES: string[] = [
  '/api/state',
  '/api/settings',
  '/api/students',
  '/api/staff',
  '/api/slots',
  '/api/sessions',
  '/api/courses',
  '/api/external-students',
  '/api/revision-seances',
  '/api/formations',
  '/api/meals',
  '/api/meal-forfait-closures',
  '/api/expenses',
  '/api/timesheets',
  '/api/student-time-sheets',
  '/api/student-timesheets',
  '/api/student-attendance',
  '/api/upload-logo',
  '/api/center-logo',
  '/api/public-pricing',
  '/api/advertisements',
];

/** True when the path is one of the removed center-application routes. */
export function isRemovedCenterRoute(pathname: string): boolean {
  // Accept a raw pathname or a full request path: strip query/fragment.
  const path = pathname.split('?')[0].split('#')[0];
  return REMOVED_CENTER_ROUTES.some(
    (route) => path === route || path.startsWith(route + '/')
  );
}

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  // Unknown OR removed — the SaaS console answers with a controlled JSON 404
  // either way. isRemovedCenterRoute is exported for tests / future hints.
  void isRemovedCenterRoute;
  return removedRouteResponse();
};
