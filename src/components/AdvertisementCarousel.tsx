import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchActiveAdvertisementsApi } from '../api';
import type { AdvertisementLocation } from '../types';

interface AdvertisementCarouselProps {
  location: AdvertisementLocation;
  centerId?: string;
  className?: string;
}

interface Advertisement {
  id: string;
  title: string;
  imageUrls: string[];
  linkUrl?: string;
  priority: number;
}

export default function AdvertisementCarousel({ location, centerId, className = '' }: AdvertisementCarouselProps) {
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
        if (mounted && fetchedAds.length > 0) {
          setAds(fetchedAds);
        }
      } catch (err) {
        console.error('Error loading advertisements:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAds();
    return () => { mounted = false; };
  }, [location, centerId]);

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
      className={`relative w-full overflow-hidden rounded-lg bg-gray-100 shadow-md ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Image Display */}
      <div className="relative aspect-[16/9] w-full">
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

        {/* Dot Indicators (only if multiple images) */}
        {hasMultipleImages && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {currentAd.imageUrls.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goToImage(index);
                }}
                className={`h-2 w-2 rounded-full transition-all ${
                  index === currentImageIndex
                    ? 'w-6 bg-white'
                    : 'bg-white/50 hover:bg-white/75'
                }`}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
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
