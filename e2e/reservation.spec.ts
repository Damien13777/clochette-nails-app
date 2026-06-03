import { test, expect } from "./base";
import { db } from "./db";
import { gotoStep4 } from "./helpers/reservation";

const RESA_EMAIL = "e2e-resa@test.local";

test.describe("Réservation", () => {
  test("happy path → /reservation/succes + booking CONFIRMED", async ({ page }) => {
    await gotoStep4(page);

    await page.locator("#firstName").fill("E2E");
    await page.locator("#lastName").fill("Resa");
    await page.locator("#email").fill(RESA_EMAIL);
    await page.locator("#phone").fill("0612345678");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Continuer vers le paiement/ }).click();

    await expect(page).toHaveURL(/\/reservation\/succes/);

    await expect
      .poll(
        async () =>
          (await db.booking.findFirst({ where: { clientEmail: RESA_EMAIL } }))?.status,
        { timeout: 8000 },
      )
      .toBe("CONFIRMED");
  });

  test("validation → coordonnées manquantes affichent une erreur", async ({ page }) => {
    await gotoStep4(page);

    // On coche le consentement (active le bouton) mais on ne remplit rien.
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Continuer vers le paiement/ }).click();

    await expect(page.locator("p.field-error").first()).toBeVisible();
    await expect(page).toHaveURL(/\/reservation$/);
  });
});
