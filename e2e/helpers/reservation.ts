import { expect, type Page } from "@playwright/test";

/** Premier jour ouvré (Mar/Jeu/Ven/Sam) au moins 4 jours dans le futur. */
export function nextBookableDate(from = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + 4); // marge confortable au-delà des 72 h
  const open = new Set([2, 4, 5, 6]); // 0=Dim … 6=Sam
  while (!open.has(d.getDay())) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Parcourt les étapes 1→3 (prestation → "sans option" → date + créneau)
 * et laisse la page sur l'étape 4 (coordonnées).
 */
export async function gotoStep4(page: Page): Promise<void> {
  await page.goto("/reservation");

  // Étape 1 — prestation
  await page.getByRole("radio", { name: /Soin des mains/ }).click();
  await page.getByRole("button", { name: "Continuer" }).click();

  // Étape 2 — options (aucune compatible) → "Continuer sans option"
  await page.getByRole("button", { name: "Continuer sans option" }).click();

  // Étape 3 — calendrier : naviguer jusqu'au mois cible puis cliquer le jour
  const now = new Date();
  const target = nextBookableDate(now);
  const monthClicks =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth());
  for (let i = 0; i < monthClicks; i++) {
    await page.getByRole("button", { name: "Mois suivant" }).click();
  }
  await page
    .getByRole("gridcell", { name: String(target.getDate()), exact: true })
    .click();

  // Créneau horaire (premier dispo de la forme HH:MM)
  await page.getByRole("button", { name: /^\d{1,2}:\d{2}$/ }).first().click();

  // On doit être arrivé à l'étape 4 (champ Prénom visible)
  await expect(page.locator("#firstName")).toBeVisible();
}
