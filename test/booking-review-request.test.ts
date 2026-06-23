import { describe, it, expect } from "vitest";
import { shouldSendReviewRequest } from "@/lib/review-request-guard";

const base = {
  requestReview: true,
  googleReviewUrl: "https://g.page/r/X/review",
  clientEmail: "camille@example.com",
  lastRequestForEmailAt: null as Date | null,
  now: new Date("2026-06-23T10:00:00Z"),
};

describe("shouldSendReviewRequest", () => {
  it("envoie quand opt-in + url + email + jamais demandé", () => {
    expect(shouldSendReviewRequest(base)).toBe(true);
  });
  it("skip si non coché", () => {
    expect(shouldSendReviewRequest({ ...base, requestReview: false })).toBe(false);
  });
  it("skip si pas d'URL", () => {
    expect(shouldSendReviewRequest({ ...base, googleReviewUrl: null })).toBe(false);
  });
  it("skip si pas d'email", () => {
    expect(shouldSendReviewRequest({ ...base, clientEmail: null })).toBe(false);
  });
  it("skip pour un email admin@", () => {
    expect(shouldSendReviewRequest({ ...base, clientEmail: "admin@clochette-nails.fr" })).toBe(false);
  });
  it("skip si déjà demandé il y a moins de 120 jours", () => {
    expect(shouldSendReviewRequest({ ...base, lastRequestForEmailAt: new Date("2026-05-01T10:00:00Z") })).toBe(false);
  });
  it("ré-autorise après 120 jours", () => {
    expect(shouldSendReviewRequest({ ...base, lastRequestForEmailAt: new Date("2026-01-01T10:00:00Z") })).toBe(true);
  });
});
