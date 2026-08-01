import { Ban, CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatMoney, formatShortDate } from "@/lib/api/format";
import type {
  ConciergeBookingSummary,
  ConciergeCancellationQuote,
  ConciergeChangeOption,
} from "@/lib/api/schemas";

/** Compact chat-context cards for the concierge's booking-management
 * tools (get_my_booking, get_cancellation_quote, confirm_cancellation,
 * search_change_options) - same "small card, not a wall of prose" idea
 * as ConciergeFlightCard, sized for a chat bubble rather than a page. */
export function ConciergeBookingSummaryCard({ booking }: { booking: ConciergeBookingSummary }) {
  return (
    <Card className="gap-1.5 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {booking.booking_reference}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide">
          {booking.status}
        </span>
      </div>
      <p className="text-sm font-semibold">
        {booking.origin_iata_code} → {booking.destination_iata_code}
      </p>
      <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span>{formatShortDate(booking.departing_at)}</span>
        <span className="font-bold text-foreground">
          {formatMoney(booking.total_amount, booking.total_currency)}
        </span>
      </div>
    </Card>
  );
}

export function ConciergeCancellationQuoteCard({ quote }: { quote: ConciergeCancellationQuote }) {
  return (
    <Card className="gap-1.5 p-3">
      <div className="flex items-center gap-1.5 font-mono text-[11px] tracking-wide">
        {quote.confirmed ? (
          <>
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            Cancelled
          </>
        ) : (
          <>
            <Ban className="size-3.5 text-muted-foreground" />
            Cancellation quote
          </>
        )}
      </div>
      {quote.refund_amount && quote.refund_currency && (
        <p className="text-sm">
          Refund:{" "}
          <span className="font-bold">{formatMoney(quote.refund_amount, quote.refund_currency)}</span>
        </p>
      )}
      {quote.expires_at && !quote.confirmed && (
        <p className="font-mono text-[11px] text-muted-foreground">
          Quote expires {formatShortDate(quote.expires_at)}
        </p>
      )}
    </Card>
  );
}

export function ConciergeChangeOptionCard({ option }: { option: ConciergeChangeOption }) {
  return (
    <Card className="gap-1.5 p-3">
      <p className="font-mono text-[11px] tracking-wide text-muted-foreground">Change option</p>
      <div className="flex items-center justify-between text-sm">
        {option.change_total_amount && option.change_total_currency ? (
          <span className="font-bold">
            {formatMoney(option.change_total_amount, option.change_total_currency)}
          </span>
        ) : (
          <span className="text-muted-foreground">No fare difference</span>
        )}
        {option.penalty_total_amount && option.penalty_total_currency && (
          <span className="font-mono text-[11px] text-muted-foreground">
            +{formatMoney(option.penalty_total_amount, option.penalty_total_currency)} penalty
          </span>
        )}
      </div>
    </Card>
  );
}
