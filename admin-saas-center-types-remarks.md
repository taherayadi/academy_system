# Admin SaaS — New Center Types & Module Rules (Remarks)

**Center types supported:** `creche` · `jardin` · `garderie` · `formation`

---

## 1. Roll out the two new center types across the admin SaaS

The values `creche` and `jardin` must be treated as first-class center types everywhere a center type is displayed, chosen, or filtered. Please make sure they appear in:

- **Add new center** — center type selector.
- **List of centers** — center type column / badge.
- **List of centers → filter** — center type filter options.
- **Update center** — center type selector (with the current value preselected).
- **List of trial requests** — center type column / badge.
- **List of trial requests → filter** — center type filter options.
- **"Convert to center" modal** — center type selector.

**Remark:** use one shared source of truth (a single enum/constant plus its labels) rather than hardcoding the list per screen. That way any future center type is added in one place and propagates automatically.

---

## 2. Prices list

- **Remove** the **Library** module price entry — the module is no longer offered, so it should disappear from the pricing list and from any pricing totals.
- **Add** pricing entries for the two newly introduced modules:
  - **Activités & Planning** (`activites`)
  - **Compétences & Skills** (`competences`)

**Remark:** double-check historical records — existing centers that already hold a Library price should keep their invoice history intact; only the selectable catalog is affected.

---

## 3. Module eligibility per center type (`moduleCenterTypes`)

Eligibility is driven by a single constant map. A module may only be attached to a center whose type is marked ✅ below.

| Module key | Label | Crèche | Jardin | Garderie | Formation |
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
| base (`scolaire`, `studentTimeSheets`, `finance`) | — | ✅ | ✅ | ✅ | ✅ |

### Where this logic must be respected

- **تعديل الباقة (Edit plan) in the centers list** — when an admin edits a center's plan, only modules eligible for that center's type may be offered. Ineligible modules should not be selectable.
- Prefer showing ineligible modules as **disabled with a short explanation** (e.g. *"Not available for Crèche / Jardin"*) instead of hiding them — it makes the rule understandable rather than mysterious.
- **Server-side validation is required**, not just UI filtering: reject any plan update that includes a module not permitted for the center type.
- **Base modules** (`scolaire`, `studentTimeSheets`, `finance`) are always included for every center type and should never be togglable.
- **Edge case:** if a center's type is changed to one with a narrower module set, warn the admin that the now-ineligible modules will be deactivated, and ask for confirmation before saving.

---

## 4. Rebranding: System Academy → EduSphère

- Replace every occurrence of **"System Academy"** with **"EduSphère"** across the whole application.
- This includes the footer notice, which becomes: **EduSphère SaaS © 2026**.
- Don't forget the less visible places: page titles and browser tab titles, sidebar and login headers, email templates and notifications, PDF/invoice headers and footers, translation files (AR / FR / EN), meta tags and SEO descriptions, and any alt text or asset filenames.
- **Remark:** mind the accented character — the correct spelling is **EduSphère**, and translation files must be saved in UTF-8 so the è renders correctly in every language.
