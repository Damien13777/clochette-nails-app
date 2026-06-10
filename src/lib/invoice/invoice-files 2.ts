/**
 * Stockage des PDFs de facture — fichiers immuables, JAMAIS sous public/.
 * Racine : INVOICES_DIR (tests) ou private/uploads/invoices/ (défaut).
 * Chemins relatifs en DB ("2026/FAC-2026-0001.pdf") → portables si la racine bouge.
 */

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export function invoicesRootDir(): string {
  return (
    process.env.INVOICES_DIR ??
    path.join(process.cwd(), "private", "uploads", "invoices")
  );
}

export async function writeInvoicePdf(relPath: string, pdf: Buffer): Promise<void> {
  const abs = path.join(invoicesRootDir(), relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, pdf);
}

export async function readInvoicePdf(relPath: string): Promise<Buffer> {
  return readFile(path.join(invoicesRootDir(), relPath));
}
