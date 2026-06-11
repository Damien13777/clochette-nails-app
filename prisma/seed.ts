/**
 * Seed script — Clochette Nails (dev only)
 *
 * Données de test minimales pour démarrer le dev :
 *  - 1 admin (Chloé) avec password "admin123" (DEV ONLY)
 *  - PlatformSettings par défaut
 *  - BusinessHours : Mar-Sam ouvert 9h-19h pause 12h30-13h30 (Lun/Mer/Dim fermé)
 *  - BookableMonth pour le mois courant + suivant
 *  - 4 prestations vedettes (POSE_NATURELS / RALLONGEMENT / SOIN_MAINS / SOIN_PIEDS)
 *  - 3 options additionnelles
 *
 * Lancer : pnpm db:seed
 * Idempotent : peut être ré-exécuté sans dupliquer.
 */

import { PrismaClient, ContentStatus, ServiceCategory, Role, DepositMode } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding Clochette Nails dev DB...\n");

  // ── 1. Admin user ────────────────────────────────────────
  const adminEmail = "chloe@clochette-nails.fr";
  const adminPassword = "admin123"; // DEV ONLY
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Chloé",
      role: Role.ADMIN,
      hashedPassword,
      isActive: true,
    },
  });
  console.log(`  ✓ Admin : ${admin.email} (mdp dev : "${adminPassword}")`);

  // ── 2. PlatformSettings ──────────────────────────────────
  const existing = await prisma.platformSettings.findFirst();
  const settings =
    existing ??
    (await prisma.platformSettings.create({
      data: {
        businessName: "Clochette Nails",
        contactEmail: "contact@clochette-nails.fr",
        depositMode: DepositMode.PERCENT,
        depositPercent: 30,
        bookingMinAdvanceHours: 72,
        bookingGranularityMinutes: 30,
      },
    }));
  console.log(`  ✓ PlatformSettings : depositMode=${settings.depositMode}, depositPercent=${settings.depositPercent}%`);

  // ── 2b. Avis clientes : reprise des 3 avis hardcodés v1 (idempotent) ─
  const settingsRow = await prisma.platformSettings.findFirstOrThrow({
    select: { id: true, testimonialsGoogleLine: true },
  });
  if (settingsRow.testimonialsGoogleLine === null) {
    await prisma.platformSettings.update({
      where: { id: settingsRow.id },
      data: { testimonialsGoogleLine: "4,9 / 5 · 87 avis Google" },
    });
  }
  if ((await prisma.testimonial.count()) === 0) {
    await prisma.testimonial.createMany({
      data: [
        {
          quote:
            "Une parenthèse hors du temps. Chloé prend soin de chaque détail, du diagnostic à la finition. Le rendu tient impeccablement 4 semaines.",
          rating: 5,
          authorName: "Marie L.",
          authorLabel: "Cliente fidèle · 2024",
          sortOrder: 0,
        },
        {
          quote:
            "Salon propre, ambiance calme, et un sens du détail qui change tout. J'ai trouvé MA prothésiste.",
          rating: 5,
          authorName: "Sophie D.",
          authorLabel: "Première visite · 2024",
          sortOrder: 1,
        },
        {
          quote:
            "Manucure russe excellente, conseils précieux pour entretenir mes ongles entre les rendez-vous. Je recommande sans réserve.",
          rating: 5,
          authorName: "Julie M.",
          authorLabel: "Cliente fidèle · 2024",
          sortOrder: 2,
        },
      ],
    });
  }
  console.log("  ✓ Testimonials : 3 avis + ligne Google");

  // ── 2c. Facturation : valeurs Clochette (éditables dans Paramètres) ─
  const invoiceDefaults = await prisma.platformSettings.findFirstOrThrow({
    select: { id: true, invoiceHeaderName: true, invoiceLegalOwner: true, invoiceLogoUrl: true },
  });
  await prisma.platformSettings.update({
    where: { id: invoiceDefaults.id },
    data: {
      invoiceHeaderName: invoiceDefaults.invoiceHeaderName ?? "CN manucure by Clochette Nails",
      invoiceLegalOwner: invoiceDefaults.invoiceLegalOwner ?? "EI Girard Chloé",
      invoiceLogoUrl: invoiceDefaults.invoiceLogoUrl ?? "/brand/lockup-horizontal-couleur.png",
    },
  });
  console.log("  ✓ Facturation : en-tête, exploitante EI, logo");

  // ── 3. BusinessHours (Mar-Sam 9h-19h, pause 12h30-13h30) ─
  // dayOfWeek : 0=Dimanche, 1=Lundi, ..., 6=Samedi
  const hoursConfig = [
    { dayOfWeek: 0, isOpen: false }, // Dim
    { dayOfWeek: 1, isOpen: false }, // Lun
    { dayOfWeek: 2, isOpen: true, openingTime: "09:00", closingTime: "19:00", breakStart: "12:30", breakEnd: "13:30" }, // Mar
    { dayOfWeek: 3, isOpen: false }, // Mer
    { dayOfWeek: 4, isOpen: true, openingTime: "09:00", closingTime: "19:00", breakStart: "12:30", breakEnd: "13:30" }, // Jeu
    { dayOfWeek: 5, isOpen: true, openingTime: "09:00", closingTime: "19:00", breakStart: "12:30", breakEnd: "13:30" }, // Ven
    { dayOfWeek: 6, isOpen: true, openingTime: "09:00", closingTime: "17:30" }, // Sam (pas de pause midi)
  ];
  for (const h of hoursConfig) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek: h.dayOfWeek },
      update: h,
      create: h,
    });
  }
  console.log("  ✓ BusinessHours : Mar/Jeu/Ven 9h-19h (pause 12h30-13h30) · Sam 9h-17h30 · Lun/Mer/Dim fermé");

  // ── 4. BookableMonth : mois courant + suivant ────────────
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  await prisma.bookableMonth.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { year, month, enabledById: admin.id },
  });
  await prisma.bookableMonth.upsert({
    where: { year_month: { year: nextYear, month: nextMonth } },
    update: {},
    create: { year: nextYear, month: nextMonth, enabledById: admin.id },
  });
  console.log(`  ✓ BookableMonth : ${year}-${String(month).padStart(2, "0")} + ${nextYear}-${String(nextMonth).padStart(2, "0")}`);

  // ── 5. Services (4 prestations vedettes) ─────────────────
  const services = [
    {
      slug: "pose-naturels-court",
      title: "Pose ongles naturels — courts",
      shortDesc: "Manucure russe + gel sur ongles naturels longueur courte. Finition mate ou brillante.",
      description: "Pose semi-permanente sur vos ongles naturels, longueur courte. Diagnostic, manucure russe minutieuse, application de la base, couleur et top coat. Tenue 3-4 semaines.",
      category: ServiceCategory.POSE_NATURELS,
      durationMinutes: 120,
      priceCents: 4500,
      displayOrder: 1,
      tags: ["semi-permanent", "naturel", "court", "gel"],
    },
    {
      slug: "pose-naturels-mi-long",
      title: "Pose ongles naturels — mi-longs",
      shortDesc: "Manucure russe + gel sur ongles naturels longueur mi-longue.",
      description: "Pose semi-permanente sur vos ongles naturels, longueur mi-longue. Pour une silhouette élégante au quotidien.",
      category: ServiceCategory.POSE_NATURELS,
      durationMinutes: 150,
      priceCents: 5500,
      displayOrder: 2,
      tags: ["semi-permanent", "naturel", "mi-long"],
    },
    {
      slug: "rallongement-mi-long",
      title: "Rallongement — mi-long",
      shortDesc: "Allongement et renforcement avec capsules. Forme libre.",
      description: "Rallongement par capsules collées, sculpture en gel, manucure russe et finition. Idéal pour une silhouette habillée durable.",
      category: ServiceCategory.RALLONGEMENT,
      durationMinutes: 210,
      priceCents: 8500,
      displayOrder: 3,
      tags: ["rallongement", "capsules", "gel"],
    },
    {
      slug: "soin-mains",
      title: "Soin des mains — Manucure russe",
      shortDesc: "Soin complet : exfoliation, repousse de cuticules, modelage, baume nourrissant.",
      description: "Une parenthèse douceur dédiée aux mains : exfoliation, manucure russe précise, modelage relaxant et hydratation profonde.",
      category: ServiceCategory.SOIN_MAINS,
      durationMinutes: 30,
      priceCents: 2500,
      displayOrder: 4,
      tags: ["soin", "manucure-russe", "mains"],
    },
  ];

  // Bootstrap UNIQUEMENT si le catalogue est vide : le vrai catalogue est
  // géré en admin, un re-seed ne doit JAMAIS ressusciter ces entrées de démo
  // (incident 10/06 : 4 prestations + 3 options obsolètes republiées).
  if ((await prisma.service.count()) === 0) {
    for (const svc of services) {
      await prisma.service.create({
        data: { ...svc, status: ContentStatus.PUBLISHED },
      });
    }
    console.log(`  ✓ Services : ${services.length} prestations vedettes créées`);
  } else {
    console.log("  ✓ Services : catalogue existant, seed démo ignoré");
  }

  // ── 6. ServiceOptions (3 options) ────────────────────────
  const options = [
    {
      slug: "nail-art-simple",
      title: "Nail-art simple",
      description: "Décoration sur 1-2 ongles : french, paillettes, motif simple.",
      addedDurationMinutes: 15,
      addedPriceCents: 1000,
      applicableCategories: [ServiceCategory.POSE_NATURELS, ServiceCategory.RALLONGEMENT],
      displayOrder: 1,
    },
    {
      slug: "reparation-ongle",
      title: "Réparation ongle cassé",
      description: "Reconstruction d'un ongle cassé, par ongle.",
      addedDurationMinutes: 15,
      addedPriceCents: 500,
      applicableCategories: [ServiceCategory.POSE_NATURELS, ServiceCategory.RALLONGEMENT],
      displayOrder: 2,
    },
    {
      slug: "depose-externe",
      title: "Dépose pose extérieure",
      description: "Dépose d'une pose précédente faite ailleurs.",
      addedDurationMinutes: 45,
      addedPriceCents: 1500,
      applicableCategories: [ServiceCategory.POSE_NATURELS, ServiceCategory.RALLONGEMENT, ServiceCategory.DEPOSE],
      displayOrder: 3,
    },
  ];

  if ((await prisma.serviceOption.count()) === 0) {
    for (const opt of options) {
      await prisma.serviceOption.create({
        data: { ...opt, status: ContentStatus.PUBLISHED },
      });
    }
    console.log(`  ✓ ServiceOptions : ${options.length} options créées`);
  } else {
    console.log("  ✓ ServiceOptions : catalogue existant, seed démo ignoré");
  }

  console.log("\n✅ Seed terminé.\n");
  console.log("─────────────────────────────────────────────────────");
  console.log(`  Admin login (dev) : ${adminEmail} / ${adminPassword}`);
  console.log(`  Connexion DB     : pnpm prisma studio`);
  console.log("─────────────────────────────────────────────────────");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("\n❌ Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
