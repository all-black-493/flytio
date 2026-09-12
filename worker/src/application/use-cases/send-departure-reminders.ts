import type {
  DepartureReminderRepository,
  HtmlMailer,
  Logger,
  NotificationRepository,
} from "@application/ports";
import { LEAD_TIME_HOURS, type DueDeparture } from "@domain/reminders/departure";

export type ReminderDeps = {
  reminders: DepartureReminderRepository;
  notifications: NotificationRepository;
  mail: HtmlMailer;
  render: (departure: DueDeparture, now: Date) => { subject: string; html: string };
  logger: Logger;
};

/**
 * One sweep. Returns how many legs were reminded.
 *
 * Each leg is isolated: one traveller's bad address must not stop the rest of
 * the sweep. A leg is claimed before anything is sent and handed back if the
 * send fails, so a transient mail error costs a retry rather than the only
 * reminder that traveller was going to get.
 *
 * Unlike the rest of the mail in this service, this one is awaited: the sweep
 * has no request to outlive, and a reminder that failed has to be known about
 * so the claim can be released.
 */
export async function sendDueDepartureReminders(
  deps: ReminderDeps,
  now: Date,
): Promise<number> {
  const due = await deps.reminders.due(now, LEAD_TIME_HOURS);
  let sent = 0;

  for (const departure of due) {
    if (!(await deps.reminders.claim(departure.sliceId, now))) continue;

    try {
      const { subject, html } = deps.render(departure, now);
      await deps.mail.sendHtml({ to: departure.email, subject, html, from: "bookings" });
      sent += 1;
    } catch (error) {
      deps.logger.error("departure reminder failed, releasing the claim", {
        bookingId: departure.bookingId,
        sliceId: departure.sliceId,
        error: String(error),
      });
      await deps.reminders.release(departure.sliceId);
      continue;
    }

    // In-app as well as email: the email reaches someone who is not on the
    // site, the bell is what they see if they are. A failure here must not
    // undo an email that already went out, so the leg stays claimed.
    try {
      await deps.notifications.create({
        userId: departure.userId,
        type: "departure_reminder",
        title: `${departure.originIataCode} → ${departure.destinationIataCode} departs soon`,
        body: "Check in with the airline and head for the airport.",
        linkUrl: `/account/bookings/${departure.bookingId}`,
      });
    } catch (error) {
      deps.logger.error("departure reminder notification failed", {
        bookingId: departure.bookingId,
        error: String(error),
      });
    }
  }

  return sent;
}
