# Remarques techniques — Finance > Section Repas : onglet Goûter

## A. Onglet « Goûter » — éléments à masquer

Les blocs suivants sont propres au **Repas** et n'ont pas leur place dans l'onglet **Goûter**.

### 1. Forfait ferme

- **Élément :** « الفرفي المكتسب (Forfait ferme) »
- **À faire :** masquer ce bloc lorsque l'onglet **Goûter** est actif. Il ne concerne que le Repas.

---

### 2. Bandeau d'information sur le prix du repas

- **Élément :** le bandeau affichant « سعر الوجبة : 8.000 د.ت » et « 👨‍🍳 مطبخ داخلي — بدون وسيط »
- **Repère technique :** conteneur `bg-white p-4 rounded-2xl border border-slate-200/70 flex flex-wrap items-center gap-6 text-xs font-bold`
- **À faire :** masquer ce bandeau dans l'onglet **Goûter**. Il ne concerne que le Repas.

---

### 3. Revenus et consommation du service Goûter

- **Élément :** « مداخيل واستهلاك خدمة اللمجة (Goûter) »
- **À faire :** masquer également ce bloc dans l'onglet **Goûter**.

---

## B. Onglet « Goûter » — nouveau composant de suivi mensuel

### 4. Total de consommation du Goûter par mois

- **Élément :** « إجمالي استهلاك اللمجة في كل شهر »
- **À faire :** construire ce composant **à l'identique** de « إجمالي الوجبات المستهلكة في كل شهر » de l'onglet Repas.
- **Conteneur attendu :** `bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5`

**Comportement au clic sur un mois :**

- Charger l'historique du mois sélectionné dans un composant équivalent à « تفاصيل الوجبات المستهلكة في شهر », mais dédié au **Goûter**.
- Reprendre **le même style** : un panneau par **jour de consommation**, avec possibilité de **l'ouvrir et de le refermer**.

---

## C. Onglet « Repas » — exclusion des données Goûter

### 5. Isolation stricte des données Repas

- **« إجمالي الوجبات المستهلكة في كل شهر » :** n'afficher et ne calculer que les données du **Repas**. Aucune donnée Goûter ne doit y être ajoutée.
- **« تفاصيل الوجبات المستهلكة في شهر » :** ne doit afficher aucun enregistrement de **Goûter**.
- **Point de vigilance :** vérifier que le filtrage se fait bien à la source (requête/agrégation) et pas seulement à l'affichage, afin que les totaux restent exacts.
