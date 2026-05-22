/**
 * POST /api/v1/admin/search
 *
 * Recherche globale cross-entités pour la topbar admin.
 *
 * Body : { q: string }   (3 chars min, sinon 400)
 *
 * Cherche en parallèle dans :
 *  - RDV (nom + email + tel)
 *  - Contacts (nom + email + sujet)
 *  - Cartes cadeau (prefix + nom acheteuse/bénéficiaire + email)
 *  - Ebooks catalogue (titre + slug)
 *  - Ventes ebook (nom + email)
 *  - Blog (titre + slug)
 *  - Abonnées newsletter (email + nom)
 *  - Prestations (titre + slug)
 *
 * Renvoie max 5 résultats par groupe. Tri par updatedAt DESC.
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT_PER_GROUP = 5;

type SearchItem = {
  id: string;
  label: string;
  sublabel?: string;
  url: string;
};

type SearchGroup = {
  type:
    | "bookings"
    | "contacts"
    | "gift_cards"
    | "ebooks"
    | "ebook_purchases"
    | "blog"
    | "subscribers"
    | "services";
  label: string;
  items: SearchItem[];
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { q?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const q = (body.q ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ groups: [] });
  }
  if (q.length > 100) {
    return NextResponse.json({ error: "Requête trop longue" }, { status: 400 });
  }

  // Pattern Prisma insensitive contains
  const ins: Prisma.QueryMode = "insensitive";

  // Détection : la requête est-elle un montant en € ?
  // Accepte "65", "65,00", "65.50", "1234,5"
  const amountMatch = q.match(/^\s*(\d+)(?:[,.](\d{1,2}))?\s*€?\s*$/);
  let amountCentsExact: number | null = null;
  let amountCentsRange: [number, number] | null = null;
  if (amountMatch) {
    const euros = parseInt(amountMatch[1], 10);
    const decimals = amountMatch[2]
      ? parseInt(amountMatch[2].padEnd(2, "0"), 10)
      : 0;
    const exactCents = euros * 100 + decimals;
    // Si l'utilisateur a tapé les décimales → match exact
    // Sinon → range [euros × 100, euros × 100 + 100[ (tolère "65" pour 65,XX €)
    if (amountMatch[2]) {
      amountCentsExact = exactCents;
    } else {
      amountCentsRange = [euros * 100, euros * 100 + 100];
    }
  }

  // Helper : retourne la clause WHERE pour matcher un montant Int sur un champ
  function amountFilter(): Prisma.IntFilter | null {
    if (amountCentsExact !== null) return { equals: amountCentsExact };
    if (amountCentsRange !== null)
      return { gte: amountCentsRange[0], lt: amountCentsRange[1] };
    return null;
  }
  const amtF = amountFilter();

  const [
    bookings,
    contacts,
    giftCards,
    ebooks,
    ebookPurchases,
    blogPosts,
    subscribers,
    services,
  ] = await Promise.all([
    prisma.booking.findMany({
      where: {
        OR: [
          { clientFirstName: { contains: q, mode: ins } },
          { clientLastName: { contains: q, mode: ins } },
          { clientEmail: { contains: q, mode: ins } },
          { clientPhone: { contains: q, mode: ins } },
          { id: { startsWith: q } },
          ...(amtF
            ? [
                { revenueCents: amtF },
                { depositCents: amtF },
                { totalPriceCents: amtF },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        clientFirstName: true,
        clientLastName: true,
        clientEmail: true,
        date: true,
        startTime: true,
        status: true,
        totalPriceCents: true,
        depositCents: true,
        revenueCents: true,
      },
      orderBy: { updatedAt: "desc" },
      take: LIMIT_PER_GROUP,
    }),
    prisma.contactMessage.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: ins } },
          { email: { contains: q, mode: ins } },
          { subject: { contains: q, mode: ins } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT_PER_GROUP,
    }),
    prisma.giftCard.findMany({
      where: {
        OR: [
          { code: { contains: q.toUpperCase() } },
          { prefix: { contains: q.toUpperCase() } },
          { recipientName: { contains: q, mode: ins } },
          { recipientEmail: { contains: q, mode: ins } },
          { buyerName: { contains: q, mode: ins } },
          { buyerEmail: { contains: q, mode: ins } },
          { id: { startsWith: q } },
          ...(amtF
            ? [
                { initialAmountCents: amtF },
                { remainingAmountCents: amtF },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        prefix: true,
        buyerName: true,
        recipientName: true,
        recipientEmail: true,
        buyerEmail: true,
        initialAmountCents: true,
        status: true,
      },
      orderBy: { updatedAt: "desc" },
      take: LIMIT_PER_GROUP,
    }),
    prisma.ebook.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: ins } },
          { slug: { contains: q, mode: ins } },
        ],
      },
      select: { id: true, title: true, slug: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: LIMIT_PER_GROUP,
    }),
    prisma.ebookPurchase.findMany({
      where: {
        OR: [
          { clientName: { contains: q, mode: ins } },
          { clientEmail: { contains: q, mode: ins } },
          { id: { startsWith: q } },
          ...(amtF ? [{ amount: amtF }] : []),
        ],
      },
      select: {
        id: true,
        clientName: true,
        clientEmail: true,
        amount: true,
        paymentStatus: true,
        ebook: { select: { title: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: LIMIT_PER_GROUP,
    }),
    prisma.blogPost.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: ins } },
          { slug: { contains: q, mode: ins } },
        ],
      },
      select: { id: true, title: true, slug: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: LIMIT_PER_GROUP,
    }),
    prisma.newsletterSubscriber.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: ins } },
          { name: { contains: q, mode: ins } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        confirmedAt: true,
        unsubscribedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT_PER_GROUP,
    }),
    prisma.service.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: ins } },
          { slug: { contains: q, mode: ins } },
        ],
      },
      select: { id: true, title: true, slug: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: LIMIT_PER_GROUP,
    }),
  ]);

  const groups: SearchGroup[] = [];

  if (bookings.length > 0) {
    groups.push({
      type: "bookings",
      label: "Rendez-vous",
      items: bookings.map((b) => {
        const price = b.revenueCents ?? b.totalPriceCents ?? b.depositCents;
        return {
          id: b.id,
          label: `${b.clientFirstName} ${b.clientLastName}`.trim(),
          sublabel: `${formatDateFr(b.date)} ${b.startTime} · ${labelStatus(b.status)} · ${formatEuro(price)} · #${b.id.slice(0, 8)}`,
          url: `/admin/bookings/${b.id}`,
        };
      }),
    });
  }

  if (contacts.length > 0) {
    groups.push({
      type: "contacts",
      label: "Contacts",
      items: contacts.map((c) => ({
        id: c.id,
        label: `${c.name} · ${c.subject ?? "—"}`,
        sublabel: `${c.email} · ${formatDateFr(c.createdAt)}`,
        url: `/admin/contacts/${c.id}`,
      })),
    });
  }

  if (giftCards.length > 0) {
    groups.push({
      type: "gift_cards",
      label: "Cartes cadeau",
      items: giftCards.map((g) => {
        const beneficiaire = g.recipientName ?? g.buyerName;
        const email = g.recipientEmail ?? g.buyerEmail;
        return {
          id: g.id,
          label: `•${g.prefix} · ${beneficiaire}`,
          sublabel: `${(g.initialAmountCents / 100).toFixed(2).replace(".", ",")} € · ${email}`,
          url: `/admin/cartes-cadeau/${g.id}`,
        };
      }),
    });
  }

  if (ebookPurchases.length > 0) {
    groups.push({
      type: "ebook_purchases",
      label: "Ventes ebook",
      items: ebookPurchases.map((p) => ({
        id: p.id,
        label: `${p.ebook.title}`,
        sublabel: `${p.clientName ?? p.clientEmail} · ${(p.amount / 100).toFixed(2).replace(".", ",")} €`,
        url: `/admin/ebooks/ventes/${p.id}`,
      })),
    });
  }

  if (ebooks.length > 0) {
    groups.push({
      type: "ebooks",
      label: "Catalogue ebooks",
      items: ebooks.map((e) => ({
        id: e.id,
        label: e.title,
        sublabel: `/${e.slug} · ${labelStatus(e.status)}`,
        url: `/admin/ebooks/${e.id}`,
      })),
    });
  }

  if (blogPosts.length > 0) {
    groups.push({
      type: "blog",
      label: "Articles blog",
      items: blogPosts.map((p) => ({
        id: p.id,
        label: p.title,
        sublabel: `/${p.slug} · ${labelStatus(p.status)}`,
        url: `/admin/blog/${p.id}`,
      })),
    });
  }

  if (services.length > 0) {
    groups.push({
      type: "services",
      label: "Prestations",
      items: services.map((s) => ({
        id: s.id,
        label: s.title,
        sublabel: `/${s.slug} · ${labelStatus(s.status)}`,
        url: `/admin/prestations/${s.id}`,
      })),
    });
  }

  if (subscribers.length > 0) {
    groups.push({
      type: "subscribers",
      label: "Abonnées newsletter",
      items: subscribers.map((s) => {
        const status = s.unsubscribedAt
          ? "désabonnée"
          : s.confirmedAt
            ? "active"
            : "en attente";
        return {
          id: s.id,
          label: s.email,
          sublabel: s.name ? `${s.name} · ${status}` : status,
          url: `/admin/newsletter`,
        };
      }),
    });
  }

  return NextResponse.json({ groups });
}

function formatDateFr(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function labelStatus(s: string): string {
  switch (s) {
    case "DRAFT": return "brouillon";
    case "PUBLISHED": return "publié";
    case "ARCHIVED": return "archivé";
    case "ACTIVE": return "active";
    case "PARTIALLY_USED": return "partielle";
    case "FULLY_USED": return "épuisée";
    case "EXPIRED": return "expirée";
    case "CANCELLED": return "annulée";
    case "PENDING_PAYMENT": return "non payée";
    case "REFUNDED": return "remboursée";
    case "AWAITING_DEPOSIT": return "attente paiement";
    case "CONFIRMED": return "confirmé";
    case "COMPLETED": return "honoré";
    case "CANCELLED_BY_CLIENT": return "annulé cliente";
    case "CANCELLED_BY_ADMIN": return "annulé salon";
    case "NO_SHOW": return "no-show";
    default: return s.toLowerCase();
  }
}
