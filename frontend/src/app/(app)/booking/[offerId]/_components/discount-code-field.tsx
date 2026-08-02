"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { previewDiscount } from "@/lib/api/client";
import type { DiscountPreviewResponse } from "@/lib/api/schemas";

interface DiscountCodeFieldProps {
  offerId: string;
  appliedDiscount: DiscountPreviewResponse | null;
  onApply: (code: string, preview: DiscountPreviewResponse) => void;
  onRemove: () => void;
}

/** Preview-only - the real checkout() call re-validates and applies the
 * code server-side against the final total (with seats/baggage/loyalty
 * folded in), which is what's authoritative. See backend/schemas/
 * payments.py's DiscountPreviewRequest docstring. */
export function DiscountCodeField({
  offerId,
  appliedDiscount,
  onApply,
  onRemove,
}: DiscountCodeFieldProps) {
  const [code, setCode] = useState("");

  const mutation = useMutation({
    mutationFn: () => previewDiscount({ offer_id: offerId, discount_code: code.trim() }),
    onSuccess: (preview) => {
      onApply(code.trim().toUpperCase(), preview);
      toast.success(`"${code.trim().toUpperCase()}" applied.`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "That code isn't valid.");
    },
  });

  if (appliedDiscount) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-signal/40 bg-signal/5 px-4 py-2 text-sm">
        <span>
          Discount applied - {appliedDiscount.discount_percentage}% off (
          {appliedDiscount.currency} {appliedDiscount.discounted_amount} instead of{" "}
          {appliedDiscount.original_amount})
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onRemove();
            setCode("");
          }}
        >
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Discount code"
        className="max-w-[220px]"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={!code.trim() || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Checking…" : "Apply"}
      </Button>
    </div>
  );
}
