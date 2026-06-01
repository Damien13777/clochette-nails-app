# Clochette Nails — Pack logo

Système de logo · 4 variantes × 3 couleurs · Mai 2026
Monogramme CN d'origine **tracé en courbes de Bézier** (vecteur lisse, sans facette ni pixel) — préservation des contre-formes.

---

## Arborescence
```
export/
├── standard/                              ← PNG transparents (rendus depuis le tracé vectoriel)
│   ├── 01-monogramme/{couleur,noir,blanc}/      cn-{k}-{1536,1024,512,256}.png
│   ├── 02-lockup-vertical/{couleur,noir,blanc}/ lockup-vertical-{k}-{1536,1024,512}.png
│   ├── 03-lockup-horizontal/{couleur,noir,blanc}/ lockup-horizontal-{k}-{1536,1024,512}.png
│   ├── 04-badge-cercle/                          badge-{1024,512,256,180,120,64}.png
│   └── 05-favicon-app/                           favicon-16/32/48 · apple-touch-icon-180 · icon-192/512
└── vector/                                ← SVG courbes de Bézier (zoom infini)
    ├── 01-monogramme/      cn-monogramme-{couleur,noir,blanc}.svg
    ├── 02-lockup-vertical/ lockup-vertical-{couleur,noir,blanc}.svg
    ├── 03-lockup-horizontal/ lockup-horizontal-{couleur,noir,blanc}.svg
    └── 04-badge-cercle/    logo-badge.svg
```

## 4 variantes × 3 déclinaisons
| Variante | Couleur · Noir · Blanc |
|---|---|
| 01 · Monogramme CN | ✓ ✓ ✓ |
| 02 · Lockup vertical (marque primaire) | ✓ ✓ ✓ |
| 03 · Lockup horizontal (signe + nom) | ✓ ✓ ✓ |
| 04 · Badge cerclé (crème · contour violet) | version unique validée |

Couleur lavande `#B89BD6` · Noir anthracite `#2A2A2A` · Blanc réserve `#FFFFFF`

## Qualité — ce qui a changé
- **Tracé courbes de Bézier** (Catmull-Rom, détection de coins) : les bowls du C et du N sont des courbes lisses, les empattements restent nets. Plus aucune facette/pixel, ni en SVG ni en PNG, à n'importe quelle taille.
- **PNG rendus depuis le vecteur** (Path2D) → nets jusqu'à 1536 px.
- **Lockup horizontal** : largeur calculée d'après la mesure réelle du texte → « CLOCHETTE NAILS » n'est plus coupé.
- **Lockups** rendus avec Cinzel + Julius Sans One.
- **≤180 px** : utilisez le badge cerclé (favicons/icônes déjà ainsi) — le monogramme nu, aux fûts fins, gagne en lisibilité dans le cercle.

## Intégration web
```html
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png">
<!-- PWA : icon-192.png / icon-512.png -->
```

Couleurs DS : Violet `#8868B0`/`#5E4392` · Lavande `#B89BD6` · Contour `#CCAAD2` · Crème `#FCFBF7` · Anthracite `#2A2A2A`
