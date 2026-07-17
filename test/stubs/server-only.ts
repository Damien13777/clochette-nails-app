// Stub de `server-only` pour Vitest. Next.js résout ce paquet au build (no-op côté
// serveur, throw côté client) ; en test brut (Node) il n'est pas résolvable. Ce
// module vide reproduit son comportement no-op côté serveur.
export {};
