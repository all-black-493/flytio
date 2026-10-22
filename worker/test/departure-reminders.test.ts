import { describe, expect, it, vi } from "vitest";
import { sendDueDepartureReminders } from "@application/use-cases/send-departure-reminders";
import { hoursUntil, type DueDeparture } from "@domain/reminders/departure";
import { formatFlightTime, departureReminderEmail } from "@infrastructure/mail/templates/departure-reminder";

const NOW = new Date("2026-08-10T04:00:00Z");

const DEPARTURE: DueDeparture = {
  bookingId: "b0000000-0000-4000-8000-000000000001",
  bookingReference: "CX4CQP",
  ownerName: "Kenya Airways",
  userId: "u0000000-0000-4000-8000-000000000001",
  email: "traveller@flyt.africa",
  sliceId: "50000000-0000-4000-8000-000000000001",
  originIataCode: "OSL",
  originName: "Oslo Airport, Gardermoen",
  originCityName: "Oslo",
  destinationIataCode: "JFK",
  destinationName: "John F. Kennedy International Airport",
  destinationCityName: "New York",
  departsAt: "2026-08-10T06:58:00Z",
  originTerminal: "2",
  flights: [
    {
      marketingCarrierName: "Kenya Airways",
      marketingCarrierIataCode: "KQ",
      marketingCarrierFlightNumber: "310",
      operatingCarrierName: "Kenya Airways",
      originIataCode: "OSL",
      originName: "Oslo Airport, Gardermoen",
      destinationIataCode: "JFK",
      destinationName: "John F. Kennedy International Airport",
      departingAt: "2026-08-10T06:58:00",
      arrivingAt: "2026-08-10T09:26:00",
    },
  ],
};

function deps(overrides: Partial<Parameters<typeof sendDueDepartureReminders>[0]> = {}) {
  const sent: { to: string }[] = [];
  const notified: { userId: string }[] = [];
  return {
    sent,
    notified,
    deps: {
      reminders: {
        due: async () => [DEPARTURE],
        claim: vi.fn(async () => true),
        release: vi.fn(async () => {}),
      },
      notifications: { create: vi.fn(async (n: { userId: string }) => void notified.push(n)) },
      mail: { sendHtml: vi.fn(async (m: { to: string }) => void sent.push(m)) },
      render: () => ({ subject: "s", html: "<p>h</p>" }),
      logger: { info: () => {}, error: () => {} },
      ...overrides,
    } as Parameters<typeof sendDueDepartureReminders>[0],
  };
}

describe("the sweep", () => {
  it("emails and notifies a traveller whose leg is due", async () => {
    const { deps: d, sent, notified } = deps();
    expect(await sendDueDepartureReminders(d, NOW)).toBe(1);
    expect(sent[0]!.to).toBe(DEPARTURE.email);
    expect(notified[0]).toMatchObject({ userId: DEPARTURE.userId, type: "departure_reminder" });
  });

  it("claims the leg before sending, so a second sweep finds nothing", async () => {
    const { deps: d, sent } = deps();
    (d.reminders.claim as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    expect(await sendDueDepartureReminders(d, NOW)).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("hands the leg back when the email fails, so the next sweep retries", async () => {
    // Otherwise one transient mail error silently costs a traveller the only
    // reminder they were ever going to get.
    const { deps: d } = deps();
    (d.mail.sendHtml as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("resend is down"));

    expect(await sendDueDepartureReminders(d, NOW)).toBe(0);
    expect(d.reminders.release).toHaveBeenCalledWith(DEPARTURE.sliceId);
  });

  it("keeps the claim when only the in-app notification fails", async () => {
    // The email already went out; releasing here would send a second one.
    const { deps: d } = deps();
    (d.notifications.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db"));

    expect(await sendDueDepartureReminders(d, NOW)).toBe(1);
    expect(d.reminders.release).not.toHaveBeenCalled();
  });

  it("keeps going after one traveller fails", async () => {
    const second = { ...DEPARTURE, sliceId: "50000000-0000-4000-8000-000000000002", email: "other@flyt.africa" };
    const { deps: d, sent } = deps({ reminders: {
      due: async () => [DEPARTURE, second],
      claim: async () => true,
      release: async () => {},
    } });
    let call = 0;
    (d.mail.sendHtml as ReturnType<typeof vi.fn>).mockImplementation(async (m: { to: string }) => {
      if (call++ === 0) throw new Error("bad address");
      sent.push(m);
    });

    expect(await sendDueDepartureReminders(d, NOW)).toBe(1);
    expect(sent[0]!.to).toBe("other@flyt.africa");
  });
});

describe("hours until departure", () => {
  it("rounds rather than floors, so 2h50m reads as three hours", () => {
    expect(hoursUntil("2026-08-10T06:50:00Z", new Date("2026-08-10T04:00:00Z"))).toBe(3);
  });

  it("never says zero hours", () => {
    expect(hoursUntil("2026-08-10T04:05:00Z", new Date("2026-08-10T04:00:00Z"))).toBe(1);
  });
});

describe("the email", () => {
  const links = { bookingUrl: "https://flyt.africa/account/bookings/b1", pdfUrl: "https://api.flyt.africa/x.pdf", logoUrl: "https://flyt.africa/logo-email.png" };

  it("formats a local time without reinterpreting it in some other zone", () => {
    // These are local at their own airport with no offset; parsing one as a
    // Date would shift it by whatever zone the runtime is in.
    expect(formatFlightTime("2026-08-10T06:58:00")).toBe("Mon, 10 Aug 2026 06:58");
  });

  it("leads with the leg, the time and the terminal", () => {
    const { subject, html } = departureReminderEmail(DEPARTURE, NOW, links);
    expect(subject).toBe("Your flight to New York leaves soon - CX4CQP");
    expect(html).toContain("Your flight leaves in about 3 hours");
    expect(html).toContain("Departs Mon, 10 Aug 2026 06:58 local time · Terminal 2");
    expect(html).toContain("Oslo (OSL)");
  });

  it("says check-in is the airline's, naming it", () => {
    expect(departureReminderEmail(DEPARTURE, NOW, links).html).toContain("Check in with Kenya Airways");
  });

  it("falls back when the airline is unknown", () => {
    const anonymous = { ...DEPARTURE, ownerName: null };
    expect(departureReminderEmail(anonymous, NOW, links).html).toContain("Check in with the airline");
  });

  it("omits the terminal when there is not one", () => {
    const { html } = departureReminderEmail({ ...DEPARTURE, originTerminal: null }, NOW, links);
    expect(html).toContain("local time");
    expect(html).not.toContain("Terminal");
  });

  it("escapes what an airline put in its own name", () => {
    const hostile = { ...DEPARTURE, ownerName: '<script>alert("x")</script>' };
    const { html } = departureReminderEmail(hostile, NOW, links);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
