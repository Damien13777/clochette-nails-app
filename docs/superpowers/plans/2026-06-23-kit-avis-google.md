# Kit d'avis Google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au salon de solliciter des avis Google via un e-mail opt-in après un RDV honoré + un lien permanent sur la landing, le tout piloté par un réglage unique `googleReviewUrl`.

**Architecture:** Un champ `PlatformSettings.googleReviewUrl` est la source de vérité, lu par l'e-mail (déclenché best-effort dans `markBookingCompleted` via une case cochée par défaut) et par la landing. Garde-fou : pas de 2ᵉ demande au même e-mail sous 120 jours (`Booking.reviewRequestSentAt`). Aucune capture in-app de l'avis.

**Tech Stack:** Next.js 16 (Server Actions), Prisma 7 + Postgres, Resend (via `sendEmail`), Vitest. Spec : `docs/superpowers/specs/2026-06-23-kit-avis-google-design.md`.

---

## Structure des fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `prisma/schema.prisma` | +`PlatformSettings.googleReviewUrl`, +`Booking.reviewRequestSentAt` | Modifier |
| `src/lib/email/templates/booking-review-request.ts` | Template e-mail de demande d'avis | Créer |
| `src/lib/actions/booking-admin.ts` | Déclenchement opt-in dans `markBookingCompleted` | Modifier |
| `src/app/admin/(protected)/parametres/avis/...` + action testimonials | Champ d'édition `googleReviewUrl` | Modifier |
| `src/app/admin/(protected)/bookings/[id]/booking-actions.tsx` | Case « Demander un avis » dans la modale honoré | Modifier |
| `src/app/admin/(protected)/bookings/[id]/page.tsx` | Passe `googleReviewUrl` à `<BookingActions>` | Modifier |
| `src/components/landing/testimonials-section.tsx` (+ page landing) | Bouton CTA « Laissez votre avis » | Modifier |
| `test/booking-review-email.test.ts` | Test du template | Créer |
| `test/booking-review-request.test.ts` | Test du déclenchement (envoi/skip) | Créer |

---

### Task 1 : Schéma — champs `googleReviewUrl` + `reviewRequestSentAt`

**Files:**
- Modify: `prisma/schema.prisma` (modèles `PlatformSettings` et `Booking`)

- [ ] **Step 1 : Ajouter le champ `googleReviewUrl` à `PlatformSettings`**

Sous le champ `testimonialsGoogleLine` (section « Avis clientes (landing) ») :

```prisma
  // Avis clientes (landing)
  /// Ligne agrégat externe affichée sous le titre de la section avis,
  /// ex : "4,9 / 5 · 87 avis Google". Vide/null = masquée.
  testimonialsGoogleLine String?
  /// Lien court d'avis Google (ex : https://g.page/r/.../review). Source de
  /// vérité du kit d'avis : e-mail de demande + CTA landing. Vide = masqué.
  googleReviewUrl        String?
```

- [ ] **Step 2 : Ajouter `reviewRequestSentAt` au modèle `Booking`**

À côté des champs de rappel (`reminderJ7SentAt` / `reminderJ1SentAt`) :

```prisma
  /// Horodatage de la dernière demande d'avis Google envoyée pour ce RDV.
  /// Sert au garde-fou anti-relance (120 j, par e-mail cliente) + traçabilité.
  reviewRequestSentAt DateTime?
```

- [ ] **Step 3 : Pousser le schéma + régénérer le client**

Run: `pnpm db:push && pnpm db:generate`
Expected : « Your database is now in sync with your Prisma schema » + client régénéré (pas d'erreur de type).

- [ ] **Step 4 : Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(avis): schéma googleReviewUrl + reviewRequestSentAt"
```

---

### Task 2 : Template e-mail de demande d'avis (TDD)

**Files:**
- Create: `src/lib/email/templates/booking-review-request.ts`
- Create: `test/booking-review-email.test.ts`

- [ ] **Step 1 : Écrire le test (qui échoue)**

`test/booking-review-email.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { buildBookingReviewRequestEmail } from "@/lib/email/templates/booking-review-request";

describe("buildBookingReviewRequestEmail", () => {
  const reviewUrl = "https://g.page/r/ABC123/review";
  const email = buildBookingReviewRequestEmail({
    clientFirstName: "Camille",
    serviceTitle: "Pose semi-permanente",
    reviewUrl,
  });

  it("met le prénom et un sujet non vide", () => {
    expect(email.subject.length).toBeGreaterThan(5);
    expect(email.html).toContain("Camille");
    expect(email.text).toContain("Camille");
  });

  it("contient le lien d'avis Google dans le bouton HTML et le texte", () => {
    expect(email.html).toContain(`href="${reviewUrl}"`);
    expect(email.text).toContain(reviewUrl);
  });

  it("garde le token {{signature}} pour substitution par sendEmail", () => {
    expect(email.html).toContain("{{signature}}");
  });
});
```

- [ ] **Step 2 : Lancer le test → échoue**

Run: `pnpm test booking-review-email`
Expected: FAIL (`buildBookingReviewRequestEmail` introuvable / module manquant).

- [ ] **Step 3 : Implémenter le template** (mirror exact de `gift-card-depleted.ts`)

`src/lib/email/templates/booking-review-request.ts` :

```ts
/**
 * Email de demande d'avis Google, envoyé (opt-in) à la cliente après un RDV
 * honoré. Ton chaleureux, sans pression. Un seul CTA vers le lien d'avis Google.
 */

import { COLORS, emailLayout, escapeHtml } from "./layout";

export type BookingReviewRequestInput = {
  clientFirstName: string;
  serviceTitle: string;
  /** Lien court d'avis Google (PlatformSettings.googleReviewUrl). */
  reviewUrl: string;
};

export function buildBookingReviewRequestEmail(input: BookingReviewRequestInput) {
  const subject = "Comment s'est passé votre rendez-vous ? 🌸";

  const text = [
    `Bonjour ${input.clientFirstName},`,
    ``,
    `Merci d'être venue pour votre ${input.serviceTitle} !`,
    ``,
    `Votre avis compte énormément pour un petit salon comme le nôtre.`,
    `Si vous avez deux minutes, un mot sur Google fait toute la différence :`,
    input.reviewUrl,
    ``,
    `Merci infiniment, et à très vite,`,
    `{{signature}}`,
  ].join("\n");

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.clientFirstName)},
    </p>

    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Merci d'être venue pour votre <strong>${escapeHtml(input.serviceTitle)}</strong> !
      J'espère que vous êtes repartie ravie.
    </p>

    <div style="margin: 24px 0; padding: 18px 22px; background: ${COLORS.violet50}; border-radius: 6px; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: ${COLORS.ink700}; font-style: italic;">
        Votre avis compte énormément pour un petit salon — quelques mots sur Google
        font toute la différence.
      </p>
    </div>

    <div style="margin: 24px 0; text-align: center;">
      <a href="${input.reviewUrl}" style="display: inline-block; padding: 14px 28px; background: ${COLORS.violet600}; color: #ffffff; text-decoration: none; border-radius: 999px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em;">
        ⭐ Laisser un avis sur Google
      </a>
    </div>

    <p style="margin: 24px 0 0; font-size: 13px; color: ${COLORS.ink500}; line-height: 1.6;">
      Merci infiniment,<br/>{{signature}}
    </p>
  `;

  const html = emailLayout({
    title: "Votre avis compte",
    subtitle: input.serviceTitle,
    contentHtml,
    preheader: "Un petit mot sur Google ferait toute la différence 🌸",
  });

  return { subject, html, text };
}
```

> Note : `input.reviewUrl` vient d'un réglage admin de confiance (URL Google), on l'insère tel quel dans le `href` — ne pas l'`escapeHtml` (ça casserait les `&` d'une éventuelle query).

- [ ] **Step 4 : Lancer le test → passe**

Run: `pnpm test booking-review-email`
Expected: PASS (3 tests verts).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/email/templates/booking-review-request.ts test/booking-review-email.test.ts
git commit -m "feat(avis): template email de demande d'avis Google"
```

---

### Task 3 : Déclenchement opt-in dans `markBookingCompleted` (TDD)

**Files:**
- Modify: `src/lib/actions/booking-admin.ts` (type `MarkCompletedInput` ~ligne 63 ; select booking ~ligne 122 ; après le bloc facture ~ligne 215)
- Create: `test/booking-review-request.test.ts`

- [ ] **Step 1 : Écrire le helper testable + son test**

Pour rester testable sans mocker toute l'action, extraire la décision d'envoi dans une fonction pure dans le **même fichier** `booking-admin.ts` (exportée) :

```ts
/**
 * Décide si on envoie la demande d'avis. Pur, testable.
 * Envoi si : opt-in + URL configurée + e-mail présent et non "admin@" +
 * aucune demande à ce même e-mail dans les 120 derniers jours.
 */
export function shouldSendReviewRequest(args: {
  requestReview: boolean;
  googleReviewUrl: string | null;
  clientEmail: string | null;
  lastRequestForEmailAt: Date | null;
  now: Date;
}): boolean {
  const { requestReview, googleReviewUrl, clientEmail, lastRequestForEmailAt, now } = args;
  if (!requestReview || !googleReviewUrl || !clientEmail) return false;
  if (clientEmail.toLowerCase().startsWith("admin@")) return false;
  if (lastRequestForEmailAt) {
    const days120Ms = 120 * 24 * 60 * 60 * 1000;
    if (now.getTime() - lastRequestForEmailAt.getTime() < days120Ms) return false;
  }
  return true;
}
```

`test/booking-review-request.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { shouldSendReviewRequest } from "@/lib/actions/booking-admin";

const base = {
  requestReview: true,
  googleReviewUrl: "https://g.page/r/X/review",
  clientEmail: "camille@example.com",
  lastRequestForEmailAt: null as Date | null,
  now: new Date("2026-06-23T10:00:00Z"),
};

describe("shouldSendReviewRequest", () => {
  it("envoie quand opt-in + url + email + jamais demandé", () => {
    expect(shouldSendReviewRequest(base)).toBe(true);
  });
  it("skip si non coché", () => {
    expect(shouldSendReviewRequest({ ...base, requestReview: false })).toBe(false);
  });
  it("skip si pas d'URL", () => {
    expect(shouldSendReviewRequest({ ...base, googleReviewUrl: null })).toBe(false);
  });
  it("skip si pas d'email", () => {
    expect(shouldSendReviewRequest({ ...base, clientEmail: null })).toBe(false);
  });
  it("skip pour un email admin@", () => {
    expect(shouldSendReviewRequest({ ...base, clientEmail: "admin@clochette-nails.fr" })).toBe(false);
  });
  it("skip si déjà demandé il y a moins de 120 jours", () => {
    expect(shouldSendReviewRequest({ ...base, lastRequestForEmailAt: new Date("2026-05-01T10:00:00Z") })).toBe(false);
  });
  it("ré-autorise après 120 jours", () => {
    expect(shouldSendReviewRequest({ ...base, lastRequestForEmailAt: new Date("2026-01-01T10:00:00Z") })).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer le test → échoue**

Run: `pnpm test booking-review-request`
Expected: FAIL (`shouldSendReviewRequest` introuvable).

- [ ] **Step 3 : Ajouter le helper** (code du Step 1) en haut de `booking-admin.ts`, sous les imports.

- [ ] **Step 4 : Lancer le test → passe**

Run: `pnpm test booking-review-request`
Expected: PASS (7 tests verts).

- [ ] **Step 5 : Câbler l'envoi dans `markBookingCompleted`**

5a. Étendre `MarkCompletedInput` (après `sendInvoiceByEmail`) :

```ts
  /** Envoyer une demande d'avis Google à la cliente (opt-in, coché par défaut côté UI). */
  requestReview?: boolean;
```

5b. Étendre le `select` du booking (~ligne 122) pour disposer du prénom + de la prestation :

```ts
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      clientEmail: true,
      clientFirstName: true,
      service: { select: { title: true } },
    },
  });
```

> Vérifier les noms exacts des champs Prisma (`clientFirstName`, relation `service` → `title`). Les ajuster si le schéma diffère.

5c. Après le bloc facture (juste avant `revalidatePath`, ~ligne 216), ajouter le bloc avis (best-effort, n'altère jamais le retour de complétion) :

```ts
  let reviewNote = "";
  try {
    if (input.requestReview) {
      const settings = await prisma.platformSettings.findFirst({
        select: { googleReviewUrl: true },
      });
      const googleReviewUrl = settings?.googleReviewUrl ?? null;
      const last = booking.clientEmail
        ? await prisma.booking.findFirst({
            where: {
              clientEmail: booking.clientEmail,
              reviewRequestSentAt: { not: null },
            },
            orderBy: { reviewRequestSentAt: "desc" },
            select: { reviewRequestSentAt: true },
          })
        : null;
      const ok = shouldSendReviewRequest({
        requestReview: true,
        googleReviewUrl,
        clientEmail: booking.clientEmail,
        lastRequestForEmailAt: last?.reviewRequestSentAt ?? null,
        now: new Date(),
      });
      if (ok && googleReviewUrl && booking.clientEmail) {
        const { buildBookingReviewRequestEmail } = await import(
          "@/lib/email/templates/booking-review-request"
        );
        const mail = buildBookingReviewRequestEmail({
          clientFirstName: booking.clientFirstName ?? "",
          serviceTitle: booking.service?.title ?? "votre rendez-vous",
          reviewUrl: googleReviewUrl,
        });
        const sent = await sendEmail({
          to: booking.clientEmail,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          tag: "booking.review_request",
        });
        if (sent.ok) {
          await prisma.booking.update({
            where: { id: bookingId },
            data: { reviewRequestSentAt: new Date() },
          });
          await emitOutboundEvent("booking.review_requested", {
            bookingId,
            clientEmail: booking.clientEmail,
          });
          reviewNote = " Demande d'avis envoyée à la cliente.";
        }
      } else if (googleReviewUrl) {
        reviewNote = " Avis déjà demandé récemment à cette cliente — non renvoyé.";
      }
    }
  } catch (err) {
    console.error("[review] envoi demande d'avis échoué:", err);
  }

  revalidatePath("/admin", "layout");
  return { ok: true, message: `Réservation marquée comme honorée.${invoiceNote}${reviewNote}` };
```

> Vérifier que `sendEmail` est déjà importé dans le fichier ; sinon ajouter `import { sendEmail } from "@/lib/email/send";`.

- [ ] **Step 6 : Lancer toute la suite Vitest**

Run: `pnpm test`
Expected: PASS (toute la suite verte, dont les nouveaux tests).

- [ ] **Step 7 : Commit**

```bash
git add src/lib/actions/booking-admin.ts test/booking-review-request.test.ts
git commit -m "feat(avis): déclenchement opt-in de la demande d'avis au markCompleted (garde-fou 120j)"
```

---

### Task 4 : Réglage `googleReviewUrl` dans l'admin Paramètres

**Files:**
- Modify: la page + l'action qui éditent `testimonialsGoogleLine` (cf. `src/app/admin/(protected)/parametres/avis/page.tsx` et `src/lib/actions/testimonials-admin.ts`)

- [ ] **Step 1 : Repérer le pattern existant**

Run: `grep -rn "testimonialsGoogleLine" src/app/admin src/lib/actions`
Lire comment ce champ est lu (page) et écrit (action) — on **mirror exactement** ce pattern pour `googleReviewUrl`.

- [ ] **Step 2 : Ajouter le champ dans le formulaire**

Sous le champ « Ligne avis Google » de la page avis, ajouter un champ texte :
- Label : « Lien d'avis Google »
- `name="googleReviewUrl"`, type `url`, `placeholder="https://g.page/r/.../review"`
- Aide : « Dans votre fiche Google → "Demander des avis" → copiez le lien court. »
- Valeur initiale : `settings.googleReviewUrl ?? ""`

- [ ] **Step 3 : Persister dans l'action**

Dans l'action qui sauvegarde (mirror de `testimonialsGoogleLine`) :
```ts
const googleReviewUrl = String(formData.get("googleReviewUrl") ?? "").trim();
if (googleReviewUrl && !/^https:\/\//i.test(googleReviewUrl)) {
  return { ok: false, error: "Le lien d'avis doit commencer par https://", fieldErrors: { googleReviewUrl: "URL https requise." } };
}
// ... dans le prisma.platformSettings.update data :
//   googleReviewUrl: googleReviewUrl || null,
```

- [ ] **Step 4 : Vérifier (lint + types + recette)**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: 0 erreur.
Recette : `/admin/parametres/avis` → coller une URL → enregistrer → recharger → la valeur persiste.

- [ ] **Step 5 : Commit**

```bash
git add "src/app/admin/(protected)/parametres" src/lib/actions/testimonials-admin.ts
git commit -m "feat(avis): champ admin googleReviewUrl (Paramètres)"
```

---

### Task 5 : Case « Demander un avis » dans la modale honoré

**Files:**
- Modify: `src/app/admin/(protected)/bookings/[id]/booking-actions.tsx`
- Modify: `src/app/admin/(protected)/bookings/[id]/page.tsx` (passe `googleReviewUrl`)

- [ ] **Step 1 : Ajouter la prop `googleReviewUrl` au composant `BookingActions`**

Dans le type `Props` (~ligne 31) : `googleReviewUrl: string | null;`
Dans la destructuration (~ligne 61) : ajouter `googleReviewUrl,`.
Passer la valeur à `<MarkCompletedDialog ... googleReviewUrl={googleReviewUrl} />` (~ligne 325).

- [ ] **Step 2 : Étendre `MarkCompletedDialog`**

Ajouter `googleReviewUrl: string | null;` au type de props du composant (~ligne 717), et l'argument dans la signature (~ligne 708).
État (à côté de `const [sendInvoice, setSendInvoice] = useState(false);`, ~ligne 745) :
```ts
const [requestReview, setRequestReview] = useState<boolean>(!!googleReviewUrl);
```
Dans `handleSubmit` (~ligne 800), ajouter au payload :
```ts
      requestReview,
```

- [ ] **Step 3 : Rendre la case (mirror exact de la case `sendInvoice`, ~lignes 1067-1104)**

Juste sous la case facture, conditionnée à `googleReviewUrl` :
```tsx
{googleReviewUrl && (
  <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={requestReview}
      onChange={(e) => setRequestReview(e.target.checked)}
      disabled={disabled}
      className="sr-only peer"
    />
    <span
      aria-hidden="true"
      className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 grid place-items-center transition-colors ${
        requestReview
          ? "border-[var(--color-violet-600)] bg-[var(--color-violet-600)] text-white"
          : "border-[var(--color-line)] bg-[var(--color-paper)]"
      }`}
    >
      {requestReview && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
    <span>
      <span className="block text-xs uppercase tracking-[0.14em] text-[var(--color-ink-700)]" style={{ fontFamily: "var(--font-display)" }}>
        Demander un avis Google à la cliente
      </span>
      <span className="block mt-0.5 text-[11px] text-[var(--color-ink-500)]" style={{ fontFamily: "var(--font-ui)" }}>
        Un email avec le lien d'avis part immédiatement (jamais 2 fois en 120 jours).
      </span>
    </span>
  </label>
)}
```

- [ ] **Step 4 : Passer `googleReviewUrl` depuis la page détail**

Dans `bookings/[id]/page.tsx` : charger le réglage et le passer en prop.
```ts
const settings = await prisma.platformSettings.findFirst({ select: { googleReviewUrl: true } });
// ... <BookingActions ... googleReviewUrl={settings?.googleReviewUrl ?? null} />
```

- [ ] **Step 5 : Vérifier (lint + types)**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 6 : Commit**

```bash
git add "src/app/admin/(protected)/bookings/[id]/booking-actions.tsx" "src/app/admin/(protected)/bookings/[id]/page.tsx"
git commit -m "feat(avis): case opt-in 'demander un avis' dans la modale honoré"
```

---

### Task 6 : CTA « Laissez votre avis » sur la landing

**Files:**
- Modify: `src/components/landing/testimonials-section.tsx`
- Modify: la page/serveur qui rend `<TestimonialsSection>` (passe `googleReviewUrl`)

- [ ] **Step 1 : Lire le composant + sa source de données**

Run: `grep -rn "TestimonialsSection\|testimonialsGoogleLine" src`
Identifier comment `testimonialsGoogleLine` arrive jusqu'au composant (prop depuis la page serveur). On suit le même chemin pour `googleReviewUrl`.

- [ ] **Step 2 : Ajouter la prop + le bouton**

Ajouter `googleReviewUrl?: string | null;` aux props de `TestimonialsSection`. Sous la ligne Google (ou en pied de section), rendre conditionnellement :
```tsx
{googleReviewUrl && (
  <div className="text-center mt-6">
    <a
      href={googleReviewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[var(--color-violet-600)]/30 text-[var(--color-violet-700)] hover:bg-[var(--color-violet-50)] transition-colors text-xs uppercase tracking-[0.08em]"
      style={{ fontFamily: "var(--font-display)" }}
    >
      ⭐ Laissez votre avis
    </a>
  </div>
)}
```

- [ ] **Step 3 : Passer `googleReviewUrl` depuis la page serveur** (mirror de `testimonialsGoogleLine`).

- [ ] **Step 4 : Vérifier (lint + types + visuel)**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Recette : avec une `googleReviewUrl` configurée → le bouton apparaît dans la section avis et ouvre le lien Google ; URL vide → bouton masqué.

- [ ] **Step 5 : Commit**

```bash
git add src/components/landing/testimonials-section.tsx src/app
git commit -m "feat(avis): CTA 'Laissez votre avis' sur la landing"
```

---

### Task 7 : Validation finale

- [ ] **Step 1 : Suite complète**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit`
Expected: tout vert, 0 erreur.

- [ ] **Step 2 : Recette manuelle (dev)**
1. `/admin/parametres/avis` → coller une `googleReviewUrl` de test.
2. Marquer un RDV CONFIRMED de test « honoré » avec la case avis cochée → vérifier l'email reçu (bouton ⭐ → le lien).
3. Re-marquer un RDV de la **même cliente** honoré sous 120 j → message « Avis déjà demandé récemment ».
4. Vérifier le bouton « Laissez votre avis » sur la landing.
5. Vider la `googleReviewUrl` → case + bouton disparaissent.

- [ ] **Step 3 : Finaliser**
Announce: "I'm using the finishing-a-development-branch skill to complete this work."
REQUIRED SUB-SKILL: superpowers:finishing-a-development-branch.

---

## Self-review (effectuée)

- **Couverture spec** : googleReviewUrl (T1, T4) ✓ ; email opt-in + 120j + best-effort (T2, T3) ✓ ; case cochée par défaut (T5) ✓ ; CTA landing (T6) ✓ ; event sortant (T3) ✓ ; schéma (T1) ✓ ; tests (T2, T3) ✓ ; hors scope QR (non inclus) ✓.
- **Cohérence des noms** : `googleReviewUrl`, `reviewRequestSentAt`, `requestReview`, `shouldSendReviewRequest`, `buildBookingReviewRequestEmail`, tag `booking.review_request`, event `booking.review_requested` — identiques entre toutes les tâches.
- **Points à confirmer à l'exécution** (lecture des fichiers réels) : noms exacts des champs Prisma `clientFirstName` / relation `service.title` (T3-5b) ; chemin réel de l'action testimonials (T4) ; chaîne de props `testimonialsGoogleLine` → composant (T6).
