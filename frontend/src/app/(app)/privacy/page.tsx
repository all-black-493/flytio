import Link from "next/link";

export const metadata = { title: "Privacy Policy | flyt" };

// Placeholder copy only - needs real legal review before launch. Exists so
// the registration consent checkbox (components/auth/register-form.tsx)
// links to a real page instead of a dead link.
export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-16 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: placeholder - not yet legally reviewed.</p>
      <p>
        This Privacy Policy describes what information flyt collects and how it&apos;s used.
      </p>
      <h2 className="text-lg font-semibold">What we collect</h2>
      <p>
        Your email and password (account), and the traveler details you submit for a booking
        (name, date of birth, contact details, and passport details when an itinerary requires
        them) - shared with our flight-booking and payment partners only as needed to complete
        your booking.
      </p>
      <h2 className="text-lg font-semibold">How we use it</h2>
      <p>
        To create and manage your bookings, send booking confirmations and account emails, and
        process payments.
      </p>
      <h2 className="text-lg font-semibold">Your data</h2>
      <p>You can request a copy of, or the deletion of, your account data at any time.</p>

      <p className="text-muted-foreground">
        See also our{" "}
        <Link href="/cookies" className="font-semibold text-signal">
          Cookie Policy
        </Link>
        .
      </p>
    </div>
  );
}
