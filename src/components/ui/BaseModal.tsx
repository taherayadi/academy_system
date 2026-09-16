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
}: BaseModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Keep focus inside the dialog while open (a11y floor).
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    return () => previous?.focus?.();
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
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 ${outerClassName}`}
      role="dialog"
      aria-modal="true"
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
        className={`bg-white rounded-3xl shadow-xl w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto ${className}`}
      >
        {children}
      </motion.div>
    </div>
  );
}