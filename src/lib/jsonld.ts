/**
 * Sérialisation sûre pour les blocs JSON-LD injectés via
 * dangerouslySetInnerHTML : échappe `<` en < pour empêcher toute
 * rupture `</script>` si une donnée admin contenait du HTML.
 */

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
