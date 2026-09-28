# Remarques techniques — Module Finance : revenus, Traiteur et Goûter

## A. Module Finance — vue générale

### 1. Suppression du bloc « إيرادات المطعم »

- **Élément :** « إيرادات المطعم » (Revenus de la cantine)
- **À faire :** supprimer ce bloc du module Finance. Les revenus liés à la restauration sont désormais suivis dans la section dédiée Repas / Goûter.

---

### 2. Revenus annuels globaux — exclusion du Repas et du Goûter

- **Élément :** « الإيرادات الكلية (السنة) » (Revenus totaux de l'année)
- **À faire :** ne **pas inclure** les montants du **Repas** et du **Goûter** dans ce total.
- **Justification :** chacun de ces deux services dispose déjà de sa propre section ; les compter ici créerait un doublon.

---

## B. Section Repas — onglet « Repas »

### 3. Logique conditionnée au mode de cuisine

- **Contexte :** mode « 👨‍🍳 مطبخ داخلي (طباخ قار) » (Cuisine interne / cuisinier permanent) sélectionné.
- **À faire :**
  - Masquer « حصة الـ Traiteur » (Part du Traiteur).
  - Masquer « ربح السنتر من الوجبات » (Bénéfice du centre sur les repas).
  - Ne **jamais** calculer ces montants selon la formule `nombre d'unités × prix unitaire`.
- **Remarque :** cette logique de partage et de calcul ne s'applique que lorsqu'un **Traiteur externe** existe.

---

### 4. Clôture du mois — forfait à restituer par élève

- **Élément :** « الفرفي المكتسب (Forfait ferme) »
- **À faire :** lors de la **clôture du mois**, afficher pour **chaque élève** le montant du forfait à restituer.

---

## C. Anomalie — statut de paiement du Goûter

### 5. Goûter payé affiché comme impayé

- **Constat :** lorsqu'un élève règle son abonnement au **Goûter** et qu'un Goûter est ajouté pour la journée, le module Finance l'affiche comme **non payé**.
- **À faire :** corriger le calcul du statut de paiement pour que l'abonnement Goûter réglé soit bien reconnu.
- **Points de vigilance :**
  - Vérifier que la recherche du paiement tient compte du **type de service** (Goûter et non uniquement Repas).
  - Vérifier la correspondance par **élève** et par **mois**.
