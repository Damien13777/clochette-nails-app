/**
 * Sanitize HTML produit par TipTap (côté admin) avant rendu sur le site
 * public via `dangerouslySetInnerHTML`. Empêche XSS si un admin malicieux
 * (ou un copier-coller depuis une source corrompue) injecte du code.
 *
 * Politique :
 *  - Tags whitelist orientée contenu rich text (titres, liens, listes, images…)
 *  - Attrs whitelist limitée (href, src, alt, target, rel, class pour TipTap)
 *  - target="_blank" force rel="noopener noreferrer"
 */

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "figure",
  "figcaption",
  "code",
  "pre",
  "hr",
  "span",
  "div",
];

const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "target",
  "rel",
  "class",
  "style", // pour text-align inline (TipTap émet style="text-align: …")
  "width", // pour redimensionnement images inline (S/M/L/Full)
];

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Force noopener+noreferrer sur les liens externes target=_blank
    ADD_ATTR: ["target"],
  });
}
