"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatMoney } from "@/lib/api/format";

export interface PriceBreakdownProps {
  baseAmount: string | null;
  baseCurrency: string | null;
  taxAmount: string | null;
  taxCurrency: string | null;
  totalAmount: string;
  totalCurrency: string;
  className?: string;
}

/** Itemized fare breakdown, closed by default - the total is what matters
 * at a glance, the "why" is one tap away. Falls back to just the total
 * with no toggle when the backend doesn't have a base/tax split for this
 * offer (some Duffel offers omit it). */
export function PriceBreakdown({
  baseAmount,
  baseCurrency,
  taxAmount,
  taxCurrency,
  totalAmount,
  totalCurrency,
  className,
}: PriceBreakdownProps) {
  const [open, setOpen] = useState(false);
  const hasBreakdown = baseAmount != null && taxAmount != null;

  if (!hasBreakdown) {
    return (
      <div className={className}>
        <span className="text-lg font-bold tabular-nums">
          {formatMoney(totalAmount, totalCurrency)}
        </span>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="group/breakdown flex w-full items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
          FARE DETAILS
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-lg font-bold tabular-nums">
            {formatMoney(totalAmount, totalCurrency)}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-panel-open/breakdown:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 space-y-1.5 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base fare</span>
            <span className="tabular-nums">{formatMoney(baseAmount, baseCurrency!)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxes &amp; fees</span>
            <span className="tabular-nums">{formatMoney(taxAmount, taxCurrency!)}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totalAmount, totalCurrency)}</span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
