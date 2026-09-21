import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './theme-provider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MotionConfig } from 'motion/react';
import { installGlobalHandlers } from './utils/logger';
// Font weights loaded = weights actually used (audit P1): body default 400,
// font-semibold 600 ×86, font-bold 700 ×134, font-black 900 ×222.
// Inter is the Latin fallback for Cairo: same used weights (900 falls back
// to 700). JetBrains Mono is used at default weight only (invoice numbers).
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/900.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './index.css';

installGlobalHandlers();

// NOTE: browser zoom (pinch, Ctrl/Cmd + wheel, Ctrl/Cmd + +/- / 0) must remain
// fully functional — WCAG 1.4.4 Resize Text / 1.4.10 Reflow. The fluid root
// font (clamp() in index.css) absorbs layout changes at larger zoom levels;
// do not re-add zoom-blocking listeners.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </MotionConfig>
  </StrictMode>,
);
