# Remarques techniques — Gestion des modules selon le type de centre

## Contexte : matrice `moduleCenterTypes`

Cette matrice définit la visibilité de chaque module en fonction du type de centre (Crèche, Jardin, Garderie, Formation) et sert de référence pour toutes les remarques ci-dessous.

| Clé du module | Libellé | Crèche | Jardin | Garderie | Formation |
|---|---|---|---|---|---|
| `etude` | Étude Surveillée | ❌ | ❌ | ✅ | ✅ |
| `coursParticuliers` | Cours Particuliers | ❌ | ❌ | ✅ | ✅ |
| `revision` | Révision Examens | ❌ | ❌ | ✅ | ✅ |
| `formations` | Formations | ❌ | ❌ | ✅ | ✅ |
| `cantine` | Cantine & Repas | ✅ | ✅ | ✅ | ✅ |
| `transport` | Transport Scolaire | ✅ | ✅ | ✅ | ✅ |
| `events` | Événements & Sorties | ✅ | ✅ | ✅ | ✅ |
| `staff` | Personnel & Salaires | ✅ | ✅ | ✅ | ✅ |
| `activites` | Activités & Planning | ✅ | ✅ | ✅ | ✅ |
| `competences` | Compétences & Skills | ✅ | ✅ | ✅ | ✅ |
| `base` (scolaire, studentTimeSheets, finance) | — | ✅ | ✅ | ✅ | ✅ |

---

## 1. Filtre « Tous les niveaux » — Registre de présence des élèves

**Écran concerné :** نظام تسجيل حضور التلاميذ (registre de présence des élèves)

- Pour les centres de type **Crèche** ou **Jardin**, la notion de « niveau scolaire » n'a pas de sens fonctionnel.
- **À faire :** masquer le filtre « كل المستويات » (Tous les niveaux) lorsque `centerType` est `Crèche` ou `Jardin`.

---

## 2. Persistance des modules « Activités & Planning » et « Compétences & Skills »

- **Constat :** ces deux modules ne sont aujourd'hui reliés à aucune table en base de données ; leur contenu est probablement statique/mocké côté front.
- **À faire :**
  - Créer les fichiers de migration nécessaires pour les tables correspondantes.
  - Développer les endpoints API (CRUD) associés.
  - S'assurer que la persistance respecte bien la logique de la matrice `moduleCenterTypes` (ces deux modules étant visibles pour tous les types de centre).

---

## 3. Heure de démarrage du planning « Activités & Planning »

- **Actuel :** la grille horaire démarre à **06h00**.
- **Attendu :** la grille doit démarrer à **08h00**, heure réelle d'ouverture des activités.
- **Point de vigilance :** vérifier l'impact éventuel sur les créneaux, exports et rapports qui utilisent cette même plage horaire.

---

## 4. Position de l'icône — « الأنشطة والبرنامج الأسبوعي » (Activités et planning hebdomadaire)

- **Actuel :** l'icône est placée à l'intérieur du rectangle vert (badge en `text-2xl`) contenant le titre.
- **Attendu :** déplacer l'icône **avant le texte du titre**, en dehors du badge vert.

---

## 5. Position de l'icône — « المهارات والكفايات » (Compétences et aptitudes)

- Même remarque que le point précédent : l'icône doit être positionnée **avant le texte du titre**, et non intégrée dans le rectangle vert.

---

## 6. Gestion dynamique des compétences — « المهارات والكفايات »

- **Constat :** le module affiche actuellement **4 compétences codées en dur** (statiques).
- **Attendu :** rendre ces compétences gérables dynamiquement :
  - Créer une table `skills` en base de données.
  - Créer le fichier de migration correspondant.
  - Développer l'API (création, lecture, modification, suppression) pour gérer ces compétences.
  - Adapter le front pour consommer l'API à la place des valeurs statiques actuelles.

---

## 7. Correction de la logique de détection de plan — Renouvellement (« Renouvellement »)

- **Problème actuel :** lorsqu'un centre de type **Crèche** ou **Jardin** sélectionne « tous les modules » lors du renouvellement, le système classe à tort l'abonnement dans le plan **Growth**.
- **Cause :** la logique actuelle compte le nombre total de modules existants dans le système, sans tenir compte du fait que, pour ces types de centre, certains modules sont volontairement masqués par la matrice `moduleCenterTypes` (Étude Surveillée, Cours Particuliers, Révision Examens, Formations). Le total de modules « réellement disponibles » pour Crèche/Jardin est donc inférieur au total global — ce qui fausse la comparaison.
- **Attendu :** la logique doit comparer la sélection de l'utilisateur au nombre de modules **applicables au type de centre concerné** (et non au total global). Ainsi, sélectionner tous les modules visibles pour un centre Crèche ou Jardin doit correctement déclencher le plan **Pro**, et non Growth.

