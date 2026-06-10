/**
 * JSON-LD `BeautySalon` enrichi — Server Component.
 *
 * Conçu pour maximiser le ranking dans le pack local Google Maps + Knowledge
 * Graph. Tous les champs qui boostent le SEO local sont remplis :
 *  - geo (lat/lng) + hasMap → précision Google Maps
 *  - areaServed → étend le rayon de matching (villes voisines)
 *  - knowsAbout → spécialités matchées sur les recherches longues
 *  - hasOfferCatalog → catalogue structuré avec liens vers les pages prestations
 *  - founder + employee (Chloé Girard) → entité nommée
 *  - additionalType (Wikidata Q282990) → désambiguïsation
 *  - image[] dynamique depuis les photos portfolio en DB
 *
 * Champs métier édités via /admin/parametres (loadEmailGlobals) :
 *  - telephone, email
 *
 * À mettre à jour si :
 *  - Nouvelle adresse / horaires → constantes en haut du fichier
 *  - Nouveaux services majeurs → ajouter à OFFER_CATALOG
 *  - Coords précises (lat/lng) → remplacer GEO_LAT/GEO_LNG par les
 *    valeurs Google Maps de l'adresse exacte (click droit sur le pin →
 *    "Quelles sont les coordonnées ?")
 */

import { safeJsonLd } from "@/lib/jsonld";
import { loadEmailGlobals } from "@/lib/email/globals";
import { prisma } from "@/lib/prisma";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";

// ── Constantes salon ─────────────────────────────────────────

const ADDRESS = {
  street: "1 La Cournolière",
  locality: "Moncoutant-sur-Sèvre",
  postalCode: "79320",
  region: "Nouvelle-Aquitaine",
  country: "FR",
};

// Coordonnées GPS exactes de 1 La Cournolière (relevées sur Google Maps).
const GEO_LAT = 46.7457435;
const GEO_LNG = -0.6028939;

const FOUNDER_NAME = "Chloé Girard";
const SLOGAN = "Studio de prothésie ongulaire — sur rendez-vous, en cabine privée.";

const OPENING_HOURS = [
  // Lundi, Mardi, Jeudi, Vendredi, Samedi : 8h-20h
  {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Thursday", "Friday", "Saturday"],
    opens: "08:00",
    closes: "20:00",
  },
  // Mercredi fermé → on l'omet du Schema (la pratique standard)
  // Dimanche fermé → idem (omis)
];

// Zone géographique servie — pyramide local → départemental → régional.
// Schema.org accepte un mélange de City + AdministrativeArea pour étendre
// la portée du référencement. Trop de villes = spam pour Google, on cible
// le bassin de chalandise réel (~30-45 min de route).
const AREA_SERVED_CITIES = [
  // Bocage bressuirais et alentours immédiats
  "Moncoutant-sur-Sèvre",
  "Cerizay",
  "Bressuire",
  "Mauléon",
  "Pouzauges",
  "Argentonnay",
  "La Forêt-sur-Sèvre",
  "Châtillon-sur-Thouet",
  // Élargissement ~45 min
  "Parthenay",
  "Thouars",
  "Cholet",
  "Niort",
];

const AREA_SERVED_ADMIN = [
  // Département + région pour la couverture étendue
  { type: "AdministrativeArea", name: "Deux-Sèvres" },
  { type: "AdministrativeArea", name: "Vendée" }, // limitrophe ouest
  { type: "AdministrativeArea", name: "Maine-et-Loire" }, // limitrophe nord
  { type: "AdministrativeArea", name: "Nouvelle-Aquitaine" },
  { type: "AdministrativeArea", name: "Pays de la Loire" }, // région voisine
];

// Spécialités du salon — match sur les longues queues
// ("prothésiste ongulaire manucure russe Moncoutant").
const KNOWS_ABOUT = [
  "Prothésie ongulaire",
  "Manucure russe",
  "Pose semi-permanente",
  "Rallongement gel",
  "Rallongement résine",
  "Nail art",
  "Soin des mains",
  "Soin des pieds",
  "Pédicure",
  "Babyboomer",
  "French manucure",
];

// Catalogue de services structuré (avec URLs vers les pages prestations).
// Format `OfferCatalog` est mieux indexé que `makesOffer` plat.
const OFFER_CATALOG = {
  "@type": "OfferCatalog",
  name: "Prestations Clochette Nails",
  itemListElement: [
    {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Pose semi-permanente",
        url: `${SITE_URL}/prestations`,
        serviceType: "Manucure",
      },
    },
    {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Rallongement gel ou résine",
        url: `${SITE_URL}/prestations`,
        serviceType: "Prothésie ongulaire",
      },
    },
    {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Soin des mains",
        url: `${SITE_URL}/prestations`,
        serviceType: "Manucure",
      },
    },
    {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Soin des pieds",
        url: `${SITE_URL}/prestations`,
        serviceType: "Pédicure",
      },
    },
    {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Nail art",
        url: `${SITE_URL}/prestations`,
        serviceType: "Manucure",
      },
    },
  ],
};

// ── Composant ────────────────────────────────────────────────

export async function LocalBusinessJsonLd() {
  const [globals, portfolioPhotos] = await Promise.all([
    loadEmailGlobals(),
    // Récupère 1-3 photos featured (portfolio) pour enrichir le champ image
    prisma.servicePhoto
      .findMany({
        where: { featured: true },
        select: { url: true },
        orderBy: { displayOrder: "asc" },
        take: 3,
      })
      .catch(() => []),
  ]);

  const images = portfolioPhotos.length > 0
    ? portfolioPhotos.map((p) => `${SITE_URL}${p.url}`)
    : [`${SITE_URL}/hero-desktop.webp`];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BeautySalon",
    "@id": `${SITE_URL}/#beautysalon`,
    // Désambiguïsation Wikidata "nail salon"
    additionalType: "https://www.wikidata.org/wiki/Q282990",
    name: "Clochette Nails",
    legalName: "Clochette Nails",
    alternateName: "Studio Clochette Nails",
    slogan: SLOGAN,
    description:
      "Studio de prothésie ongulaire à Moncoutant-sur-Sèvre, dans le Bocage bressuirais. Manucure russe, pose semi-permanente, rallongements gel et résine, nail-art en cabine privée, sur rendez-vous. Chloé reçoit du lundi au samedi (sauf mercredi).",
    url: SITE_URL,
    telephone: globals.contactPhone,
    email: globals.contactEmail,
    image: images,
    logo: `${SITE_URL}/logo.png`,
    priceRange: "€€",
    currenciesAccepted: "EUR",
    paymentAccepted: "Cash, Credit Card, Visa, Mastercard, Bank Transfer",
    inLanguage: "fr-FR",
    smokingAllowed: false,
    isAccessibleForFree: false,
    address: {
      "@type": "PostalAddress",
      streetAddress: ADDRESS.street,
      addressLocality: ADDRESS.locality,
      postalCode: ADDRESS.postalCode,
      addressRegion: ADDRESS.region,
      addressCountry: ADDRESS.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: GEO_LAT,
      longitude: GEO_LNG,
    },
    hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${ADDRESS.street}, ${ADDRESS.postalCode} ${ADDRESS.locality}`,
    )}`,
    openingHoursSpecification: OPENING_HOURS,
    areaServed: [
      ...AREA_SERVED_CITIES.map((name) => ({ "@type": "City", name })),
      ...AREA_SERVED_ADMIN.map((a) => ({ "@type": a.type, name: a.name })),
    ],
    knowsAbout: KNOWS_ABOUT,
    hasOfferCatalog: OFFER_CATALOG,
    founder: {
      "@type": "Person",
      name: FOUNDER_NAME,
      jobTitle: "Prothésiste ongulaire",
      worksFor: { "@id": `${SITE_URL}/#beautysalon` },
    },
    employee: {
      "@type": "Person",
      name: FOUNDER_NAME,
      jobTitle: "Prothésiste ongulaire",
    },
    sameAs: ["https://www.instagram.com/clochette_nails_79/"],
    potentialAction: {
      "@type": "ReserveAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/reservation`,
        actionPlatform: [
          "https://schema.org/DesktopWebPlatform",
          "https://schema.org/MobileWebPlatform",
        ],
      },
      result: {
        "@type": "Reservation",
        name: "Rendez-vous Clochette Nails",
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
    />
  );
}
