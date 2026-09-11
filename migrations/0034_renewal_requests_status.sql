-- Migration 0034 : statut du centre au moment de la demande de renouvellement.
-- La demande enregistrait déjà l'offre actuelle (current_plan) mais pas où en
-- était le centre (essai / actif / suspendu / expiré) : la plateforme ne
-- pouvait pas distinguer « centre en essai qui souscrit » d'un « renouvellement
-- d'abonnement en cours ».
ALTER TABLE renewal_requests ADD COLUMN current_status TEXT NOT NULL DEFAULT '';
