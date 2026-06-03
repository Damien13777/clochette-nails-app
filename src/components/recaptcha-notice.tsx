/**
 * Mention légale reCAPTCHA — obligatoire (conditions Google) dès lors que le
 * badge flottant est masqué (cf. `.grecaptcha-badge` dans globals.css).
 * À placer sous chaque formulaire protégé.
 */

export function RecaptchaNotice() {
  return (
    <p
      className="text-[11px] leading-relaxed text-[var(--color-ink-500)]"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      Ce site est protégé par reCAPTCHA — la{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-[var(--color-violet-700)]"
      >
        politique de confidentialité
      </a>{" "}
      et les{" "}
      <a
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-[var(--color-violet-700)]"
      >
        conditions
      </a>{" "}
      de Google s&apos;appliquent.
    </p>
  );
}
