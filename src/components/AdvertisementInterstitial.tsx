import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { fetchActiveAdvertisementsApi } from '../api';
import type { AdvertisementLocation } from '../types';
import { hasInterstitialPosition } from '../types';

interface InterstitialAd {
  id: string;
  title: string;
  imageUrls: string[];
  linkUrl?: string;
  positions?: string[];
}

/**
 * AdvertisementInterstitial — format « interstitiel » (migration 0032).
 *
 * Overlay responsive plein écran : la créative occupe jusqu'à 92 % de la
 * largeur du viewport (et 70 % de sa hauteur) et se réduit d'elle-même sur
 * mobile comme sur desktop — aucune dimension figée. Fermable via la croix,
 * la touche Échap, un clic sur le fond, ou automatiquement à la fin du
 * compte à rebours.
 *
 * Fréquence : un seul interstitiel par session et par emplacement
 * (sessionStorage). Une annonce fermée ne revient plus.
 */
const OPEN_DELAY_MS = 700;
const AUTO_CLOSE_MS = 8000;

// Une seule ouverture par session et par emplacement (vitrine / centre).
const seenKey = (location: string, centerId?: string) =>
  `ad_interstitial_seen:${location}:${centerId || 'all'}`;
const dismissKey = (id: string) => `ad_interstitial_dismissed:${id}`;

function storageGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; } // mode privé
}
function storageSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* mode privé */ }
}

function dismissedIds(): Set<string> {
  try {
    const out = new Set<string>();
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('ad_interstitial_dismissed:')) {
        out.add(k.slice('ad_interstitial_dismissed:'.length));
      }
    }
    return out;
  } catch { return new Set(); }
}

export default function AdvertisementInterstitial({
  location,
  centerId,
  delayMs = OPEN_DELAY_MS,
  autoCloseMs = AUTO_CLOSE_MS,
  className = '',
}: {
  location: AdvertisementLocation;
  centerId?: string;
  /** Délai avant ouverture (la créative ne bloque pas le premier rendu). */
  delayMs?: number;
  /** Durée d'affichage avant fermeture automatique. */
  autoCloseMs?: number;
  className?: string;
}) {
  const [ad, setAd] = useState<InterstitialAd | null>(null);
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(autoCloseMs);
  const [isPaused, setIsPaused] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Chargement : uniquement les pubs qui portent la position « interstitial ».
  useEffect(() => {
    let mounted = true;
    // Déjà affiché dans cette session → on ne dérange plus le visiteur.
    if (storageGet(seenKey(location, centerId))) return;

    (async () => {
      try {
        const fetched = await fetchActiveAdvertisementsApi(location, centerId);
        if (!mounted) return;
        const gone = dismissedIds();
        const next = (fetched as InterstitialAd[])
          .filter(a => hasInterstitialPosition(a.positions) && a.imageUrls.length > 0 && !gone.has(a.id))
          .slice(0, 1); // un seul interstitiel par visite
        setAd(next[0] || null);
      } catch (err) {
        console.error('Error loading interstitial advertisement:', err);
        if (mounted) setAd(null);
      }
    })();

    return () => { mounted = false; };
  }, [location, centerId]);

  // Ouverture différée : la page se peint d'abord.
  useEffect(() => {
    if (!ad) return;
    const t = setTimeout(() => {
      setRemaining(autoCloseMs);
      setOpen(true);
    }, Math.max(0, delayMs));
    return () => clearTimeout(t);
  }, [ad, delayMs, autoCloseMs]);

  const close = useCallback(() => {
    if (ad) storageSet(dismissKey(ad.id), '1');
    storageSet(seenKey(location, centerId), '1');
    setOpen(false);
  }, [ad, location, centerId]);

  // Compte à rebours (100 ms) — mis en pause au survol.
  useEffect(() => {
    if (!open || isPaused) return;
    const tick = setInterval(() => {
      setRemaining(r => Math.max(0, r - 100));
    }, 100);
    return () => clearInterval(tick);
  }, [open, isPaused]);

  // Fermeture automatique en fin de compte à rebours.
  useEffect(() => {
    if (open && remaining <= 0) close();
  }, [open, remaining, close]);

  // Échap pour fermer + blocage du défilement de l'arrière-plan.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const seconds = Math.ceil(remaining / 1000);
  const progress = autoCloseMs > 0 ? Math.max(0, Math.min(100, (remaining / autoCloseMs) * 100)) : 0;

  const creative = (
    <img
      src={ad?.imageUrls[0]}
      alt={ad?.title || 'Publicité'}
      className="mx-auto max-h-[70vh] w-full object-contain"
    />
  );

  return (
    <AnimatePresence>
      {open && ad && (
        <motion.div
          key="interstitial"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Fond : clic = fermeture */}
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={close} aria-hidden="true" />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Publicité : ${ad.title}`}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            className={`relative z-10 w-full max-w-[min(92vw,720px)] overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-950/40 ${className}`}
          >
            {/* Étiquette + compte à rebours + fermeture */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/95 px-3 py-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Publicité</span>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[10px] font-black tabular-nums text-slate-500">
                  {seconds} s
                </span>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={close}
                  aria-label="Fermer la publicité"
                  className="cursor-pointer rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Visuel — responsive, jamais recadré */}
            <div className="relative w-full bg-slate-100">
              {ad.linkUrl ? (
                <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" onClick={() => storageSet(dismissKey(ad.id), '1')}>
                  {creative}
                </a>
              ) : creative}
            </div>

            {/* Titre + destination */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-600">{ad.title}</p>
              {ad.linkUrl && (
                <a
                  href={ad.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-xl bg-[#257C86]/10 px-3 py-1.5 text-[11px] font-black text-[#257C86] transition hover:bg-[#257C86]/20"
                >
                  En savoir plus
                </a>
              )}
            </div>

            {/* Barre de progression du compte à rebours */}
            <div className="h-[3px] w-full bg-slate-100">
              <div
                className="h-full bg-[#257C86] transition-[width] duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
