# Handoff — Clochette Nails · Design System (Phase 1)

## Overview
Système de design (tokens + composants de base) pour le site public et l'admin de **Clochette Nails**, salon de prothésie ongulaire haut de gamme à Moncoutant-sur-Sèvre. Image visée : élégance minimaliste, savoir-faire artisanal, douceur féminine non-clichée. Inspirations : Aesop, Sothys, Diptyque, La Roche-Posay.

Cette livraison correspond à la **Phase 1** : tokens, primitives UI, états, et règles d'usage. Les écrans (accueil, prise de rendez-vous, dashboard admin) sont des phases ultérieures qui s'appuieront sur ce système.

## About the Design Files
Le fichier livré (`Design System.html`) est une **référence de conception réalisée en HTML** — un prototype montrant l'apparence et le comportement attendus, **pas du code de production à copier-coller**. La tâche consiste à **recréer ce système dans l'environnement cible du projet** (React/Next.js, Vue/Nuxt, etc.) en utilisant ses patterns et bibliothèques en place. En l'absence d'environnement, choisir le framework adapté (recommandation : **Next.js + Tailwind v4** ou **Astro + Tailwind v4**, le système est rédigé en syntaxe `@theme` v4).

## Fidelity
**High-fidelity (hifi)** — Couleurs, typographie, espacements, radius, shadows et interactions sont **finaux**. Reproduire pixel-perfect avec les valeurs exactes ci-dessous.

## Design Tokens

Tous les tokens sont déclarés en CSS via `@theme { … }` (Tailwind v4). Aucune valeur en dur dans les composants.

### Couleurs

#### Violet (principal)
| Token | Hex | Usage |
|---|---|---|
| `--color-violet-700` | `#5E4392` | Hover, liens lisibles, texte sur crème (WCAG AA) |
| `--color-violet-600` | `#8868B0` | **Principal** — boutons primaires, accents (mauve doux) |
| `--color-violet-500` | `#A187C5` | Variantes intermédiaires |
| `--color-violet-300` | `#CCAAD2` | **Clair** — surfaces secondaires |
| `--color-violet-100` | `#ece1f3` | Backgrounds très subtils, hovers |
| `--color-violet-50`  | `#f6f1fa` | Hover ghost / secondary |

#### Doré (accent premium)
| Token | Hex | Usage |
|---|---|---|
| `--color-gold-600` | `#BF9F44` | Hover gold, accents foncés |
| `--color-gold-500` | `#DEC264` | **Accent** — highlights premium (doré doux) |
| `--color-gold-300` | `#ECD68B` | Variantes |
| `--color-gold-200` | `#F7DC6F` | **Clair** — backgrounds subtils |
| `--color-gold-50`  | `#fbf6e0` | Wash très léger |

#### Rose pastel
| Token | Hex | Usage |
|---|---|---|
| `--color-rose-100` | `#FCE0E3` | **Pastel doux** — badges, mises en avant féminines |
| `--color-rose-50`  | `#fdf1f3` | Background apaisant |

#### Backgrounds neutres
| Token | Hex | Usage |
|---|---|---|
| `--color-cream` | `#FCFBF7` | **Fond global de l'app** (15:1 vs ink-900 — AAA) |
| `--color-paper` | `#ffffff` | Cards, inputs, surfaces blanches |
| `--color-bone`  | `#f4f1e8` | Sections discrètement contrastées |

#### Encre (texte)
| Token | Hex | Usage |
|---|---|---|
| `--color-ink-900` | `#2A2A2A` | **Anthracite** — titres, body (≠ noir pur) |
| `--color-ink-700` | `#4a3f44` | Texte secondaire foncé, labels |
| `--color-ink-500` | `#7a5c65` | **Texte support** — descriptions, métadonnées |
| `--color-ink-300` | `#b8a4ab` | Placeholder, bordures icônes |
| `--color-ink-200` | `#d8cdd1` | Bordures hover input |
| `--color-line`    | `#ece5e7` | Bordures par défaut, dividers |

#### Sémantiques
| Token | Hex | Usage |
|---|---|---|
| `--color-success` | `#2f8f5a` | Confirmations |
| `--color-warning` | `#c98a2a` | Avertissements |
| `--color-danger`  | `#b23a4a` | Erreurs, destructif |
| `--color-info`    | `var(--color-violet-600)` | Notifications informatives |

### Typographie

**Quatre familles**, chacune avec un rôle précis :

- **Cinzel** (Google Fonts) — Display serif romain, h1/h2/h3 en **capitales**. Inspiration Aesop/Bulgari/Tiffany. Cinzel n'a **pas d'italique natif** → fallback automatique vers Inria Serif italic pour `<em>` et `<i>` dans les titres (règle CSS dans `tokens.css`). *Note v1.1 — adopté après l'écran Landing, remplace Cormorant Garamond.*
- **Julius Sans One** (Google Fonts) — Display caps géométrique. Eyebrows, badges, libellés de formulaire, boutons. **400 only**.
- **Inria Serif** (Google Fonts) — Serif body en graisse **Light 300**. Body éditorial : paragraphes marketing, hero subtitles, blog. Aussi utilisée en italique pour les emphases dans les titres Cinzel.
- **Manrope** (Google Fonts) — Sans-serif UI. Utilisée dans les contextes de **lisibilité prioritaire** où Inria Serif Light est trop fin : valeur saisie dans inputs, helper text, errors, admin, tables, listes paginées, toasts.

```css
--font-serif:   "Cinzel", "Trajan Pro", "Iowan Old Style", Georgia, serif;
--font-display: "Julius Sans One", "Manrope", ui-sans-serif, sans-serif;
--font-sans:    "Inria Serif", "Iowan Old Style", Georgia, serif;   /* body éditorial, weight: 300 */
--font-ui:      "Manrope", ui-sans-serif, system-ui, sans-serif;     /* UI dense, weight: 400 */
--font-mono:    "JetBrains Mono", ui-monospace, monospace;
```

`<html>` reçoit `font-weight: 300` par défaut (Inria Serif). Les composants UI overrident vers `--font-ui` (Manrope 400) via les classes dédiées (cf. `tokens.css`).

**Cinzel — règle importante** : pas d'italique natif. Tout `<em>` ou `<i>` à l'intérieur d'un titre (h1-h4) ou d'un élément `.font-serif` bascule automatiquement sur Inria Serif italic via une règle CSS héritée du DS. C'est ce qui permet le contraste éditorial visible sur le hero (`LA MANUCURE` Cinzel caps + *Avec passion et précision* Inria italic).

**Mémo rapide — quelle font pour quoi :**

| Contexte | Famille | Weight |
|---|---|---|
| Titres h1/h2/h3 (partout) | Cinzel | 500 |
| Italiques DANS un titre (em / i) | Inria Serif italic | 400 |
| Eyebrows / badges / boutons / labels form | Julius Sans One | 400 |
| Paragraphes marketing, hero subtitle, blog body | Inria Serif | 300 |
| Valeur inputs / helper / errors | Manrope | 400 |
| Admin shell (sauf h1-h4, badges, buttons, labels) | Manrope | 400 |
| Tables data-heavy | Manrope | 400 |
| Toasts | Manrope | 400 |

#### Échelle
| Token | Taille | Usage |
|---|---|---|
| h1 | `clamp(2.5rem, 5vw, 4rem)` (40 → 64px) · serif 500 | Titres de page |
| h2 | `2rem` à `2.5rem` · serif 500 | Sections |
| h3 | `1.5rem` · serif 500 | Sous-sections |
| body | `1rem` · sans 300 · line-height 1.5–1.6 | Paragraphes |
| small | `0.875rem` · sans 300 | Légendes, helper text |
| eyebrow | `0.75rem` · display · UC · `letter-spacing: 0.22em` | Étiquettes de section |

### Espacements (rem)
`0.5` · `1` · `1.5` · `2` · `3` · `4` · `6` — soit 8 / 16 / 24 / 32 / 48 / 64 / 96 px.

### Border radius
| Token | Valeur | Usage |
|---|---|---|
| `--radius-sm` | `8px` | Inputs, textarea, select |
| `--radius-md` | `15px` | Cards, modals |
| `--radius-lg` | `25px` | Panels, drawer header |
| `--radius-pill` | `50px` | **Boutons (toujours pill)** |

### Ombres (teintées violet)
Toutes basées sur `rgba(136, 104, 176, …)` — jamais de gris neutre.
| Token | Valeur |
|---|---|
| `--shadow-xs` | `0 1px 2px 0 rgba(136, 104, 176, 0.06)` |
| `--shadow-sm` | `0 2px 8px -2px rgba(136, 104, 176, 0.08)` |
| `--shadow-md` | `0 8px 24px -8px rgba(136, 104, 176, 0.14)` |
| `--shadow-lg` | `0 18px 40px -16px rgba(136, 104, 176, 0.18)` |
| `--shadow-focus` | `0 0 0 4px rgba(136, 104, 176, 0.22)` |

## Principes UI (à respecter dans toutes les phases)
1. **Mobile-first** — concevoir 375px d'abord.
2. **WCAG AA strict** — contraste minimum 4.5:1 sur tout texte. États focus visibles au clavier.
3. **Pas d'emoji, pas de néon, pas de paillettes** — iconographie **Lucide stroke 1.5** uniquement.
4. **Micro-interactions subtiles** — 0.3s, easing doux. Jamais de bounce.
5. **Respiration généreuse** — whitespace prioritaire. Une colonne aérée > deux colonnes serrées.
6. **Tokens, jamais de hex en dur** — toute valeur passe par une variable CSS.

## Assets
- **Polices** : Cinzel, Julius Sans One, Inria Serif, Manrope, JetBrains Mono — toutes Google Fonts. À auto-héberger en production (perf + offline) via `next/font` ou équivalent.
- **Icônes** : [Lucide](https://lucide.dev) (`lucide-react`, `lucide-vue-next`, …) — stroke-width **1.5** par défaut, taille 18–20px.
