const API_BASE = '/api';

let enabled = true;

function send(level: 'INFO' | 'WARN' | 'ERROR', message: string, extra?: string) {
  if (!enabled) return;
  try {
    fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ level, message, extra })
    }).catch(() => {});
  } catch {
    // logging must never crash the app
  }
}

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
    send('ERROR', message, extra);
  },
  disable() { enabled = false; },
  enable() { enabled = true; }
};

let installed = false;

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
