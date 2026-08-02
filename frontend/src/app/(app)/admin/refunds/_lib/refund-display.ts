import type { RefundStatus } from "@/lib/api/schemas";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** How each internal refund status is presented to staff, in one place so
 * the list, its filters and any future refund surface can't drift into
 * describing the same state three different ways.
 *
 * `actionable` marks the two states where money is still owed and a human
 * has to do something - the whole reason this screen exists. */
export const REFUND_STATUS_DISPLAY: Record<
  RefundStatus,
  { label: string; help: string; variant: BadgeVariant; actionable: boolean }
> = {
  requested: {
    label: "Requested",
    help: "Queued with Pesapal, awaiting their finance team's approval. Pesapal never reports back, so confirm it landed and mark it paid.",
    variant: "secondary",
    actionable: false,
  },
  manual_required: {
    label: "Needs manual payout",
    help: "Pesapal's API can't carry this one - pay the customer directly, then mark it paid.",
    variant: "destructive",
    actionable: true,
  },
  failed: {
    label: "Failed",
    help: "Pesapal rejected the request. Fix the underlying cause and retry.",
    variant: "destructive",
    actionable: true,
  },
  completed: {
    label: "Paid",
    help: "Confirmed as actually received by the customer.",
    variant: "outline",
    actionable: false,
  },
};

/** Filter options for the refunds list, ordered so the two statuses that
 * still owe someone money come first. */
export const REFUND_FILTERS: { label: string; value: RefundStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Needs manual payout", value: "manual_required" },
  { label: "Failed", value: "failed" },
  { label: "Requested", value: "requested" },
  { label: "Paid", value: "completed" },
];
