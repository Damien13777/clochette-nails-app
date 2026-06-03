import { test, expect } from "@playwright/test";
import { setMaintenance } from "./helpers/maintenance";

test.describe.configure({ mode: "serial" });

const PUBLIC_PAGES = ["/", "/prestations", "/mentions-legales", "/confidentialite", "/cgv"];

test.describe("Smoke — pages publiques", () => {
  for (const path of PUBLIC_PAGES) {
    test(`GET ${path} → 200`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status(), `${path} doit répondre 200`).toBe(200);
    });
  }
});

test.describe("Mode maintenance", () => {
  test.afterAll(async () => {
    await setMaintenance(false); // garantit la remise à zéro même en cas d'échec
  });

  test("503 + noindex sur le public, /admin reste accessible", async ({ request }) => {
    await setMaintenance(true);

    // Le proxy met en cache 10 s → on poll jusqu'au basculement.
    await expect
      .poll(async () => (await request.get("/")).status(), {
        timeout: 15_000,
        intervals: [500, 1000, 2000],
      })
      .toBe(503);

    const res = await request.get("/");
    expect(res.status()).toBe(503);
    expect(res.headers()["x-robots-tag"]).toContain("noindex");

    // L'admin doit rester joignable pour pouvoir désactiver la maintenance.
    const admin = await request.get("/admin/connexion");
    expect(admin.status()).toBe(200);

    // Retour à la normale.
    await setMaintenance(false);
    await expect
      .poll(async () => (await request.get("/")).status(), {
        timeout: 15_000,
        intervals: [500, 1000, 2000],
      })
      .toBe(200);
  });
});
