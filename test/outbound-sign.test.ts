import { describe, expect, it } from "vitest";
import { buildEnvelope, signCnPayload } from "@/lib/outbound/sign";

describe("signCnPayload", () => {
  const base = { ts: 1_700_000_000, siteId: "clochette-nails", rawBody: '{"a":1}' };

  it("produit un header t=..,v1=.. déterministe", () => {
    const a = signCnPayload({ ...base, secret: "s" });
    const b = signCnPayload({ ...base, secret: "s" });
    expect(a).toBe(b);
    expect(a).toMatch(/^t=1700000000,v1=.+/);
  });

  it("change si le secret, le body ou le siteId change", () => {
    const ref = signCnPayload({ ...base, secret: "s" });
    expect(signCnPayload({ ...base, secret: "autre" })).not.toBe(ref);
    expect(signCnPayload({ ...base, rawBody: '{"a":2}', secret: "s" })).not.toBe(ref);
    expect(signCnPayload({ ...base, siteId: "autre", secret: "s" })).not.toBe(ref);
  });
});

describe("buildEnvelope", () => {
  it("mappe type→event et conserve les champs", () => {
    const env = buildEnvelope({
      type: "booking.confirmed",
      version: "v1",
      timestamp: "2026-07-01T10:00:00.000Z",
      siteId: "clochette-nails",
      eventId: "evt_1",
      data: { bookingId: "b1" },
    });
    expect(env).toEqual({
      event: "booking.confirmed",
      version: "v1",
      timestamp: "2026-07-01T10:00:00.000Z",
      siteId: "clochette-nails",
      eventId: "evt_1",
      data: { bookingId: "b1" },
    });
  });
});
