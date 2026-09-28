// Landing-only error reporting. Errors are reported to the console only —
// the backend log-ingest endpoint belongs to the center application and has
// no route in this deployment.

let installed = false;

export const clientLogger = {
  info(message: string) {
    console.info(`[CLIENT INFO] ${message}`);
  },
  warn(message: string) {
    console.warn(`[CLIENT WARN] ${message}`);
  },
  error(message: string, err?: unknown) {
    let extra = '';
    if (err instanceof Error) {
      extra = err.stack || err.message;
    } else if (err !== undefined) {
      extra = String(err);
    }
    console.error(`[CLIENT ERROR] ${message}${extra ? '\n' + extra : ''}`);
  }
};

export function installGlobalHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.onerror = (message, source, lineno, colno, error) => {
    const loc = source && lineno ? ` at ${source}:${lineno}:${colno}` : '';
    clientLogger.error(`Uncaught error: ${message}${loc}`, error);
  };

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    clientLogger.error('Unhandled promise rejection', reason);
  });
}
