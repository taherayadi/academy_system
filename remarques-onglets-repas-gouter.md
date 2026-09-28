# Remarques techniques — Onglets Repas / Goûter

## Module Repas

### 1. Ajout d'onglets sous les filtres

- **À faire :** sous les filtres « nom » et « année scolaire », ajouter des **onglets** contenant 2 éléments :
  - **Repas**
  - **Goûter**

---

### 2. Onglet « Repas »

Cet onglet regroupe les sections suivantes :

| N° | Section | Traduction |
|---|---|---|
| 1.1 | شبكة مدفوعات المطعم | Grille des paiements de la cantine |
| 1.2 | برنامج وجبة اليوم | Programme du repas du jour |
| 1.3 | متابعة استهلاك المشتركين شهرياً | Suivi mensuel de la consommation des abonnés |

**Règle sur le bouton « تسجيل الوجبة » (Enregistrer le repas) :**

- Au clic, l'élève est ajouté dans le **Pointage**.
- **Point de vigilance :** seule l'option **Plat repas (Déjeuner)** doit être cochée ; le Goûter reste décoché.

---

### 3. Onglet « Goûter »

Cet onglet regroupe les sections suivantes :

| N° | Section | Traduction |
|---|---|---|
| 2.1 | جدول المشتركين في خدمة اللمجة - Goûter | Tableau des abonnés au service Goûter |
| 2.2 | متابعة استهلاك مشتركي اللمجة شهرياً | Suivi mensuel de la consommation des abonnés Goûter |

**Règle sur le nouveau bouton « تسجيل الوجبة » (section 2.2) :**

- **Si la ligne n'existe pas dans le Pointage :** créer une **nouvelle ligne** avec uniquement le **Goûter** coché ; le Repas reste décoché.
- **Si la ligne existe déjà** (par exemple avec le Repas déjà coché) : **mettre à jour cette même ligne** en y ajoutant le Goûter, sans créer de doublon.

---

## Module Finance > Section Repas

### 4. Ajout d'onglets

- **À faire :** ajouter des **onglets** contenant 2 éléments :
  - **Repas**
  - **Goûter**

---

### 5. Cartes de synthèse (une version par service)

Chacune des cartes suivantes doit exister en **deux versions** : une pour le **Repas**, une pour le **Goûter**.

| N° | Carte | Traduction |
|---|---|---|
| 3.0.0 | إجمالي الاشتراكات | Total des abonnements |
| 3.0.1 | إجمالي الوجبات المستهلكة | Total des repas consommés |
| 3.0.2 | وجبات غير مدفوعة | Repas impayés |

---

### 6. Tableaux et détails

**3.1 — إجمالي الوجبات المستهلكة في كل شهر** (Total des repas consommés par mois)

- Ce tableau doit concerner **uniquement le Repas** ; le Goûter en est exclu.

**3.2 — تفاصيل استهلاك التلاميذ — اللمجة (Goûter)** (Détails de consommation des élèves — Goûter)

- **Point de vigilance :** le filtre par mois doit fonctionner correctement : les données affichées doivent correspondre au **mois sélectionné**.

**3.3 — Nouveau composant Goûter**

- **À faire :** ajouter un composant équivalent à « إجمالي الوجبات المستهلكة في كل شهر », dédié **exclusivement au Goûter**, sans aucune donnée du Repas.
