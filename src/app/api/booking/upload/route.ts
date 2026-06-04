/**
 * POST /api/booking/upload
 *
 * Endpoint d'upload pour les photos jointes à une réservation (Step 3 du flow
 * réservation, sous le champ "Message optionnel").
 *
 * Reçoit un multipart/form-data avec un seul fichier (champ "file").
 * On traite un fichier à la fois pour :
 *  - Donner un feedback par photo côté UI (état uploading/done/error)
 *  - Limiter la pression mémoire serveur (sharp travaille en RAM)
 *
 * Le composant client appelle cet endpoint en parallèle pour chaque photo.
 *
 * Pas d'auth (booking pas encore créé). Sécurité :
 *  - Rate limit 5 uploads / IP / minute (bucket UPLOAD partagé)
 *  - Validation MIME + taille côté serveur
 *  - UUID en nom de fichier (non-devinable)
 *  - Traitement sharp avant écriture (rejette fichiers corrompus / SVG-bombs)
 *
 * Réponse :
 *  - 200 { ok: true, file: { url, originalName, mimeType, sizeBytes } }
 *  - 4xx { ok: false, error: string }
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  UPLOAD,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";
import { processBookingFileUpload } from "@/lib/booking-files";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";
// Cap de taille réel = 5 Mo, appliqué côté serveur dans processBookingFileUpload
// (l'App Router streame le body : pas de body-parser global à régler ici).
export const maxDuration = 30; // secondes max sharp + write

export async function POST(req: Request) {
  const h = await headers();
  const ip = getClientIp(h);

  // Rate limit
  const rl = checkRateLimit(UPLOAD.bucket, ip, UPLOAD.max, UPLOAD.windowMs);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Trop d'uploads. Réessayez dans une minute.",
      },
      { status: 429 },
    );
  }
  recordRateLimit(UPLOAD.bucket, ip, UPLOAD.windowMs);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Format de requête invalide." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Aucun fichier reçu." },
      { status: 400 },
    );
  }

  const result = await processBookingFileUpload(file);

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
