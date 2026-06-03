/**
 * Page de maintenance autoportante (HTML + CSS inline) renvoyée par le proxy
 * avec un HTTP 503 quand `maintenanceMode` est actif.
 *
 * Autoportante par choix : elle ne dépend ni du bundle CSS, ni des polices
 * next/font, ni d'un layout React — elle s'affiche même si le reste du build
 * est indisponible. C'est la bonne pratique pour une page de maintenance.
 * Le logo provient de /public/brand (laissé passer par le proxy = asset statique).
 *
 * Le message est éditable depuis /admin/parametres (PlatformSettings).
 */

const DEFAULT_MESSAGE =
  "Notre site est momentanément indisponible, le temps de quelques améliorations. Nous serons de retour très vite — merci de votre patience.";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMaintenancePage(message?: string | null): string {
  const body = escapeHtml((message ?? "").trim() || DEFAULT_MESSAGE);

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#5E4392">
<title>Site en maintenance · Clochette Nails</title>
<style>
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;background:#FCFBF7;color:#2A2A2A;line-height:1.6;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    display:flex;align-items:center;justify-content:center;padding:2.5rem 1.5rem}
  .card{max-width:30rem;text-align:center}
  .logo{height:4rem;width:auto;margin:0 auto 2.5rem;display:block}
  .eyebrow{margin:0;font-size:.75rem;text-transform:uppercase;letter-spacing:.22em;color:#5E4392}
  h1{margin:1rem 0 0;font-family:Georgia,"Times New Roman",serif;font-weight:500;
    font-size:clamp(1.75rem,4vw,2.5rem);line-height:1.15}
  p.msg{margin:1.25rem 0 0;font-size:1rem;color:#4a3f44}
  .rule{width:2.5rem;height:1px;background:#ece1f3;border:0;margin:2rem auto 0}
</style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/brand/lockup-horizontal-couleur.svg" alt="Clochette Nails">
    <p class="eyebrow">Un instant&hellip;</p>
    <h1>Site en maintenance</h1>
    <p class="msg">${body}</p>
    <hr class="rule">
  </main>
</body>
</html>`;
}
