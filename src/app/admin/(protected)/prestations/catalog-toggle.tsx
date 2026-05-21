/**
 * Toggle partagé "Prestations | Options" affiché en haut des pages catalogue.
 * Server Component pur.
 */

import Link from "next/link";

type Props = {
  active: "services" | "options";
};

export function CatalogToggle({ active }: Props) {
  return (
    <nav
      role="tablist"
      aria-label="Sections catalogue"
      className="inline-flex items-center gap-0.5 p-0.5 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full"
    >
      <Pill href="/admin/prestations" label="Prestations" active={active === "services"} />
      <Pill
        href="/admin/prestations/options"
        label="Options"
        active={active === "options"}
      />
    </nav>
  );
}

function Pill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-[0.06em] transition-colors ${
        active
          ? "bg-[var(--color-violet-600)] text-white"
          : "text-[var(--color-ink-700)] hover:bg-[var(--color-bone)]"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {label}
    </Link>
  );
}
