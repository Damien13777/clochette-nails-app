import { test, expect } from "./base";
import { db } from "./db";
import { E2E_EBOOK_SLUG, E2E_GIFT_CODE } from "./fixtures";

const EBOOK_EMAIL = "e2e-ebook@test.local";

test.describe("Achat ebook", () => {
  test("happy path via carte cadeau (couvre 100%) → /ebooks/succes + PAID", async ({ page }) => {
    await page.goto(`/ebooks/${E2E_EBOOK_SLUG}`);

    await page.getByPlaceholder("Marie Dupont").fill("E2E Acheteur");
    await page.getByPlaceholder("marie@example.com").fill(EBOOK_EMAIL);

    await page.getByPlaceholder("GIFT-XXXX-XXXX-XXXX").fill(E2E_GIFT_CODE);
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expect(page.getByText(/Code valide/)).toBeVisible();

    await page
      .getByRole("button", { name: /Confirmer \(gratuit avec carte cadeau\)/ })
      .click();

    await expect(page).toHaveURL(/\/ebooks\/succes/);

    await expect
      .poll(
        async () =>
          (await db.ebookPurchase.findFirst({ where: { clientEmail: EBOOK_EMAIL } }))
            ?.paymentStatus,
        { timeout: 8000 },
      )
      .toBe("PAID");
  });
});

test.describe("Achat carte cadeau (dégradation gracieuse sans Stripe)", () => {
  test("submit valide → message 'paiement indisponible', pas de redirection", async ({ page }) => {
    await page.goto("/cartes-cadeau");

    await page.getByRole("button", { name: "Pour moi" }).click();
    await page.getByPlaceholder("Sophie Martin").fill("E2E Acheteur");
    await page.getByPlaceholder("sophie@exemple.fr").fill("e2e-gift@test.local");

    await page.getByRole("button", { name: /Payer .* carte bancaire/ }).click();

    await expect(page.getByText(/indisponible/i)).toBeVisible();
    await expect(page).toHaveURL(/\/cartes-cadeau$/);
  });
});
