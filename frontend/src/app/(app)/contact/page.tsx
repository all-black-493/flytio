import { ContactForm } from "@/components/support/contact-form";

export const metadata = { title: "Contact us | flyt" };

interface PageProps {
  searchParams: Promise<{ subject?: string; booking_reference?: string }>;
}

export default async function ContactPage({ searchParams }: PageProps) {
  const { subject, booking_reference } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Contact us</h1>
        <p className="text-sm text-muted-foreground">
          Question about a booking, a payment issue, or something else - send us a message and
          we&apos;ll reply by email.
        </p>
      </div>
      <ContactForm defaultSubject={subject} defaultBookingReference={booking_reference} />
    </div>
  );
}
