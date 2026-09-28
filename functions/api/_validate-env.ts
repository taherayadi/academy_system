/**
 * Environment variable validation helpers.
 *
 * NOTE ON THIS REPO'S SEMANTICS (functions/api/_lib.ts Env interface):
 *   - DB                       → D1 binding from wrangler.toml, always present.
 *   - IMAGEKIT_PRIVATE_KEY     → required ONLY by the upload-logo route; that route
 *                                already fails gracefully (500 + clear message) when missing.
 *   - PUBNUB_PUBLISH/SUBSCRIBE/SECRET_KEY → OPTIONAL by design; _pubnub.ts falls back
 *                                to polling when the publish keys are absent.
 *
 * Because these keys are either a D1 binding or optional-with-graceful-fallback,
 * a *global* startup check that throws would harm reliability (e.g. blocking every
 * route because one feature's key is unset). Therefore:
 *   1. Use validateFeatureEnv() only at the entry of the route that requires the key.
 *   2. Do NOT wire validateEnv() into shared middleware.
 */

import { Env } from './_lib';

export function validateEnv(env: Env): void {
  const required: Array<keyof Env> = [
    // Only keys that MUST exist for the app to serve at all belong here.
    // DB is a D1 binding, not an env var, so it is not listed.
  ];

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

/** Validate the key needed by the upload-logo route before using ImageKit. */
export function requireImageKitKey(env: Env): void {
  if (!env.IMAGEKIT_PRIVATE_KEY) {
    throw new Error('Missing required environment variable: IMAGEKIT_PRIVATE_KEY');
  }
}

/** Validate PubNub keys for a route that genuinely must publish (not optional). */
export function requirePubNubKeys(env: Env): void {
  if (!env.PUBNUB_PUBLISH_KEY || !env.PUBNUB_SUBSCRIBE_KEY || !env.PUBNUB_SECRET_KEY) {
    throw new Error('PubNub keys are not configured (PUBNUB_PUBLISH_KEY / PUBNUB_SUBSCRIBE_KEY / PUBNUB_SECRET_KEY).');
  }
}