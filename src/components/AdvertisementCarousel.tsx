import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchActiveAdvertisementsApi } from '../api';
import type { AdvertisementLocation, AdPositionId } from '../types';

interface AdvertisementCarouselProps {
  location: AdvertisementLocation;
  centerId?: string;
  className?: string;
  /**
   * Rend le format « rectangle » au lieu du carrousel 16:9. Les pubs SANS
   * position alimentent le carrousel standard ; les pubs positionnées ne
   * vivent que dans leurs créneaux (interstitiel → overlay plein écran,
   * cf. AdvertisementInterstitial).
   */
  format?: AdPositionId;
}

/**
 * Le rectangle est fluide et responsive, sans aucune dimension figée :
 *  • largeur  — toute la place disponible, plafonnée à 1100 px (elle remplit
 *               donc la colonne de contenu sur desktop, bien plus large que
 *               l'ancien 300×250) ;
 *  • hauteur  — clamp(220px, 30vw, 420px) : ~220 px sur mobile puis elle
 *               grandit avec la fenêtre jusqu'à 420 px.
 * Le format s'étire donc en rectangle large sur grand écran et reste compact
 * sur téléphone, sans saut de mise en page.
 */
const AD_FORMAT_PRESENTATION: Record<string, { container: string; frame: string }> = {
  rectangle: { container: 'mx-auto w-full max-w-[1100px]', frame: 'h-[clamp(220px,30vw,420px)]' },
};

interface Advertisement {
  id: string;
  title: string;
  imageUrls: string[];
  linkUrl?: string;
  priority: number;
  positions?: string[];
}

export default function AdvertisementCarousel({ location, centerId, className = '', format }: AdvertisementCarouselProps) {
  const presentation = (format && AD_FORMAT_PRESENTATION[format]) || null;
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const currentAd = ads[currentAdIndex];
  const hasMultipleImages = currentAd && currentAd.imageUrls.length > 1;

  // Fetch active advertisements
  useEffect(() => {
    let mounted = true;

    async function loadAds() {
      try {
        setLoading(true);
        const fetchedAds = await fetchActiveAdvertisementsApi(location, centerId);
        // Créneaux formatés : uniquement les pubs qui portent cette position.
        // Carrousel standard : uniquement les pubs SANS position.
        const carouselAds = fetchedAds.filter((ad: { positions?: string[] }) => {
          const positions = ad.positions || [];
          return format ? positions.includes(format) : positions.length === 0;
        });
        if (mounted) {
          setAds(carouselAds);
        }
      } catch (err) {
        console.error('Error loading advertisements:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAds();
    return () => { mounted = false; };
  }, [location, centerId, format]);

  // Auto-advance carousel every 5 seconds (if not paused)
  useEffect(() => {
    if (!currentAd || isPaused || !hasMultipleImages) return;

    const interval = setInterval(() => {
      setCurrentImageIndex(prev => (prev + 1) % currentAd.imageUrls.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [currentAd, isPaused, hasMultipleImages]);

  const goToPrevImage = useCallback(() => {
    if (!currentAd) return;
    setCurrentImageIndex(prev => (prev - 1 + currentAd.imageUrls.length) % currentAd.imageUrls.length);
  }, [currentAd]);

  const goToNextImage = useCallback(() => {
    if (!currentAd) return;
    setCurrentImageIndex(prev => (prev + 1) % currentAd.imageUrls.length);
  }, [currentAd]);

  const goToImage = useCallback((index: number) => {
    setCurrentImageIndex(index);
  }, []);

  // Don't render anything if loading or no ads
  if (loading || !currentAd || currentAd.imageUrls.length === 0) {
    return null;
  }

  const carouselContent = (
    <div
      className={`group relative overflow-hidden rounded-lg bg-gray-100 shadow-md ${presentation ? presentation.container : 'w-full'} ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Image Display */}
      <div className={`relative w-full ${presentation ? presentation.frame : 'aspect-[16/9]'}`}>
        <AnimatePresence mode="wait">
          <motion.img
            key={`${currentAd.id}-${currentImageIndex}`}
            src={currentAd.imageUrls[currentImageIndex]}
            alt={currentAd.title}
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        </AnimatePresence>

        {/* Navigation Buttons (only if multiple images) */}
        {hasMultipleImages && (
          <>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goToPrevImage();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goToNextImage();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Indicateurs animés (uniquement si plusieurs images) */}
        {hasMultipleImages && (
          <>
            {/* Compteur 2 / 4 — pulse à chaque changement d'image */}
            <div className="absolute top-3 right-3 overflow-hidden rounded-full bg-black/45 backdrop-blur-sm">
              <motion.span
                key={`${currentAd.id}-${currentImageIndex}`}
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="block px-2.5 py-0.5 text-[11px] font-black tabular-nums text-white"
              >
                {currentImageIndex + 1} / {currentAd.imageUrls.length}
              </motion.span>
            </div>

            {/* Points + pastille active animée (largeur) */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
              {currentAd.imageUrls.map((_, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    goToImage(index);
                  }}
                  aria-label={`Go to image ${index + 1}`}
                  className="h-2 rounded-full p-0 transition-all duration-300 hover:bg-white/90"
                >
                  <motion.span
                    className={`block h-2 rounded-full ${
                      index === currentImageIndex ? 'bg-white' : 'bg-white/50'
                    }`}
                    animate={{ width: index === currentImageIndex ? 24 : 8 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  />
                </button>
              ))}
            </div>

            {/* Barre de progression du défilement auto (5 s) — gèle en survol */}
            <motion.div
              key={`${currentAd.id}-${currentImageIndex}-bar`}
              className="absolute bottom-0 left-0 h-[3px] bg-white/80"
              initial={{ width: '0%' }}
              animate={isPaused ? { width: '60%' } : { width: '100%' }}
              transition={{ duration: isPaused ? 0.2 : 5, ease: 'linear' }}
            />
          </>
        )}
      </div>
    </div>
  );

  // Wrap in link if linkUrl exists
  if (currentAd.linkUrl) {
    return (
      <a
        href={currentAd.linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        {carouselContent}
      </a>
    );
  }

  return carouselContent;
}
