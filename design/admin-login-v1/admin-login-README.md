# Admin · Connexion — Handoff dev (v1)

> Page `/admin/connexion` · Clochette Nails · Référence : `Design System.html` (v1.1) + `AdminLogin.html` (mock validé)
> Cible : Next.js 16 App Router · NextAuth v5 (credentials) · Prisma 7 · Tailwind v4

---

## 1. Overview

| | |
|---|---|
| **Objectif business** | Porte d'entrée unique de l'espace admin (Chloé). Pose le langage visuel de l'admin shell décliné sur 10+ écrans. |
| **Cible utilisateur** | Administratrice unique (rôle ADMIN). Préparé pour rôle CLIENT futur côté public. |
| **Route** | `app/admin/connexion/page.tsx` (hors group `(marketing)`). |
| **Auth** | NextAuth v5 + provider `Credentials` (email + password bcrypt cost 12). |
| **Middleware** | `src/proxy.ts` protège `/admin/*` → redirect vers `/admin/connexion?callbackUrl=…` si pas de session. |
| **Stack styles** | Tailwind v4 (`@theme`) + tokens DS v1.1. Manrope dominant côté admin (Inria Serif n'est PAS utilisée). |
| **Ratio Server/Client** | Page = RSC shell minimal ; `<LoginForm />` = Client Component isolé (form state + signIn). |
| **Lighthouse cible** | Performance ≥ 95 · Accessibility ≥ 98 · Best Practices ≥ 100 · SEO N/A (noindex). |

---

## 2. Déviations du Design System

**Aucune déviation — DS v1.1 strictement respecté.**

Application admin-shell :
- `--font-ui` (Manrope) en font dominante via `html { font-family: var(--font-ui); }` au lieu de `var(--font-sans)`. Inria Serif Light n'est jamais chargée pour cette page.
- Cinzel (`--font-serif`) réservé au titre H1 et au monogramme logo.
- Julius Sans One (`--font-display`) sur eyebrow, labels, bouton CTA.
- Palette : violet 600 unique accent UI. Aucune utilisation du doré sur cette page.

---

## 3. Sections de la page

| # | Anchor | Description |
|---|---|---|
| 0 | `header` | Logo monogramme + nom salon + eyebrow "Administration" |
| 1 | `card` | Carte centrée 440px (logo + titre + sous-titre) |
| 2 | `form` | Email + mot de passe + remember + lien oublié |
| 3 | `submit` | Bouton primaire pleine largeur + erreur globale en dessous |
| 4 | `footnote` | Mention "Accès réservé · contactez l'éditeur" |
| 5 | `footer` | Mention copyright + connexion sécurisée |

---

## 4. Détail par section

### 4.1 Header (top-left)
- Logo violet 32px + nom Cinzel + eyebrow Julius Sans One "Administration".
- Lien complet vers `/` (retour site public).
- Pas de nav : page de bord, doit rester focus.

### 4.2 Card centrée
- `max-width: 440px`, `padding: p-6 sm:p-10 md:p-12`, `border-radius: var(--radius-lg)` (25px), `shadow-lg`.
- Verticalement et horizontalement centrée dans le viewport (`min-h-screen flex items-center`).
- Animation entrée : `fadeUp` 400ms `cubic-bezier(.2,.7,.3,1)`.
- Animation erreur : `shake` horizontale 320ms (subtle, max 6px).
- Background body : `var(--color-cream)` + trame radiale 22px très discrète.

### 4.3 Form
- **Email** : `<input type="email" autocomplete="username">` + icône `mail` à gauche (input-icon-wrap DS).
  - Validation live au `blur` (regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
  - Sur input après erreur : auto-clear si redevient valide.
- **Password** : `<input type="password" autocomplete="current-password" minlength="8">` + bouton œil à droite.
  - Toggle show/hide via icône `eye` ↔ `eye-off` (Lucide), `aria-pressed` synchronisé.
  - Helper "Minimum 8 caractères." en `field-help` (toujours visible).
- **Remember me** : checkbox `.check` DS, label "Se souvenir de moi".
- **Mot de passe oublié** : lien discret aligné à droite, hover violet 700.
- **Honeypot** : `<input name="website" tabindex="-1" aria-hidden="true">` positionné hors viewport. Si non vide → rejet silencieux côté server.

### 4.4 Submit
- `.btn .btn-primary .btn-block` pleine largeur.
- États : `idle` (label "Se connecter") · `loading` (spinner inline + "Connexion…") · `disabled` tant que form invalide.
- Sous le bouton : `.alert-error` (background `rgba(178,58,74,0.06)`, bordure danger, texte danger, icône `alert-triangle`).

### 4.5 Footnote
- Mention "Accès réservé · contactez l'éditeur" avec `mailto:contact@clochette-nails.fr`.

---

## 5. Composants DS réutilisés

| Classe / Token | Usage |
|---|---|
| `.btn .btn-primary` | CTA "Se connecter" (full-width via classe utilitaire) |
| `.field .field-label .field-help .field-error` | Wrappers form |
| `.input` (états `.is-error`, `[disabled]`) | Email + password |
| `.input-icon-wrap` + `.icon-left` / `.icon-right` | Icône mail + œil show/hide |
| `.check` | Checkbox "Se souvenir" |
| `.card` (via tokens : `radius-lg`, `shadow-lg`, `paper`, `line`) | Carte de connexion |
| `--color-violet-600 / 700 / 50` | Accent UI principal + hover liens |
| `--color-cream` | Background body |
| `--color-paper` | Background card |
| `--color-line / ink-200 / ink-300 / ink-500 / ink-700 / ink-900` | Bordures + texte |
| `--color-danger / success` | Erreur globale + état succès (futur) |
| `--font-serif / display / ui` | Cinzel (H1, monogramme) · Julius Sans One (eyebrow, labels, btn) · Manrope (corps + inputs) |
| `--radius-sm / lg / pill` | Inputs / card / bouton |
| `--shadow-md / lg / focus` | Hover btn / card / focus ring |

---

## 6. Composants spécifiques

À placer dans `src/components/admin/auth/`.

| Composant | Type | Responsabilités | Props |
|---|---|---|---|
| `AdminLoginShell` | Server | Layout pleine page (header + footer), pas de chrome admin. Render `<LoginCard />`. | `callbackUrl?: string` |
| `LoginCard` | Server | Card statique (logo + titres + footnote). Render `<LoginForm />` enfant. | `callbackUrl?: string` |
| `LoginForm` | Client | Form state, validation Zod/RHF, `signIn('credentials', …)`, états loading/error. | `callbackUrl?: string` |
| `EmailField` | Client | Field email + icône `mail` + validation live. | `register`, `error` |
| `PasswordField` | Client | Field password + toggle show/hide (`aria-pressed`). | `register`, `error` |
| `GlobalErrorAlert` | Client | `<div role="alert" aria-live="assertive">` avec icône + message FR. Animation shake déclenchée par parent. | `message?: string` |
| `SubmitButton` | Client | Bouton primaire avec états idle/loading. Désactivé si form invalide. | `pending: boolean`, `disabled: boolean` |

---

## 7. State management

**Recommandation : react-hook-form + Zod resolver** (form local pur, pas de Zustand).

```ts
// LoginForm.tsx
const { register, handleSubmit, formState: { errors, isValid }, setError } =
  useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

const [pending, setPending] = useState(false);
const [globalError, setGlobalError] = useState<string | null>(null);
const [showPw, setShowPw] = useState(false);
```

Pas de persistance (jamais en localStorage). Le champ "Se souvenir de moi" est transmis à NextAuth qui gère la durée du cookie de session.

---

## 8. API calls

| Méthode | URL | Trigger | Body |
|---|---|---|---|
| `POST` | `/api/auth/callback/credentials` | Submit form | `{ email, password, remember, redirect: false }` (via `signIn()`) |
| `GET` | `/api/auth/csrf` | Implicite NextAuth | — |
| `GET` | `/api/auth/session` | Après signIn pour vérif | — |

```ts
// Client
import { signIn } from "next-auth/react";

async function onSubmit(values: LoginInput) {
  setPending(true);
  setGlobalError(null);
  const res = await signIn('credentials', {
    email: values.email,
    password: values.password,
    remember: String(values.remember),
    redirect: false,
    callbackUrl: callbackUrl ?? '/admin',
  });
  setPending(false);
  if (!res?.ok) {
    // Réponse constante quelle que soit la cause (no timing leak)
    setGlobalError("Adresse e-mail ou mot de passe incorrect.");
    return;
  }
  window.location.href = res.url ?? '/admin';
}
```

**Gestion d'erreur UI :**
- `res?.error === 'CredentialsSignin'` → message constant "Adresse e-mail ou mot de passe incorrect." + animation shake.
- `res?.error === 'RateLimited'` (custom) → "Trop de tentatives. Veuillez patienter 5 minutes."
- Throw réseau → toast "Connexion impossible. Réessayez."

---

## 9. Server Actions

NextAuth v5 fournit déjà `signIn` côté server, donc **pas de server action custom obligatoire**. Pour le cas où on veut un fallback progressive-enhancement :

```ts
// app/admin/connexion/actions.ts
"use server";
import { signIn } from "@/auth";
import { loginSchema } from "@/schemas/auth";
import { AuthError } from "next-auth";

export async function loginAction(_state: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    remember: formData.get('remember') === 'on',
    website: formData.get('website'), // honeypot
  });
  if (!parsed.success) return { error: 'INVALID_INPUT' as const };
  if (parsed.data.website) return { error: 'BOT_DETECTED' as const };

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: true,
      redirectTo: '/admin',
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'INVALID_CREDENTIALS' as const };
    }
    throw err;
  }
}
```

**Logique métier dans le provider `Credentials` (auth.ts) :**
1. Rate-limit Upstash : `auth:fail:{ip}` 5 fails / 5 min → throw `RateLimitedError`.
2. `prisma.user.findUnique({ where: { email } })`.
3. `bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)` — **toujours** comparer pour temps constant.
4. Si fail → incrément Upstash + throw `CredentialsSignin`.
5. Si ok → reset compteur Upstash, log `OutboundEvent: AdminLoginSucceeded`, return `{ id, email, role: 'ADMIN' }`.
6. Cookie durée : 7 jours par défaut, 30 jours si `remember=true`.

---

## 10. Schemas Zod

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string()
    .trim()
    .min(1, "Email requis")
    .email("Adresse email invalide")
    .max(120),
  password: z.string()
    .min(8, "Mot de passe trop court (8 caractères minimum)")
    .max(128),
  remember: z.boolean().default(false),
  website: z.string().max(0).optional(), // honeypot — toujours vide
});

export type LoginInput = z.infer<typeof loginSchema>;
```

---

## 11. Flow auth (séquence)

```
[User] saisit email + password → submit
   ↓
[Client LoginForm] react-hook-form valide via Zod
   ↓
[Client] signIn('credentials', { email, password, remember, redirect: false })
   ↓
[NextAuth route /api/auth/callback/credentials]
   ├─ CSRF check (automatique NextAuth)
   ├─ Rate-limit check Upstash (par IP)
   ├─ authorize() :
   │    ├─ prisma.user.findUnique({ where: { email } })
   │    ├─ bcrypt.compare (toujours, même si user absent — DUMMY_HASH)
   │    └─ throw CredentialsSignin si fail
   ├─ JWT callback : { sub, email, role: 'ADMIN' }
   ├─ Session callback : enrichit avec role
   └─ Set-Cookie : next-auth.session-token (HttpOnly, Secure, SameSite=Lax)
         maxAge: 7j (ou 30j si remember=true)
   ↓
[Client] res.ok === true → window.location.href = '/admin'
   ↓
[Middleware proxy.ts] vérifie session sur /admin → autorise
   ↓
[/admin/page.tsx] (RSC) → getServerSession() → render dashboard
```

---

## 12. États d'erreur (copy FR)

| Code | Trigger | Copy affichée | UI |
|---|---|---|---|
| `INVALID_CREDENTIALS` | Auth échoue (email inconnu OU mdp faux) | "Adresse e-mail ou mot de passe incorrect." | `alert-error` + shake card |
| `RATE_LIMITED` | 5+ fails / 5 min | "Trop de tentatives. Veuillez patienter 5 minutes." | `alert-error` |
| `NETWORK_ERROR` | fetch rejette | "Connexion impossible. Réessayez." | toast |
| `EMAIL_INVALID` | Validation Zod | "Adresse email invalide." | `field-error` sous input |
| `EMAIL_REQUIRED` | Champ vide au blur | "Email requis" | `field-error` |
| `PASSWORD_TOO_SHORT` | < 8 chars | "Mot de passe trop court (8 caractères minimum)." | `field-error` |
| `PASSWORD_REQUIRED` | Champ vide au blur | "Mot de passe requis" | `field-error` |
| `BOT_DETECTED` | Honeypot rempli | aucune (rejet silencieux 200 OK avec délai random) | rien visible |

**Constance temporelle :** la réponse server `signIn` doit prendre un temps similaire que l'email existe ou non (toujours `bcrypt.compare` avec un DUMMY_HASH fixe si user absent).

---

## 13. Responsive

| Breakpoint | Card width | Padding | Logo | Font scale |
|---|---|---|---|---|
| `<640` (mobile) | `100% - 2rem` | `p-6` (1.5rem) | 40px | H1 `text-2xl` |
| `640-767` | `440px` max | `p-10` (2.5rem) | 48px | H1 `text-2xl` |
| `≥768` (desktop) | `440px` max | `p-12` (3rem) | 48px | H1 `text-[26px]` |

Header et footer en `px-6 md:px-10`. Aucune sidebar admin sur cette page.

---

## 14. Animations

| Trigger | Effet | Implémentation |
|---|---|---|
| Mount page | Card fade + translate Y 8px | `@keyframes fadeUp` 400ms `cubic-bezier(.2,.7,.3,1)` |
| Erreur identifiants | Shake horizontal subtil (max ±6px) | `@keyframes shake` 320ms `cubic-bezier(.36,.07,.19,.97)` |
| Submit pending | Spinner blanc rotation 360° | `@keyframes spin` 800ms linear infinite |
| Focus inputs | Border violet 600 + box-shadow halo | CSS transitions DS sur `.input:focus` |
| Hover bouton primaire | translateY(-1px) + shadow-md | CSS transitions DS sur `.btn-primary:hover` |
| Toggle show/hide | swap icon `eye` ↔ `eye-off` | JS `lucide.createIcons()` |
| Reduced motion | Toutes animations désactivées | `@media (prefers-reduced-motion: reduce) { animation: none !important; }` |

---

## 15. Accessibilité

- **Labels visibles** : pas de placeholder-only. Chaque input a un `<label for>` explicite.
- **aria-invalid** sur inputs en erreur, synchronisé avec validation live.
- **aria-describedby** sur password → "password-help password-error" (helper + erreur lus par AT).
- **Erreur globale** : `role="alert" aria-live="assertive"`, annoncée immédiatement.
- **Erreurs de champ** : `role="alert"` (suffisant, `aria-live="polite"` par défaut).
- **Toggle password** : bouton avec `aria-label` dynamique ("Afficher le mot de passe" / "Masquer le mot de passe") + `aria-pressed`.
- **Honeypot** : `aria-hidden="true"` + `tabindex="-1"` (invisible AT et clavier).
- **Focus order** : email → password → toggle œil → "se souvenir" → "oublié" → submit.
- **Focus ring** : `--shadow-focus` (4px violet alpha) sur tous les éléments interactifs.
- **Pas de skip link** : single form, pas de chrome admin à contourner.
- **Contrast** : tous textes ≥ AA (vérifié sur `ink-500` sur `paper` = 4.7:1).
- **prefers-reduced-motion** : animations désactivées.

---

## 16. SEO

```ts
// app/admin/connexion/page.tsx
export const metadata: Metadata = {
  title: "Connexion · Administration",
  description: "Espace d'administration Clochette Nails.",
  robots: { index: false, follow: false }, // noindex + nofollow
  alternates: { canonical: undefined },     // pas de canonical
};
```

Pas de JSON-LD. Pas de Open Graph (page privée).

---

## 17. Performance

- **LCP** : la card (texte + monogramme), aucun fetch bloquant. Cible LCP < 1.2s.
- **Fonts** : `next/font/google` pour Cinzel (500), Julius Sans One (400), Manrope (400, 500, 600). `display: 'swap'`, `preload: true` sur tous. Pas d'Inria Serif sur l'admin.
- **Bundle Client** : `LoginForm` + RHF + Zod + NextAuth client = ~28kB gzip. Acceptable.
- **Pas de lazy-load** : la page entière est sous le fold ; tout doit être prêt immédiatement.
- **ISR** : NON. Page statique côté server (`export const dynamic = 'force-static'` possible, ou `'auto'`).
- **Préchargement** : `<link rel="preload">` sur la police Cinzel + Manrope variable.

---

## 18. Sécurité

| Mesure | Implémentation |
|---|---|
| bcrypt cost 12 | `bcrypt.hash(pw, 12)` à la création, `bcrypt.compare` au login |
| No timing leak | `bcrypt.compare` **toujours** exécuté, avec `DUMMY_HASH` constant si user absent |
| Rate limit | Upstash Redis : 5 tentatives échouées par IP en 5 min. Reset au succès. |
| CSRF | NextAuth v5 gère automatiquement (cookie `next-auth.csrf-token`) |
| Cookies | `HttpOnly`, `Secure`, `SameSite=Lax`. Durée 7j (30j si remember). |
| Autocomplete | `autocomplete="username"` (email) + `autocomplete="current-password"` (mdp) |
| Honeypot | Champ `website` invisible ; non vide → rejet 200 avec délai random 600-1200ms |
| Headers sécurité | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy` strict (pas d'inline script en prod) |
| Logging | Succès → `OutboundEvent: AdminLoginSucceeded` (user, IP, UA). Échecs → log structuré + métrique compteur. |
| Pas de leak email | "Adresse e-mail ou mot de passe incorrect." identique que l'email existe ou non |

---

## 19. Checklist d'intégration (Phase 1)

### Composants à créer
- [ ] `src/components/admin/auth/AdminLoginShell.tsx` (Server)
- [ ] `src/components/admin/auth/LoginCard.tsx` (Server)
- [ ] `src/components/admin/auth/LoginForm.tsx` (Client)
- [ ] `src/components/admin/auth/EmailField.tsx` (Client)
- [ ] `src/components/admin/auth/PasswordField.tsx` (Client)
- [ ] `src/components/admin/auth/GlobalErrorAlert.tsx` (Client)
- [ ] `src/components/admin/auth/SubmitButton.tsx` (Client)
- [ ] `src/schemas/auth.ts` (Zod : loginSchema)
- [ ] `app/admin/connexion/page.tsx`
- [ ] `app/admin/connexion/layout.tsx` (override marketing layout)
- [ ] `app/admin/connexion/loading.tsx`

### NextAuth config
- [ ] `auth.ts` (config NextAuth v5) — provider Credentials + authorize() avec bcrypt + rate-limit + DUMMY_HASH
- [ ] `auth.config.ts` — callbacks JWT/Session avec `role: 'ADMIN'`
- [ ] Routes : `app/api/auth/[...nextauth]/route.ts`
- [ ] Variables env : `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `NEXTAUTH_URL`
- [ ] Cookies override durée selon `remember` (custom callback)

### Middleware
- [ ] `src/proxy.ts` — matche `/admin/*` sauf `/admin/connexion` et `/admin/mot-de-passe-oublie` → redirect login si pas de session avec `?callbackUrl=`
- [ ] Vérifie `token.role === 'ADMIN'` pour autorisation fine

### Schemas Prisma
- [ ] `User { id, email @unique, passwordHash, role, emailVerified, createdAt }` — déjà couvert
- [ ] `Account`, `Session`, `VerificationToken` — modèles NextAuth standards
- [ ] `OutboundEvent` (queue logs login)

### Rate-limit
- [ ] Helper `lib/ratelimit.ts` (Upstash) avec window 5 min, max 5 fails
- [ ] Clé `auth:fail:{ip}` + reset au succès

### Tests
- [ ] `tests/e2e/admin-login.happy.spec.ts` — login valide → redirect `/admin`
- [ ] `tests/e2e/admin-login.invalid.spec.ts` — mauvais mdp → message FR + pas de redirect
- [ ] `tests/e2e/admin-login.rate-limit.spec.ts` — 5 fails → message rate limit
- [ ] `tests/e2e/admin-login.validation.spec.ts` — formats email invalides, mdp court
- [ ] `tests/e2e/admin-login.a11y.spec.ts` — axe-core scan, focus order, aria-pressed sur toggle
- [ ] `tests/unit/auth.timing.spec.ts` — temps de réponse constant ±50ms entre user existant et inexistant

---

## 20. Fichiers sources

| Fichier | Rôle |
|---|---|
| `AdminLogin.html` | Mock HTML validé v1 — source de vérité visuelle et interactive |
| `Design System.html` | Référence DS v1.1 — tokens, composants, typo |
| `admin-login-README.md` | Ce document |

**Statut :** v1 validée, prête au portage Phase 1.
