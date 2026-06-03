import { test, expect } from "./base";
import { db } from "./db";
import { loginAsAdmin } from "./helpers/auth";
import { E2E_AWAITING_BOOKING_ID } from "./fixtures";

test.describe("Admin", () => {
  test("login → accès à l'espace protégé", async ({ page }) => {
    await loginAsAdmin(page);
    // La redirection hors de /connexion prouve l'auth (assert dans le helper).
  });

  test("confirmation manuelle d'une réservation AWAITING_DEPOSIT", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/bookings/${E2E_AWAITING_BOOKING_ID}`);

    await page.getByRole("button", { name: "Confirmer manuellement" }).click();

    await expect
      .poll(
        async () =>
          (await db.booking.findUnique({ where: { id: E2E_AWAITING_BOOKING_ID } }))
            ?.status,
        { timeout: 8000 },
      )
      .toBe("CONFIRMED");
  });
});
