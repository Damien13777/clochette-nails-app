import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";

const WEBHOOK_SECRET = "whsec_test_dummy";

// Chargés dynamiquement APRÈS stubEnv (constantes env-at-module-load :
// la route lit STRIPE_WEBHOOK_SECRET et @/lib/stripe lit STRIPE_SECRET_KEY
// à l'import — sinon ils captent les valeurs vides de .env.test).
let POST: (req: Request) => Promise<Response>;
let stripe: Stripe;

beforeAll(async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  ({ POST } = (await import("@/app/api/webhooks/stripe/route")) as {
    POST: (req: Request) => Promise<Response>;
  });
  const mod = await import("@/lib/stripe");
  stripe = mod.stripe as Stripe; // non-null car STRIPE_SECRET_KEY stubbée
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

beforeEach(truncateAll);

async function makeAwaitingBooking() {
  const rand = randomUUID().slice(0, 8);
  const service = await db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Soin",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: 30,
      priceCents: 2500,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
  return db.booking.create({
    data: {
      date: new Date(),
      startTime: "10:00",
      endTime: "10:30",
      serviceId: service.id,
      clientFirstName: "Test",
      clientLastName: "Client",
      clientEmail: "client@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes: 30,
      totalPriceCents: 2500,
      depositCents: 750,
      status: "AWAITING_DEPOSIT",
    },
  });
}

function signedRequest(eventId: string, bookingId: string): Request {
  const event = {
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_${eventId}`,
        object: "checkout.session",
        metadata: { type: "booking", bookingId },
        payment_intent: `pi_test_${eventId}`,
        amount_total: 750,
        customer_details: { email: "client@test.local" },
      },
    },
  };
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": signature, "content-type": "application/json" },
  });
}

describe("Webhook Stripe — idempotence sur rejeu", () => {
  it("le même event.id rejoué ne confirme la booking qu'une fois", async () => {
    const booking = await makeAwaitingBooking();
    const eventId = "evt_test_replay";

    const res1 = await POST(signedRequest(eventId, booking.id));
    expect(res1.status).toBe(200);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("CONFIRMED");
    expect(await db.stripeEvent.count({ where: { id: eventId } })).toBe(1);

    const res2 = await POST(signedRequest(eventId, booking.id));
    expect(res2.status).toBe(200);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("CONFIRMED");
    expect(await db.stripeEvent.count({ where: { id: eventId } })).toBe(1);
  });

  it("signature invalide → 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ id: "evt_x" }),
        headers: {
          "stripe-signature": "t=1,v1=deadbeef",
          "content-type": "application/json",
        },
      }),
    );
    expect(res.status).toBe(400);
  });
});
