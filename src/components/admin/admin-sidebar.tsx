"use client";

/**
 * AdminSidebar — Client Component.
 *
 * Desktop : fixe à gauche, 260px de large.
 * Mobile : drawer slide-in depuis la gauche, trigger par burger en topbar.
 * Active state : barre verticale 3px violet + bg violet-50.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ADMIN_NAV } from "@/config/admin-nav";
import { AdminIcon } from "./admin-icon";

type Props = {
  open: boolean;
  onClose: () => void;
  badges?: { bookings?: number; giftCards?: number; contacts?: number };
};

export function AdminSidebar({ open, onClose, badges = {} }: Props) {
  const pathname = usePathname();

  // Scroll lock quand drawer mobile ouvert
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc ferme le drawer
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop mobile */}
      <div
        className="lg:hidden"
        onClick={onClose}
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
          zIndex: 39,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease-out",
        }}
      />

      {/* Sidebar — mobile drawer + desktop fixe */}
      <aside
        className="flex flex-col bg-[var(--color-paper)] border-r border-[var(--color-line)]"
        aria-label="Navigation principale admin"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "260px",
          maxWidth: "85vw",
          zIndex: 40,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s cubic-bezier(.2,.7,.3,1)",
          willChange: "transform",
        }}
        data-desktop="true"
      >
        {/* Logo */}
        <div className="h-16 px-5 flex items-center border-b border-[var(--color-line)] shrink-0">
          <div className="min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/lockup-horizontal-couleur.svg"
              alt="Clochette Nails"
              className="h-11 w-auto"
            />
            <div
              className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Administration
            </div>
          </div>
        </div>

        {/* Nav scrollable */}
        <nav
          className="flex-1 overflow-y-auto py-5 px-3"
          aria-label="Sections admin"
        >
          {ADMIN_NAV.map((group) => (
            <div key={group.label} className="mb-6 last:mb-0">
              <p
                className="px-3 mb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(item.href);
                  const badge = item.badgeKey ? badges[item.badgeKey] : null;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={isActive ? "page" : undefined}
                        className={`relative flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-sm transition-colors ${
                          isActive
                            ? "bg-[var(--color-violet-50)] text-[var(--color-violet-700)]"
                            : "text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)]/60 hover:text-[var(--color-violet-700)]"
                        }`}
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        {isActive && (
                          <span
                            className="absolute left-0 top-2 bottom-2 w-[3px] bg-[var(--color-violet-600)] rounded-r"
                            aria-hidden="true"
                          />
                        )}
                        <AdminIcon name={item.icon} size={18} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge != null && badge > 0 && (
                          <span
                            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--color-warning)] text-white text-[10px]"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer sidebar */}
        <div className="px-5 py-3 border-t border-[var(--color-line)] shrink-0">
          <p
            className="text-[10px] text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            v0.1.0 · dev
          </p>
        </div>
      </aside>

      {/* Styles : sidebar TOUJOURS visible sur desktop (≥ lg) */}
      <style jsx>{`
        @media (min-width: 1024px) {
          aside[data-desktop="true"] {
            transform: translateX(0) !important;
          }
        }
      `}</style>
    </>
  );
}
