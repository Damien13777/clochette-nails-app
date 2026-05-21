"use client";

/**
 * UserMenu — dropdown avatar avec logout.
 */

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { AdminIcon } from "./admin-icon";

type Props = {
  user: { name?: string | null; email?: string | null };
};

export function UserMenu({ user }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fermer au click outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Fermer sur Esc
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  const initial = (user.name ?? user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu utilisateur — ${user.name ?? user.email}`}
        className="w-10 h-10 rounded-full bg-[var(--color-violet-100)] text-[var(--color-violet-700)] grid place-items-center hover:bg-[var(--color-violet-300)]/40 transition-colors"
        style={{ fontFamily: "var(--font-display)", fontSize: "0.875rem" }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] py-2 z-50"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          <div className="px-4 py-2 border-b border-[var(--color-line)]">
            <p className="text-sm truncate">{user.name ?? "Admin"}</p>
            <p className="text-xs text-[var(--color-ink-500)] truncate">
              {user.email}
            </p>
          </div>
          <Link
            href="/admin/parametres"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-3 px-4 py-2 text-sm text-[var(--color-ink-700)] hover:bg-[var(--color-violet-50)] transition-colors"
          >
            <AdminIcon name="settings" size={16} />
            Paramètres
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/admin/connexion" })}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--color-danger)] hover:bg-[rgba(178,58,74,0.06)] transition-colors text-left"
          >
            <AdminIcon name="log-out" size={16} />
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
