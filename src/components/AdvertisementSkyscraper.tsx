import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { fetchActiveAdvertisementsApi } from '../api';
import type { AdvertisementLocation } from '../types';
import { hasSkyscraperPosition } from '../types';

interface SkyscraperAd {
  id: string;
  title: string;
  imageUrls: string[];
  linkUrl?: string;
  positions?: string[];
}

/**
 * AdvertisementSkyscraper — placement 120×600 / 160×600.
 *
 * Fixed vertical banner pinned to the side margin of the viewport
 * (vitrine comme tableau de bord centre), visible on large screens only —
 * exactly what the « Gratte-ciel » position means. A skyscraper-only ad is
 * shown here and never in the carousel; ads cumulating it with other
 * positions appear in both. Close = dismissed for the whole browser
 * session (sessionStorage), and several skyscraper ads auto-rotate every
 * 5 s with dots.
 */
const ROTATE_MS = 5000;
const dismissKey = (id: string) => `ad_skyscraper_dismissed:${id}`;

function dismissedIds(): Set<string> {
  try {
    const out = new Set<string>();
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('ad_skyscraper_dismissed:')) out.add(k.slice('ad_skyscraper_dismissed:'.length));
    }
    return out;
  } catch { return new Set(); }
}

export default function AdvertisementSkyscraper({ location, centerId, side = 'right', className = '' }: {
  location: AdvertisementLocation;
  centerId?: string;
  side?: 'left' | 'right';
  className?: string;
}) {
  const [ads, setAds] = useState<SkyscraperAd[]>([]);
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const reload = useCallback(() => {
    const gone = dismissedIds();
    let request: Promise<Awaited<ReturnType<typeof fetchActiveAdvertisementsApi>>>;
    try {
      request = fetchActiveAdvertisementsApi(location, centerId);
    } catch { setAds([]); return; }
    request
      .then(fetched => {
        // L'API renvoie déjà les annonces triées par priorité.
        const sky = (fetched as SkyscraperAd[])
          .filter(ad => hasSkyscraperPosition(ad.positions) && !gone.has(ad.id))
          .slice(0, 5);
        setAds(sky);
        setIndex(i => Math.min(i, Math.max(0, sky.length - 1)));
      })
      .catch(() => setAds([]));
  }, [location, centerId]);

  useEffect(() => { reload(); }, [reload]);

  // Auto-rotate between stacked skyscraper ads (pause on hover).
  useEffect(() => {
    if (ads.length < 2 || isPaused) return;
    const t = setInterval(() => setIndex(i => (i + 1) % ads.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [ads.length, isPaused]);

  const current = ads[index];
  if (!current || current.imageUrls.length === 0) return null;

  const dismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try { sessionStorage.setItem(dismissKey(current.id), '1'); } catch { /* private mode */ }
    const next = ads.filter(a => a.id !== current.id);
    setAds(next);
    setIndex(Math.min(index, Math.max(0, next.length - 1)));
  };

  const banner = (
    <motion.aside
      initial={{ opacity: 0, x: side === 'right' ? 48 : -48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: side === 'right' ? 48 : -48 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`fixed ${side === 'right' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 z-40 hidden xl:block w-40 ${className}`}
      aria-label={`Publicité : ${current.title}`}
    >
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
        {/* Étiquette + fermeture */}
        <div className="flex items-center justify-between px-2 py-1 bg-slate-50/95 border-b border-slate-100">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Publicité</span>
          <button onClick={dismiss} aria-label="Fermer la publicité"
            className="p-1 -mr-0.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition cursor-pointer">
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Visuel — ratio skyscraper, hauteur plafonnée au viewport */}
        <div className="relative w-full h-[min(560px,72vh)] bg-slate-100">
          <AnimatePresence mode="wait">
            <motion.img
              key={`${current.id}-sky`}
              src={current.imageUrls[0]}
              alt={current.title}
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            />
          </AnimatePresence>
        </div>

        {/* Titre + rotation */}
        <div className="px-2 py-1.5 bg-white/95 border-t border-slate-100 flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[10px] font-bold text-slate-600">{current.title}</p>
          {ads.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              {ads.map((ad, i) => (
                <button key={ad.id} onClick={() => setIndex(i)} aria-label={`Publicité ${i + 1}`}
                  className={`rounded-full transition-all duration-300 cursor-pointer ${i === index ? 'w-3 h-1.5 bg-[#257C86]' : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'}`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );

  if (current.linkUrl) {
    return (
      <a href={current.linkUrl} target="_blank" rel="noopener noreferrer" className="hidden xl:block">
        {banner}
      </a>
    );
  }
  return banner;
}
