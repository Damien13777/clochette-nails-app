import { describe, it, expect } from "vitest";
import { buildBookingReviewRequestEmail } from "@/lib/email/templates/booking-review-request";

describe("buildBookingReviewRequestEmail", () => {
  const reviewUrl = "https://g.page/r/ABC123/review";
  const email = buildBookingReviewRequestEmail({
    clientFirstName: "Camille",
    serviceTitle: "Pose semi-permanente",
    reviewUrl,
  });

  it("met le prénom et un sujet non vide", () => {
    expect(email.subject.length).toBeGreaterThan(5);
    expect(email.html).toContain("Camille");
    expect(email.text).toContain("Camille");
  });

  it("contient le lien d'avis Google dans le bouton HTML et le texte", () => {
    expect(email.html).toContain(`href="${reviewUrl}"`);
    expect(email.text).toContain(reviewUrl);
  });

  it("garde le token {{signature}} pour substitution par sendEmail", () => {
    expect(email.html).toContain("{{signature}}");
  });
});
