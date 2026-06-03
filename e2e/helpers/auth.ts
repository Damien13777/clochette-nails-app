import { type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../fixtures";

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/admin/connexion");
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  // Succès = on QUITTE la page de connexion (redirection vers l'espace admin).
  // NB : ne pas tester "/admin" tout court — /admin/connexion matcherait aussi.
  await page.waitForURL(
    (url) => url.pathname.startsWith("/admin") && !url.pathname.includes("/connexion"),
    { timeout: 15_000 },
  );
}
