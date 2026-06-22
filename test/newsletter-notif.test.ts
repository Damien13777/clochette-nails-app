import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";

// On isole la logique notif : pas d'envoi d'email welcome réel.
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => ({ ok: true, id: "test" })),
}));

import { confirmSubscription } from "@/lib/actions/newsletter";

function tok(): string {
  return randomBytes(32).toString("hex"); // 64 chars (> garde 32)
}

async function makeAdmin() {
  const rand = randomUUID().slice(0, 8);
  return db.user.create({
    data: { email: `admin-${rand}@test.local`, role: "ADMIN", isActive: true },
  });
}

async function makePendingSubscriber(email: string) {
  return db.newsletterSubscriber.create({
    data: {
      email,
      source: "footer",
      consentIp: "127.0.0.1",
      confirmToken: tok(),
      unsubscribeToken: tok(),
    },
  });
}

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("confirmSubscription — notif admin NEWSLETTER_SUBSCRIBE", () => {
  it("crée une notif admin à la confirmation d'un abonné", async () => {
    const admin = await makeAdmin();
    const sub = await makePendingSubscriber("abonnee@test.local");

    const res = await confirmSubscription(sub.confirmToken!);
    expect(res.ok).toBe(true);

    // Abonné confirmé + token consommé (single-use)
    const updated = await db.newsletterSubscriber.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(updated.confirmedAt).not.toBeNull();
    expect(updated.confirmToken).toBeNull();

    // Notif créée pour le bon admin, bon type / body / lien
    const notifs = await db.notification.findMany({
      where: { userId: admin.id },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("NEWSLETTER_SUBSCRIBE");
    expect(notifs[0].body).toBe("abonnee@test.local");
    expect(notifs[0].link).toBe("/admin/newsletter");
  });

  it("ne notifie PAS tant que l'abonné n'a pas confirmé", async () => {
    const admin = await makeAdmin();
    await makePendingSubscriber("pasconfirmee@test.local");

    // Aucune confirmation → aucune notif
    const notifs = await db.notification.findMany({
      where: { userId: admin.id },
    });
    expect(notifs).toHaveLength(0);
  });

  it("re-clic sur le lien consommé = pas de notif en double", async () => {
    const admin = await makeAdmin();
    const sub = await makePendingSubscriber("abonnee2@test.local");
    const token = sub.confirmToken!;

    await confirmSubscription(token); // 1re confirmation → 1 notif
    const res2 = await confirmSubscription(token); // token déjà consommé
    expect(res2.ok).toBe(false);

    const notifs = await db.notification.findMany({
      where: { userId: admin.id },
    });
    expect(notifs).toHaveLength(1);
  });
});
