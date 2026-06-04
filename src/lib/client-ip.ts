/**
 * Extraction de l'IP cliente réelle derrière le reverse-proxy.
 *
 * SÉCURITÉ — on prend le DERNIER maillon de `X-Forwarded-For`, jamais le
 * premier. Nginx (notre proxy de confiance, en façade) ajoute l'IP réelle
 * EN FIN de chaîne via `$proxy_add_x_forwarded_for`. Un client peut
 * pré-remplir le début de l'en-tête mais jamais ce dernier maillon → la
 * valeur retenue est non-spoofable tant qu'un seul proxy de confiance est
 * en façade. Prendre `[0]` (le premier) serait contournable (bucket de
 * rate-limit neuf à chaque requête falsifiée).
 *
 * Defense-in-depth recommandée : configurer le vhost Nginx pour ÉCRASER
 * l'en-tête avec `$remote_addr` (`proxy_set_header X-Forwarded-For $remote_addr`)
 * — voir checklist déploiement. Le code reste correct dans les deux cas.
 *
 * Fallback : `x-real-ip` (posé par Nginx) puis "unknown" (dev local sans proxy).
 */
export function getClientIp(headers: Headers | null | undefined): string {
  const xff = headers?.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return headers?.get("x-real-ip")?.trim() || "unknown";
}
