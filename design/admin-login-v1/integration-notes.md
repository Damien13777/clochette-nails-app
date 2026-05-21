# Admin Login v1 — Notes d'intégration Phase 1

Complément au `admin-login-README.md` avec les corrections d'architecture et les ajustements à appliquer lors du portage.

---

## 1. Rate-limit → in-memory, pas d'Upstash

Le README mentionne **Upstash Redis** à 6 reprises (§9 logique authorize, §11 flow, §18 sécurité, §19 checklist). **Override** : on utilise **in-memory** (décision validée Phase 0).

### Implémentation
```ts
// src/lib/rate-limit.ts (pattern Academy)
const failures = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILS = 5;
const WINDOW_MS = 5 * 60 * 1000;

export function checkAuthRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || entry.resetAt < now) {
    return { allowed: true };
  }
  if (entry.count >= MAX_FAILS) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

export function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || entry.resetAt < now) {
    failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

export function resetAuthFailures(ip: string): void {
  failures.delete(ip);
}

// Safety cap : éviter croissance non-bornée
const MAX_ENTRIES = 10_000;
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of failures) if (e.resetAt < now) failures.delete(ip);
  if (failures.size > MAX_ENTRIES) {
    // évince les plus anciennes
    const sorted = [...failures.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < failures.size - MAX_ENTRIES; i++) failures.delete(sorted[i][0]);
  }
}, 60_000);
```

### Application dans NextAuth `authorize()`
```ts
async authorize(credentials, req) {
  const ip = getIp(req);
  const rl = checkAuthRateLimit(ip);
  if (!rl.allowed) throw new AuthError(`RateLimited:${rl.retryAfterSec}`);

  const user = await prisma.user.findUnique({ where: { email: credentials.email } });
  // Toujours bcrypt.compare pour temps constant (no timing leak)
  const ok = await bcrypt.compare(credentials.password, user?.passwordHash ?? DUMMY_HASH);

  if (!ok || !user || user.role !== 'ADMIN') {
    recordAuthFailure(ip);
    throw new AuthError('CredentialsSignin');
  }
  resetAuthFailures(ip);
  return { id: user.id, email: user.email, role: user.role };
}
```

→ Aucune dépendance Upstash. Le compteur reset au redémarrage du serveur (acceptable pour mono-instance VPS, attaquant n'en bénéficie pas vu que le serveur ne redémarre pas en réaction à une attaque).

---

## 2. Route `/admin/connexion` vs `/admin/login`

Le README utilise `/admin/connexion` — **validé**, on garde les URLs en français (cohérent avec Academy : `/connexion`, `/inscription`, etc.).

---

## 3. Pattern admin-shell — à généraliser sur tous les écrans admin

Cette page établit la fondation. Le pattern à répliquer sur Dashboard, Calendrier, Bookings, etc. :

```css
/* À ajouter dans globals.css du projet Next.js */
.admin-shell {
  font-family: var(--font-ui);
  font-weight: 400;
}
.admin-shell h1, .admin-shell h2, .admin-shell h3, .admin-shell h4 {
  font-family: var(--font-serif);
}
.admin-shell .section-eyebrow,
.admin-shell .badge,
.admin-shell .btn,
.admin-shell .field-label {
  font-family: var(--font-display);
}
```

Routing du layout admin :
```
app/admin/
├── layout.tsx              ← <html className="admin-shell">, charge uniquement Cinzel + Julius + Manrope (pas Inria Serif)
├── connexion/page.tsx      ← layout override : pas de sidebar, juste la card
├── page.tsx                ← Dashboard (avec sidebar)
├── calendrier/page.tsx     ← avec sidebar
├── bookings/page.tsx
├── ...
```

`connexion/layout.tsx` override le layout admin parent pour cacher la sidebar (page anonyme).

---

## 4. Décisions naming validées

| Choix README | Action |
|---|---|
| `EmailField`, `PasswordField`, `GlobalErrorAlert`, `SubmitButton` | Adoptés tels quels |
| `AdminLoginShell` (Server) + `LoginCard` (Server) + `LoginForm` (Client) | Adopté — bon split RSC/Client |
| `loginSchema` Zod | Adopté |
| Cookies 7j default, 30j remember | Validé |

---

## 5. Endpoints API

| Endpoint | Owner | Note |
|---|---|---|
| `POST /api/auth/callback/credentials` | NextAuth | Provider Credentials standard |
| `GET /api/auth/csrf` | NextAuth | Token automatique |
| `GET /api/auth/session` | NextAuth | Vérif session |
| `app/api/auth/[...nextauth]/route.ts` | App Router catchall | Glue NextAuth v5 |

Aucun endpoint custom nécessaire pour la connexion.

---

## 6. Middleware (proxy.ts) — règles pour admin

```ts
// src/proxy.ts (extrait pour /admin)
const PROTECTED_ADMIN = '/admin';
const PUBLIC_ADMIN_ROUTES = ['/admin/connexion', '/admin/mot-de-passe-oublie'];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(PROTECTED_ADMIN) && !PUBLIC_ADMIN_ROUTES.some(r => pathname.startsWith(r))) {
    const session = await auth();
    if (!session) {
      const url = new URL('/admin/connexion', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }
  return NextResponse.next();
}
```

---

## 7. Mot de passe oublié — différé

Le README mentionne `/admin/mot-de-passe-oublie` dans la checklist. **Décision** : pas dans le scope v1 du login.

À J0 : un seul admin (Chloé). En cas d'oubli, reset manuel via script `scripts/reset-password.ts` (pattern Academy déjà existant). À ajouter au repo Phase 1.

À J+6 mois (si on active des comptes clients) : implémenter le flow complet (token email + page reset). À ce moment-là on créera `/admin/mot-de-passe-oublie` et `/admin/reset-password?token=…`.

---

## 8. Variables d'environnement attendues

```bash
# .env.local (Phase 1)
AUTH_SECRET=<générer via openssl rand -base64 32>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=http://localhost:3000   # ou https://clochette-nails.fr en prod
DATABASE_URL=postgresql://clochette_user:pwd@localhost:5432/clochette_db
```

Pas de `UPSTASH_*` (override en faveur de in-memory).

---

## 9. Logging — OutboundEvent vers Management

Le README propose `OutboundEvent: AdminLoginSucceeded` sur login réussi. À implémenter via la table `OutboundEvent` (déjà dans le schema Prisma Phase 0) :

```ts
// Après authorize() succès
await prisma.outboundEvent.create({
  data: {
    type: 'admin.login_succeeded',
    payload: {
      userId: user.id,
      email: user.email,
      ip: getIp(req),
      userAgent: req.headers.get('user-agent') ?? null,
      timestamp: new Date().toISOString(),
    },
    targetService: 'management',
    targetUrl: process.env.MANAGEMENT_WEBHOOK_URL ?? '', // null si Management pas encore déployé
    status: 'PENDING',
  },
});
```

**Si Management n'est pas encore déployé** : le worker cron `process-outbound-events` met l'event en `ABANDONED` après 5 tentatives. C'est OK — quand Management arrivera, on enverra les events historiques en bulk ou on accepte de perdre les events pré-Management.

---

## 10. Tests prioritaires

Adopter la checklist E2E du README. Priorité :

1. **happy.spec.ts** — login → redirect /admin (critique)
2. **invalid.spec.ts** — message FR + pas de redirect
3. **rate-limit.spec.ts** — 5 fails → message rate limit
4. **a11y.spec.ts** — axe-core, focus order, aria-pressed toggle
5. **timing.spec.ts** (unit) — réponse constante ±50ms entre user existant et inexistant

---

## 11. Connexion future client (J+6 mois) — préparation

Quand on activera les comptes clients :
- Créer `/connexion` (route publique, pas sous `/admin/`)
- Réutiliser `<LoginForm />` mais avec `role` côté authorize() qui retourne `'CLIENT'` au lieu de `'ADMIN'`
- Le middleware route différemment selon le role :
  - `ADMIN` → accède à `/admin/*`
  - `CLIENT` → accède à `/mon-compte/*` (à créer)
- Aucun refactor du LoginForm nécessaire — il est générique

---

**Statut** : décisions validées, override Upstash → in-memory consigné, pattern admin-shell défini.

**Sources** :
- `AdminLogin.html` — mock visuel canonique
- `admin-login-README.md` — handoff Claude Design
- `integration-notes.md` — ce document (override + pattern admin)
