"use client";

import { DuffelPayments } from "@duffel/components";
import type { ComponentProps } from "react";

// Derived from DuffelPayments' own prop type rather than importing
// StripeError from @stripe/stripe-js directly - @duffel/components
// bundles its own pinned (and slightly different) copy of that package,
// so a top-level @stripe/stripe-js install produces a structurally
// mismatched, nominally-incompatible StripeError type.
type DuffelPaymentsProps = ComponentProps<typeof DuffelPayments>;

/** Duffel Payments' own React component - collects card details directly
 * with Duffel (via Stripe under the hood), so raw card data never
 * reaches our backend. `clientToken` comes from POST
 * /payments/checkout/card; see lib/api/client.ts's checkoutWithCard. */
export function DuffelCardPayment({
  clientToken,
  onSuccessfulPayment,
  onFailedPayment,
}: {
  clientToken: string;
  onSuccessfulPayment: DuffelPaymentsProps["onSuccessfulPayment"];
  onFailedPayment: DuffelPaymentsProps["onFailedPayment"];
}) {
  return (
    // .card-payment__pay-button's actual styling lives in globals.css,
    // not here - Tailwind's arbitrary-selector syntax (e.g.
    // [&_.card-payment__pay-button]:bg-signal) silently mangles this
    // class name (its literal "__" gets read as two spaces), so plain
    // CSS is what actually applies. See the comment there for detail.
    <div className="rounded-xl border bg-card p-4">
      <DuffelPayments
        paymentIntentClientToken={clientToken}
        onSuccessfulPayment={onSuccessfulPayment}
        onFailedPayment={onFailedPayment}
        // Matches flyt's brand: --signal orange, zero border radius (the
        // "Control Tower" wireframe look, see globals.css's --radius: 0),
        // and the same mono typeface used everywhere else in the app.
        // Confirmed this only styles the card input fields (passed
        // straight into Stripe's CardElement style.base) - the button
        // fix above is what actually makes "Pay" visible/on-brand.
        styles={{
          accentColor: "#ff4f00",
          buttonCornerRadius: "0px",
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        }}
      />
    </div>
  );
}
