import React from 'react';

import LandingPage from './components/LandingPage';
import AdvertisementCarousel from './components/AdvertisementCarousel';
import AdvertisementInterstitial from './components/AdvertisementInterstitial';

/**
 * Public landing application — product information, public pricing,
 * advertisements and demo/trial request submission only.
 *
 * The center workspace lives in its own application; nothing authenticated
 * belongs here.
 */
export default function App() {
  return (
    <>
      <LandingPage
        onOpenLogin={() => {
          // The center workspace (login) is served by the other application.
          window.open('https://app.edusphere.com.tn', '_self');
        }}
      />
      {/* Public ad surfaces — same placement contract as the vitrine. */}
      <AdvertisementCarousel location="landing_page" />
      <AdvertisementInterstitial location="landing_page" />
    </>
  );
}
