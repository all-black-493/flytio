import { sendDueDepartureReminders } from "@application/use-cases/send-departure-reminders";
import type { DueDeparture } from "@domain/reminders/departure";
import type { DepartureReminderRepository, HtmlMailer, Logger, NotificationRepository } from "@application/ports";
import { departureReminderEmail } from "@infrastructure/mail/templates/departure-reminder";

export type ScheduledContext = {
  reminders: DepartureReminderRepository;
  notifications: NotificationRepository;
  mail: HtmlMailer;
  logger: Logger;
  frontendUrl: string;
  /** Lands in an inbox and stays there, so its links name the API version. */
  backendUrl: string;
};

/**
 * Every cron this Worker runs. One entry per schedule, matched on the cron
 * expression in wrangler.jsonc - an unrecognised one is a misconfiguration
 * worth hearing about rather than a silent no-op.
 */
export async function handleScheduled(cron: string, context: ScheduledContext): Promise<void> {
  if (cron !== DEPARTURE_SWEEP_CRON) {
    context.logger.error("no handler for this schedule", { cron });
    return;
  }

  const now = new Date();
  const sent = await sendDueDepartureReminders(
    {
      reminders: context.reminders,
      notifications: context.notifications,
      mail: context.mail,
      logger: context.logger,
      render: (departure: DueDeparture, at: Date) =>
        departureReminderEmail(departure, at, {
          bookingUrl: `${context.frontendUrl}/account/bookings/${departure.bookingId}`,
          pdfUrl: `${context.backendUrl}/api/v1/booking/flight-orders/by-id/${departure.bookingId}/itinerary.pdf`,
          logoUrl: `${context.frontendUrl}/logo-email.png`,
        }),
    },
    now,
  );

  if (sent) context.logger.info("departure reminders sent", { sent });
}

/**
 * Every fifteen minutes, which is also the sweep's worst-case lateness: a
 * reminder goes out somewhere in [3h, 3h15m] before departure and never
 * after it, so "at least 3 hours" holds and "about 3 hours" stays honest.
 *
 * Not every five, because the database is serverless and bills for time it
 * is awake - a sweep that often would hold the compute on around the clock
 * for the sake of a handful of emails a day.
 */
export const DEPARTURE_SWEEP_CRON = "*/15 * * * *";
