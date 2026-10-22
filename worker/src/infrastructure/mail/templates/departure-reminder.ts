import type { DueDeparture } from "@domain/reminders/departure";
import { hoursUntil } from "@domain/reminders/departure";
import { escapeHtml, emailShell } from "@infrastructure/mail/shell";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Mon, 10 Aug 2026 06:58" - what strftime("%a, %d %b %Y %H:%M") produces,
 * and what the PDF shows, so the two agree.
 *
 * Read straight out of the string rather than through Date: these are local
 * times at their own airport with no offset, and parsing one would silently
 * reinterpret it in whatever zone the runtime happens to be in.
 */
export function formatFlightTime(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return local;

  const [, year, month, day, hour, minute] = match.map(Number) as unknown as number[];
  const weekday = DAYS[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]!;
  return `${weekday}, ${String(day).padStart(2, "0")} ${MONTHS[month! - 1]} ${year} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function locationLabel(iataCode: string, name: string | null): string {
  return escapeHtml(name ? `${name} (${iataCode})` : iataCode);
}

function segmentRow(flight: DueDeparture["flights"][number]): string {
  const carrier = [flight.marketingCarrierName || flight.marketingCarrierIataCode || "", flight.marketingCarrierFlightNumber || ""]
    .join(" ")
    .trim();

  const operated =
    flight.operatingCarrierName && flight.operatingCarrierName !== flight.marketingCarrierName
      ? `<p style="margin:4px 0 0;color:#55677c;font-size:12px;">Operated by ${escapeHtml(flight.operatingCarrierName)}</p>`
      : "";

  return `<tr>
  <td style="padding:10px 0;border-top:1px solid #eef2f6;">
    <p style="margin:0;font-weight:bold;">${escapeHtml(carrier)}</p>
    <p style="margin:4px 0 0;color:#55677c;">
      ${locationLabel(flight.originIataCode, flight.originName)} ${escapeHtml(formatFlightTime(flight.departingAt))}
      &nbsp;→&nbsp;
      ${locationLabel(flight.destinationIataCode, flight.destinationName)} ${escapeHtml(formatFlightTime(flight.arrivingAt))}
    </p>
    ${operated}
  </td>
</tr>`;
}

/**
 * Ported from templates/emails/departure_reminder.html. Scoped to one leg,
 * not the whole booking: a round trip's return leg gets its own reminder days
 * later, and showing both here would bury the one that matters today.
 */
export function departureReminderEmail(
  departure: DueDeparture,
  now: Date,
  links: { bookingUrl: string; pdfUrl: string; logoUrl: string },
): { subject: string; html: string } {
  const departureTime = formatFlightTime(departure.flights[0]?.departingAt ?? "");
  const destination = departure.destinationCityName || departure.destinationIataCode;

  const terminal = departure.originTerminal
    ? ` · Terminal ${escapeHtml(departure.originTerminal)}`
    : "";

  const content = `<h2 style="margin:0 0 4px;font-size:20px;">Your flight leaves in about ${hoursUntil(departure.departsAt, now)} hours</h2>
<p style="margin:0 0 20px;color:#55677c;">Booking reference <strong style="color:#0b1526;">${escapeHtml(departure.bookingReference)}</strong></p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;border:1px solid #d8e0e8;margin-bottom:24px;">
  <tr>
    <td style="padding:16px 20px;">
      <p style="margin:0;font-size:16px;font-weight:bold;">
        ${locationLabel(departure.originIataCode, departure.originCityName || departure.originName)}
        →
        ${locationLabel(departure.destinationIataCode, departure.destinationCityName || departure.destinationName)}
      </p>
      <p style="margin:4px 0 0;color:#55677c;">
        Departs ${escapeHtml(departureTime)} local time${terminal}
      </p>
    </td>
  </tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  ${departure.flights.map(segmentRow).join("")}
</table>

<h3 style="margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;">Before you go</h3>
<ul style="margin:0 0 24px;padding-left:20px;color:#55677c;">
  <li style="margin-bottom:6px;">Check in with ${escapeHtml(departure.ownerName || "the airline")} if you haven't - that's where your boarding pass, seat and gate come from.</li>
  <li style="margin-bottom:6px;">Carry the passport or ID you booked with.</li>
  <li>Airlines usually close check-in 45-60 minutes before departure, and earlier for international flights.</li>
</ul>

<table role="presentation" cellpadding="0" cellspacing="0">
  <tr>
    <td style="background:#ff4f00;">
      <a href="${escapeHtml(links.bookingUrl)}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:bold;text-decoration:none;">View my ticket</a>
    </td>
  </tr>
</table>
<p style="margin:16px 0 0;">
  <a href="${escapeHtml(links.pdfUrl)}" style="color:#ff4f00;">Download my ticket (PDF)</a> - one per traveller, with a QR code.
</p>`;

  return {
    subject: `Your flight to ${destination} leaves soon - ${departure.bookingReference}`,
    html: emailShell(
      `${departure.originIataCode} → ${departure.destinationIataCode} departs ${departureTime}.`,
      content,
      links.logoUrl,
    ),
  };
}
