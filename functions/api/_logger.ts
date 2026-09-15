/**
 * Server-side error logger for platform API handlers.
 *
 * Logs context + sanitized message only — never raw Error objects,
 * stack traces, or internal file paths. Credential-looking fragments
 * (password=…, Bearer …) are masked before logging as defense-in-depth,
 * even though handlers only pass context strings today. All output is
 * prefixed `[platform]` for easy filtering in Cloudflare Workers logs.
 */
export function logError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const sanitized = msg
    .replace(/(password|passwd|pwd)\s*[=:]\s*\S+/gi, '$1=***')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***');
  console.error(`[platform] ${context}: ${sanitized}`);
}
