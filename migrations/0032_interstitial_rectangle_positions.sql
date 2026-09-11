-- Migration 0032 : formats d'annonces responsives.
--
-- Remplace les formats IAB figés (leaderboard 728×90, medium rectangle
-- 300×250, bandeau mobile 320×50, gratte-ciel 160×600) par deux formats
-- responsives :
--   rectangle    → bloc fluide jusqu'à 480 px de large (bien plus grand que
--                  l'ancien 300×250), dans le flux des pages
--   interstitial → overlay plein écran fermable, sur mobile comme sur desktop
--
-- Les annonces existantes sont réécrites vers leur format équivalent ; les
-- doublons créés par la fusion (ex. leaderboard + rectangle → rectangle,
-- rectangle) sont dédupliqués côté service par _adPositions.ts.
-- Réexécutable : la clause WHERE ne correspond plus rien une fois migré.
UPDATE platform_advertisements
SET positions = REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(positions, 'skyscraper_160x600', 'interstitial'),
          'medium_rectangle_300x250', 'rectangle'),
        'mobile_leaderboard_320x50', 'rectangle'),
      'leaderboard_728x90', 'rectangle')
WHERE positions LIKE '%leaderboard_728x90%'
   OR positions LIKE '%medium_rectangle_300x250%'
   OR positions LIKE '%mobile_leaderboard_320x50%'
   OR positions LIKE '%skyscraper_160x600%';
