import React, { useEffect, useRef, ReactNode } from 'react';
import { motion } from 'motion/react';

interface BaseModalProps {
  /** Content rendered inside the modal card. */
  children: ReactNode;
  /** Called when the backdrop is clicked or Escape is pressed. */
  onClose: () => void;
  /** Width constraint — defaults to max-w-2xl (large forms). */
  maxWidthClass?: string;
  /** Custom classes appended to the outer fixed wrapper. */
  outerClassName?: string;
  /** Custom classes appended to the inner white card. */
  className?: string;
  /** id of the element naming the dialog (aria-labelledby). */
  labelledBy?: string;
}

/**
 * Standardized modal shell for the platform admin console.
 *
 * Replaces the repeated hand-rolled `fixed inset-0 bg-black/50 …` overlay +
 * `motion.div` card pattern used across modals. Behaviour is the same:
 *   • click on the dark backdrop (not the card) closes the modal
 *   • Escape key closes the modal
 *   • the whole screen is scroll-locked while open (matching existing modals)
 * Styling uses the brand tokens from `@theme` in index.css.
 */
export function BaseModal({
  children,
  onClose,
  maxWidthClass = 'max-w-2xl',
  outerClassName = '',
  className = '',
  labelledBy,
}: BaseModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Keep focus inside the dialog while open (a11y floor).
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // Focus trap: Tab / Shift+Tab cycle within the card, never the page behind.
  useEffect(() => {
    const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const card = cardRef.current;
      if (!card) return;
      const els = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      const active = document.activeElement as HTMLElement | null;
      if (els.length === 0) { e.preventDefault(); card.focus(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      if (!active || !card.contains(active)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Escape closes the modal (matches existing modals' behaviour via a
  // keyboard listener rather than native so it works in the RTL shell).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 ${outerClassName}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        ref={cardRef}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full ${maxWidthClass} max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:pb-0 ${className}`}
      >
        {children}
      </motion.div>
    </div>
  );
}