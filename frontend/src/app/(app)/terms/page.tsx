export const metadata = { title: "Terms of Service | flyt" };

// Placeholder copy only - needs real legal review before launch. Exists so
// the registration consent checkbox (components/auth/register-form.tsx)
// links to a real page instead of a dead link.
export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-16 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: placeholder - not yet legally reviewed.</p>
      <p>
        These Terms of Service govern your use of flyt. By creating an account, you agree to
        these terms.
      </p>
      <h2 className="text-lg font-semibold">Bookings</h2>
      <p>
        flyt acts as an intermediary between you and airlines via our flight-booking partner.
        Fares, availability, and airline policies (baggage, changes, cancellations) are set by the
        operating airline, not flyt.
      </p>
      <h2 className="text-lg font-semibold">Payments</h2>
      <p>
        Payments are processed by our third-party payment providers. A service fee is included in
        the total price shown at checkout.
      </p>
      <h2 className="text-lg font-semibold">Account responsibility</h2>
      <p>
        You&apos;re responsible for keeping your account credentials secure and for the accuracy
        of the traveler details you submit for a booking.
      </p>
    </div>
  );
}
