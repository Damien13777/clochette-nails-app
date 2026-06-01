/**
 * OG image par défaut du site (1200×630).
 *
 * Next.js détecte automatiquement `opengraph-image.tsx` à la racine de `src/app/`
 * et l'utilise comme image OG par défaut pour toutes les pages qui n'en
 * définissent pas une via `openGraph.images`.
 *
 * Génération programmatique via `next/og` (ImageResponse + Satori) :
 *  - Police Cinzel + Julius Sans One chargées depuis Google Fonts au build
 *  - Charte cream/violet du DS pour cohérence visuelle
 *
 * Pour remplacer par une vraie photo plus tard : supprimer ce fichier et
 * déposer `opengraph-image.png` (1200×630) à la place. Next.js fait le swap
 * automatiquement.
 */

import { ImageResponse } from "next/og";

export const alt =
  "Clochette Nails — Studio de prothésie ongulaire à Moncoutant-sur-Sèvre";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Charge une police Google Fonts en arraybuffer pour Satori.
// Le `text` permet de subsetter (réduit la taille du fichier downloadé).
async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(
    text,
  )}`;
  // IMPORTANT : ne PAS envoyer un User-Agent moderne. Avec un UA récent Google
  // sert du woff2, que Satori (next/og) ne sait pas décoder
  // (« Unsupported OpenType signature wOF2 »). Sans UA — ou avec un UA ancien —
  // l'API css2 renvoie une @font-face en TTF, seul format accepté par Satori.
  const cssRes = await fetch(url);
  const css = await cssRes.text();
  // On capture l'URL servie en format truetype/opentype (jamais woff/woff2).
  // L'URL Google est dynamique (/l/font?kit=…), sans extension de fichier :
  // on s'appuie donc sur le `format('truetype')`, pas sur l'extension.
  const match = css.match(
    /src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/,
  );
  if (!match) throw new Error(`TTF font URL not found in CSS for ${family}`);
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

export default async function OpengraphImage() {
  const brand = "CLOCHETTE NAILS";
  const slogan = "Studio de prothésie ongulaire";
  const tagline = "Moncoutant-sur-Sèvre";
  const cta = "Sur rendez-vous";
  const domain = "clochette-nails.fr";

  const [cinzel, julius] = await Promise.all([
    loadGoogleFont("Cinzel", 600, brand),
    loadGoogleFont("Julius+Sans+One", 400, slogan + tagline + cta + domain + "STUDIO·"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#FCFBF7",
          backgroundImage:
            "radial-gradient(circle at 78% 18%, rgba(94,67,146,0.10) 0%, transparent 55%), radial-gradient(circle at 18% 82%, rgba(233,191,196,0.14) 0%, transparent 55%)",
          padding: "72px 88px",
          position: "relative",
        }}
      >
        {/* Eyebrow tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            fontFamily: "Julius Sans One",
            fontSize: 22,
            letterSpacing: "0.22em",
            color: "#6B5B8C",
            textTransform: "uppercase",
          }}
        >
          <div style={{ width: 56, height: 1, backgroundColor: "#C5B5DC" }} />
          Studio · {tagline}
        </div>

        {/* Brand block */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
            marginTop: -32,
          }}
        >
          <div
            style={{
              fontFamily: "Cinzel",
              fontWeight: 600,
              fontSize: 124,
              letterSpacing: "0.04em",
              color: "#2D1F4D",
              lineHeight: 1,
            }}
          >
            {brand}
          </div>
          <div
            style={{
              fontFamily: "Julius Sans One",
              fontSize: 40,
              color: "#5E4392",
              marginTop: 28,
              letterSpacing: "0.04em",
            }}
          >
            {slogan}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 26,
            borderTop: "1px solid #E5D9F2",
            fontFamily: "Julius Sans One",
            fontSize: 22,
            color: "#6B5B8C",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <div>{cta}</div>
          <div>{domain}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Cinzel", data: cinzel, weight: 600, style: "normal" },
        { name: "Julius Sans One", data: julius, weight: 400, style: "normal" },
      ],
    },
  );
}
