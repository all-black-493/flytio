"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";

import { BookingConfirmation } from "@/app/(app)/booking/[offerId]/_components/booking-confirmation";
import { paymentStatusQuery } from "@/app/(app)/booking/payment-callback/_lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// How long to keep showing the plain spinner before switching to the
// "taking longer than expected" message.
const SLOW_THRESHOLD_MS = 40_000;

interface StatusCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { href: string; label: string };
  secondaryLabel?: string;
  onSecondary?: () => void;
}

function StatusCard({ icon, title, description, action, secondaryLabel, onSecondary }: StatusCardProps) {
  return (
    <Card className="w-full max-w-md gap-0 overflow-hidden py-0 shadow-xl">
      <div className="flex items-center justify-between bg-board px-6 py-3">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">PAYMENT</span>
        <span className="font-mono text-[11px] tracking-[0.25em] text-signal">FLYT</span>
      </div>
      <CardContent className="flex flex-col items-center p-6 text-center">
        {icon}
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>

        {action && (
          <Button
            render={<Link href={action.href} />}
            nativeButton={false}
            size="lg"
            className="mt-6 w-full font-semibold"
          >
            {action.label}
          </Button>
        )}
        {secondaryLabel && (
          <Button
            variant="outline"
            size="lg"
            className="mt-3 w-full font-semibold"
            onClick={onSecondary}
          >
            {secondaryLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface PaymentCallbackProps {
  paymentId: string | undefined;
  cancelled: boolean;
}

export function PaymentCallback({ paymentId, cancelled }: PaymentCallbackProps) {
  const query = useQuery({
    ...paymentStatusQuery(paymentId ?? ""),
    enabled: !cancelled && !!paymentId,
  });

  const isPending = query.isPending || query.data?.status === "pending";

  // Starts a single 40s timer the moment we enter "pending"; if we're
  // still pending when it fires, switch to the "taking longer than
  // expected" message. The effect only re-runs when isPending itself
  // flips, not on every 2s poll (query.data?.status stays the same
  // "pending" string value across polls).
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, [isPending]);

  if (!paymentId) {
    return (
      <StatusCard
        icon={<TriangleAlertIcon className="size-10 text-destructive" />}
        title="Something went wrong"
        description="We couldn't find your payment. If you were charged, check your bookings or contact support."
        action={{ href: "/account", label: "View your bookings" }}
      />
    );
  }

  if (cancelled) {
    return (
      <StatusCard
        icon={<TriangleAlertIcon className="size-10 text-muted-foreground" />}
        title="Payment cancelled"
        description="You weren't charged. You can try again whenever you're ready."
        action={{ href: "/search", label: "Search flights" }}
      />
    );
  }

  if (query.isError) {
    return (
      <StatusCard
        icon={<TriangleAlertIcon className="size-10 text-destructive" />}
        title="Couldn't confirm your payment"
        description="If you were charged, it'll show up in your bookings shortly."
        action={{ href: "/account", label: "View your bookings" }}
      />
    );
  }

  const status = query.data?.status;

  if (isPending) {
    if (!isSlow) {
      return (
        <StatusCard
          icon={<Loader2Icon className="size-10 animate-spin text-signal" />}
          title="Confirming your payment…"
          description="This usually takes a few seconds."
        />
      );
    }
    return (
      <StatusCard
        icon={<Loader2Icon className="size-10 text-muted-foreground" />}
        title="This is taking longer than expected"
        description="Your payment may still be processing. Check your bookings in a moment, or try again now."
        action={{ href: "/account", label: "View your bookings" }}
        secondaryLabel="Check again"
        onSecondary={() => query.refetch()}
      />
    );
  }

  if (status === "completed" && query.data?.booking) {
    return <BookingConfirmation booking={query.data.booking} />;
  }

  if (status === "booking_failed") {
    return (
      <StatusCard
        icon={<OctagonXIcon className="size-10 text-signal" />}
        title="Your payment went through"
        description={`We hit a problem finalizing your booking. Our team has been notified and will follow up — if you need to reach support, reference payment ID ${paymentId}.`}
        action={{ href: "/account", label: "View your bookings" }}
      />
    );
  }

  return (
    <StatusCard
      icon={<TriangleAlertIcon className="size-10 text-destructive" />}
      title="Payment failed"
      description={query.data?.failure_reason ?? "You weren't charged. Please try again."}
      action={{ href: "/search", label: "Search flights" }}
    />
  );
}
