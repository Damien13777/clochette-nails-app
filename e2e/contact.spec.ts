import { test, expect } from "./base";
import { db } from "./db";

// Le formulaire de contact est rendu sur la home (section contact).
const CONTACT_EMAIL = "e2e-contact@test.local";

test.describe("Formulaire de contact", () => {
  test("happy path → message créé + accusé de réception", async ({ page }) => {
    await page.goto("/");
    const form = page.locator("form", {
      has: page.getByRole("button", { name: "Envoyer le message" }),
    });

    await form.getByLabel(/^Nom/).fill("E2E Contact");
    await form.getByLabel("Email").fill(CONTACT_EMAIL);
    await form.locator("#message").fill("Bonjour, ceci est un message de test E2E.");
    await form.getByRole("button", { name: "Envoyer le message" }).click();

    await expect(page.getByText("Merci, votre message est bien reçu.")).toBeVisible();

    await expect
      .poll(async () => db.contactMessage.count({ where: { email: CONTACT_EMAIL } }), {
        timeout: 8000,
      })
      .toBe(1);
  });

  test("validation → email invalide affiche une erreur", async ({ page }) => {
    await page.goto("/");
    const form = page.locator("form", {
      has: page.getByRole("button", { name: "Envoyer le message" }),
    });

    await form.getByLabel(/^Nom/).fill("E2E Contact");
    await form.getByLabel("Email").fill("pas-un-email");
    await form.locator("#message").fill("Message de test avec email invalide.");
    await form.getByRole("button", { name: "Envoyer le message" }).click();

    // Le serveur renvoie un fieldError → un message d'erreur apparaît,
    // et l'accusé de réception ne s'affiche pas.
    await expect(form.locator("p.field-error").first()).toBeVisible();
    await expect(page.getByText("Merci, votre message est bien reçu.")).toHaveCount(0);
  });
});
