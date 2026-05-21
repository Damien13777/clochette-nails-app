"use client";

/**
 * SiteHeader — header public sticky avec backdrop blur scroll-triggered.
 *
 * Mobile : burger + drawer fullscreen (à venir Phase 1.1).
 * Desktop : logo + nav + CTA pill primary.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/#accueil", label: "Accueil" },
  { href: "/prestations", label: "Prestations" },
  { href: "/cartes-cadeau", label: "Cartes cadeau" },
  { href: "/blog", label: "Journal" },
  { href: "/ebooks", label: "Ebooks" },
  { href: "/#portfolio", label: "Portfolio" },
  { href: "/#avis", label: "Avis" },
  { href: "/#contact", label: "Contact" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) =>
      e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  // Lock scroll quand drawer ouvert
  useEffect(() => {
    if (menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [menuOpen]);

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 h-16 transition-all duration-300 ${
          scrolled
            ? "bg-[rgba(252,251,247,0.82)] backdrop-blur-md border-b border-[var(--color-line)]"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-[1240px] mx-auto px-5 lg:px-12 h-full flex items-center justify-between">
          {/* Logo + brand */}
          <Link href="/#accueil" className="flex items-center gap-3 group">
            <span
              className="w-8 h-8 rounded-full bg-[var(--color-violet-600)] grid place-items-center text-white text-sm shadow-[var(--shadow-sm)]"
              style={{ fontFamily: "var(--font-serif)" }}
              aria-hidden="true"
            >
              C
            </span>
            <span
              className="text-[15px] hidden sm:inline"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Clochette Nails
            </span>
          </Link>

          {/* Nav desktop */}
          <nav
            className="hidden md:flex items-center gap-8 text-sm"
            aria-label="Navigation principale"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative py-2 text-[var(--color-ink-700)] hover:text-[var(--color-violet-700)] transition-colors group"
              >
                {item.label}
                <span className="absolute inset-x-0 -bottom-0.5 h-px bg-[var(--color-violet-600)] scale-x-0 group-hover:scale-x-100 origin-left transition-transform" />
              </Link>
            ))}
          </nav>

          {/* CTA desktop + burger mobile */}
          <div className="flex items-center gap-2">
            <Link
              href="/reservation"
              className="hidden md:inline-flex items-center px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Prendre RDV
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="md:hidden w-11 h-11 grid place-items-center text-[var(--color-ink-900)] hover:bg-[var(--color-violet-50)] rounded-full transition-colors"
              aria-label="Ouvrir le menu"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Backdrop semi-transparent derrière le drawer */}
      <div
        className="md:hidden"
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: "rgba(26, 26, 26, 0.35)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          zIndex: 49,
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "auto" : "none",
          transition: "opacity 0.3s ease-out",
        }}
      />

      {/* Mobile menu drawer — inline styles pour bulletproof iOS Safari */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation mobile"
        aria-hidden={!menuOpen}
        className="md:hidden flex flex-col bg-[var(--color-cream)]"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(85vw, 360px)",
          maxWidth: "100vw",
          zIndex: 50,
          boxShadow: "-24px 0 60px -20px rgba(26,26,26,0.15)",
          transform: menuOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.35s cubic-bezier(.2,.7,.3,1)",
          pointerEvents: menuOpen ? "auto" : "none",
          willChange: "transform",
        }}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-[var(--color-line)] shrink-0">
          <span
            className="text-[15px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Menu
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="w-11 h-11 grid place-items-center text-[var(--color-ink-900)] hover:bg-[var(--color-violet-50)] rounded-full transition-colors"
            aria-label="Fermer le menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
        <nav
          className="flex flex-col p-6 gap-1 overflow-y-auto flex-1"
          aria-label="Menu mobile"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="py-3 text-2xl border-b border-[var(--color-line)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/reservation"
            onClick={() => setMenuOpen(false)}
            className="mt-8 inline-flex items-center justify-center px-6 py-3.5 rounded-full bg-[var(--color-violet-600)] text-white text-sm uppercase tracking-[0.06em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Prendre rendez-vous
          </Link>
        </nav>
      </div>
    </>
  );
}
