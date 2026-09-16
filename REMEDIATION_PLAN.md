# Remediation Plan: Medium-Priority Issues from Code Review

## Overview
This plan addresses the remaining MEDIUM-severity findings from the code review that were not fixed in the initial pass.

## Issues to Address

### 1. SQL Injection via String Interpolation in Module Prices Query
**Location**: `functions/api/center-plans.ts:75`

**Current Code**:
```typescript
const placeholders = args.modules.map(() => '?').join(',');
const { results } = await db.prepare(
  `SELECT module_key, price FROM module_prices WHERE school_year = ? AND module_key IN (${placeholders})`
).bind(currentSchoolYear(), ...args.modules).all<any>();
```

**Risk**: While upstream validation exists (`normalizeEnabledModules`), dynamic SQL construction creates theoretical risk if validation is bypassed.

**Fix**: Add explicit validation on modules array length before constructing query:
```typescript
// Defensive validation: ensure modules array is reasonable size
if (args.modules.length === 0 || args.modules.length > 20) {
  return 0; // or throw appropriate error
}
const placeholders = args.modules.map(() => '?').join(',');
const { results } = await db.prepare(
  `SELECT module_key, price FROM module_prices WHERE school_year = ? AND module_key IN (${placeholders})`
).bind(currentSchoolYear(), ...args.modules).all<any>();
```

### 2. Missing Input Validation on Numeric Plan Parameters
**Location**: `functions/api/center-plans.ts:219-222`

**Current Code**:
```typescript
const days = Math.floor(Number(body.days));
if (!Number.isFinite(days) || days < 1 || days > 3650) {
  return json({ error: 'Nombre de jours invalide (1 à 3650).' }, 400);
}
```

**Risk**: Validation occurs after coercion, though current implementation is actually safe.

**Fix**: Validate before coercion for clarity and consistency:
```typescript
const rawDays = Number(body.days);
if (!Number.isFinite(rawDays) || rawDays < 1 || rawDays > 3650) {
  return json({ error: 'Nombre de jours invalide (1 à 3650).' }, 400);
}
const days = Math.floor(rawDays);
```

### 3. Unbounded Query in Billing Summary MRR Calculation
**Location**: `functions/api/platform-billing.ts:76-81`

**Current Code**:
```typescript
env.DB.prepare(`
  SELECT center_id, amount, period_start, period_end FROM center_invoices
  WHERE status = 'paid'
  ORDER BY center_id, period_end DESC
  LIMIT 1000
`).all<any>()
```

**Risk**: With >1000 active centers, MRR calculation could undercount revenue by excluding centers beyond the 1000-row limit.

**Fix**: Use subquery to get latest paid invoice per center (more accurate):
```typescript
env.DB.prepare(`
  SELECT center_id, amount, period_start, period_end FROM center_invoices
  WHERE status = 'paid'
    AND (center_id, period_end) IN (
      SELECT center_id, MAX(period_end) 
      FROM center_invoices 
      WHERE status = 'paid' 
      GROUP BY center_id
    )
`).all<any>()
```

Alternative: Increase limit with monitoring if subquery approach is not preferred.

### 4. Missing Error Boundary for Unhandled Promise Rejections
**Location**: `src/App.tsx:177-187`

**Current Code**:
```typescript
useEffect(() => {
  const handler = (event: PromiseRejectionEvent | Event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    if (reason instanceof UnauthorizedError) {
      clearLocalSession();
      setCurrentUser(null);
    }
  };
  window.addEventListener('unhandledrejection', handler as EventListener);
  return () => window.removeEventListener('unhandledrejection', handler as EventListener);
}, []);
```

**Risk**: Global unhandledrejection handler only catches promises without .catch(), missing some error cases.

**Fix**: Add documentation comment and consider React Error Boundary for rendering errors:
```typescript
useEffect(() => {
  // Fallback handler for unhandled promise rejections that result in 401
  // Most API calls properly catch and handle UnauthorizedError, this catches
  // cases where rejection was not handled (e.g., forgot .catch())
  const handler = (event: PromiseRejectionEvent | Event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    if (reason instanceof UnauthorizedError) {
      clearLocalSession();
      setCurrentUser(null);
    }
  };
  window.addEventListener('unhandledrejection', handler as EventListener);
  return () => window.removeEventListener('unhandledrejection', handler as EventListener);
}, []);
```

### 5. PubNub Client Silent Fallback in Development
**Location**: `src/realtime/pubnubClient.ts:34-37, 213-218`

**Current Code**:
```typescript
export function pubnubSubscribeKey(): string {
  const value = import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY;
  return typeof value === 'string' ? value.trim() : '';
}

// Later in startClient():
const subscribeKey = pubnubSubscribeKey();
if (!subscribeKey) {
  setState('fallback');
  return;
}
```

**Risk**: Missing development warning makes debugging difficult when keys are misconfigured.

**Fix**: Add one-time development warning:
```typescript
export function pubnubSubscribeKey(): string {
  const value = import.meta.env.VITE_PUBNUB_SUBSCRIBE_KEY;
  return typeof value === 'string' ? value.trim() : '';
}

// Later in startClient():
const subscribeKey = pubnubSubscribeKey();
if (!subscribeKey) {
  if (import.meta.env.DEV) {
    console.info('[realtime] PubNub keys not configured — using polling fallback.');
  }
  setState('fallback');
  return;
}
```

## Implementation Order

1. Fix #1: Module Prices SQL injection defense (center-plans.ts)
2. Fix #2: Plan parameter validation timing (center-plans.ts)  
3. Fix #3: MRR query optimization (platform-billing.ts)
4. Fix #4: Error handler documentation (App.tsx)
5. Fix #5: PubNub dev warning (pubnubClient.ts)

## Validation After Each Fix
After each fix, run:
```bash
npm run lint
npm test
```

## Final Validation
After all fixes:
```bash
npm run lint
npm test
npm run build
```

## Notes
- All fixes maintain backward compatibility
- No changes to public APIs or behavior
- Focus on defensive improvements and code clarity
- No user-facing changes expected