import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, truncateAll } from "../e2e/db";
import { dispatchPendingOutbound } from "@/lib/outbound/dispatch";

const SITE = "clochette-nails";
const SECRET = "test-secret";
const NOW = new Date("2026-07-01T12:00:00.000Z");

function mockFetch(status: number, body = "") {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (status === 0) throw new Error("network down");
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

async function makeEvent(overrides: Record<string, unknown> = {}) {
  return db.outboundEvent.create({
    data: {
      type: "booking.confirmed",
      payload: { bookingId: "b1" },
      targetUrl: "http://erp.test",
      nextAttemptAt: NOW, // dû à l'instant figé du test
      ...overrides,
    },
  });
}

const dispatch = (fetchImpl: typeof fetch) =>
  dispatchPendingOutbound({ db, fetchImpl, now: NOW, siteId: SITE, secret: SECRET });

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("dispatchPendingOutbound", () => {
  it("livre un event (2xx → DELIVERED) avec URL, signature et enveloppe correctes", async () => {
    const ev = await makeEvent();
    const { impl, calls } = mockFetch(201);

    const res = await dispatch(impl);
    expect(res).toMatchObject({ processed: 1, delivered: 1 });

    const row = await db.outboundEvent.findUnique({ where: { id: ev.id } });
    expect(row?.status).toBe("DELIVERED");
    expect(row?.deliveredAt).not.toBeNull();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`http://erp.test/api/v1/incoming/${SITE}`);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-cn-site-id"]).toBe(SITE);
    expect(headers["x-cn-signature"]).toMatch(/^t=\d+,v1=.+/);

    const envelope = JSON.parse(calls[0].init.body as string);
    expect(envelope.event).toBe("booking.confirmed");
    expect(envelope.eventId).toBe(ev.id); // eventId null → on signe avec l'id
    expect(envelope.data).toEqual({ bookingId: "b1" });
  });

  it("5xx → retry avec backoff (attempts++ , nextAttemptAt repoussé, reste PENDING)", async () => {
    const ev = await makeEvent();
    const res = await dispatch(mockFetch(500).impl);
    expect(res).toMatchObject({ retried: 1 });

    const row = await db.outboundEvent.findUnique({ where: { id: ev.id } });
    expect(row?.status).toBe("PENDING");
    expect(row?.attempts).toBe(1);
    expect(row!.nextAttemptAt.getTime()).toBe(NOW.getTime() + 5 * 60_000);
  });

  it("4xx → ABANDONED (non rejouable)", async () => {
    const ev = await makeEvent();
    await dispatch(mockFetch(400, "bad").impl);
    const row = await db.outboundEvent.findUnique({ where: { id: ev.id } });
    expect(row?.status).toBe("ABANDONED");
  });

  it("dernière tentative + 5xx → ABANDONED", async () => {
    const ev = await makeEvent({ attempts: 4 }); // maxAttempts=5 par défaut
    await dispatch(mockFetch(503).impl);
    const row = await db.outboundEvent.findUnique({ where: { id: ev.id } });
    expect(row?.status).toBe("ABANDONED");
    expect(row?.attempts).toBe(5);
  });

  it("ignore les events programmés dans le futur", async () => {
    await makeEvent({ nextAttemptAt: new Date(NOW.getTime() + 60 * 60_000) });
    const { impl, calls } = mockFetch(201);
    const res = await dispatch(impl);
    expect(res.processed).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
