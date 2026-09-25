# Remarques techniques — Module Restauration (Repas & Goûter)

## Module Repas (Cantine)

### 1. Programme du jour — ajout du samedi

**Écran concerné :** برنامج وجبة اليوم (Programme du repas du jour)

- **Actuel :** la liste des jours proposés ne comprend pas le samedi.
- **À faire :** ajouter « السبت » (Samedi) comme jour sélectionnable dans la liste, en arabe.

---

### 2. Séparation des abonnés Repas / Goûter

**Écran concerné :** tableau « المشتركون لشهر سبتمبر — 1 تلميذ(ة) (مسددون + غير مسددين) » (Abonnés du mois de septembre — payés + impayés)

- **Constat :** certains élèves sont abonnés uniquement au **Goûter**, sans être abonnés au **Déjeuner**. Le tableau actuel ne fait pas cette distinction et mélange les deux cas.
- **À faire :** créer un **composant/tableau dédié** pour les abonnés au Goûter, en complément du tableau existant réservé aux abonnés du Repas/Déjeuner.

---

### 3. Ajout d'un élève au pointage du jour

**Écran concerné :** « إضافة تلميذ بالوحدة... » dans « Pointage اليوم » (Ajout d'un élève à l'unité, dans le pointage du jour)

- **À faire :** lors de la sélection d'un élève à ajouter, afficher d'abord les **3 choix de service à l'état désactivé** :
  - Déjeuner
  - Goûter matin
  - Goûter après-midi
- Une fois l'élève sélectionné, permettre de choisir **quel(s) service(s)** il prend réellement, en activant uniquement les options correspondant à son abonnement.

---

### 4. Retrait de l'action « Supprimer » — tableau des abonnés Goûter

**Écran concerné :** « جدول المشتركين في خدمة اللمجة - Goûter » (Tableau des abonnés au service Goûter)

- **À faire :** retirer l'action de suppression (bouton/icône delete) de ce tableau.

---

## Paramètres (Settings)

### 1. Tarification du service Goûter — accepter les valeurs décimales

**Écran concerné :** « تسعيرة خدمة اللمجة (Goûter) » (Tarif du service Goûter)

- **Actuel :** le champ n'accepte que des valeurs entières (ex : 2dt, 3dt).
- **À faire :** permettre la saisie de valeurs décimales (ex : 2,5 dt).

---

## Module Finance > Gestion des repas

### 1. Masquer les indicateurs Traiteur/Centre en mode cuisine interne

**Contexte :** lorsque le mode « 👨‍🍳 مطبخ داخلي (طباخ قار) » (Cuisine interne / cuisinier permanent) est sélectionné dans les paramètres.

- **À faire :** masquer les blocs suivants, pertinents uniquement en mode Traiteur externe :
  - حصة الـ Traiteur (Part du Traiteur)
  - ربح السنتر للوجبة (Bénéfice du centre par repas)
  - حصة السنتر (Part du centre)
- **Remarque :** ces informations ne doivent s'afficher que lorsque le mode sélectionné est **Traiteur externe**.

---

### 2. Détail de consommation des élèves — ajout du Goûter

**Écran concerné :** « تفاصيل استهلاك التلاميذ » (Détails de consommation des élèves)

- **À faire :** ajouter un **composant séparé** pour détailler la consommation liée au Goûter, en complément de celui déjà existant pour le Repas/Déjeuner.
