# Center-Type Module Rules — Remarks

## 1. Student registration form

- For **Crèche** and **Jardin d'enfants**, hide the **المسار الدراسي لآخر 3 سنوات** (last 3 years academic history) section. It isn't relevant at these age levels, so the form stays short and age-appropriate.

## 2. Module visibility by center type

- **Crèche / Jardin d'enfants** — menu shows only: Basic plan, **Repas**, **Bus**, **Events**, **Personnel / Staff**, **Activity Planning**, and **Skills**.
- **Garderie / Formation** — all existing modules are available; nothing is restricted.

## 3. Staff-lite inside Activity Planning

- When a center enables **Activity Planning** without having purchased the **Staff** module, a limited **« إدارة الموظفين »** view is unlocked: create, edit, and delete staff profiles only.
- **Bulletin de paie**, **avances**, **congés**, and **pointage** (daily timesheet) remain locked and are only accessible with the paid Staff module. Show them as locked with a short upgrade hint rather than hiding them, so the value of upgrading is visible.

## 4. Renewal module

- When a user opens **Renouvellement** to review their current plan, request a renewal, or switch plans, only modules compatible with their center type are listed. Incompatible modules are never offered, which prevents paying for something unusable.

## 5. Landing page module cards

- Each module card must display which center types it supports, for example:
  - **Étude** → Garderie, Formation
  - **Révision** → Garderie, Formation
  - **Events** → all 4 center types
- A small badge or "Available for: …" line on every card keeps eligibility clear before the user commits.

## 6. Demo request form

- When a visitor selects a center type and then picks modules, validate the combination live.
- If **Crèche** or **Jardin d'enfants** is selected together with an unsupported module, show a friendly remark such as:

  > ℹ️ This module isn't available for Crèche and Jardin d'enfants centers. You can remove it or choose Garderie / Formation to keep it.

- Keep it informative rather than blocking: guide the choice instead of rejecting the submission outright.

---

## Quick reference matrix

| Module | Crèche | Jardin d'enfants | Garderie | Formation |
| --- | --- | --- | --- | --- |
| Basic plan | ✅ | ✅ | ✅ | ✅ |
| Repas | ✅ | ✅ | ✅ | ✅ |
| Bus | ✅ | ✅ | ✅ | ✅ |
| Events | ✅ | ✅ | ✅ | ✅ |
| Personnel / Staff | ✅ | ✅ | ✅ | ✅ |
| Activity Planning | ✅ | ✅ | ✅ | ✅ |
| Skills | ✅ | ✅ | ✅ | ✅ |
| Étude | ❌ | ❌ | ✅ | ✅ |
| Révision | ❌ | ❌ | ✅ | ✅ |
| All other modules | ❌ | ❌ | ✅ | ✅ |
