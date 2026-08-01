"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { adminDiscountCodesQuery } from "@/app/(app)/admin/_lib/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAdminDiscountCode } from "@/lib/api/client";

/** A discount code reduces the marked-up price a customer pays, but is
 * floored at the raw Duffel fare (backend/utils/pricing.py's
 * apply_discount) - flyt only ever earns less margin, down to zero,
 * never pays out of pocket. */
export function CreateDiscountCodeDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const queryClient = useQueryClient();

  const reset = () => {
    setCode("");
    setPercent("");
    setMaxRedemptions("");
    setExpiresAt("");
  };

  const mutation = useMutation({
    mutationFn: () =>
      createAdminDiscountCode({
        code: code.trim(),
        discount_percentage: Number(percent),
        max_redemptions: maxRedemptions.trim() ? Number(maxRedemptions) : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    onSuccess: (discount) => {
      toast.success(`Code "${discount.code}" created.`);
      setOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: adminDiscountCodesQuery().queryKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't create this code.");
    },
  });

  const percentValue = Number(percent);
  const valid = code.trim() && percent !== "" && percentValue > 0 && percentValue <= 100;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        + New code
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New discount code</DialogTitle>
            <DialogDescription>
              Customers enter this at checkout. Never charges flyt below the raw fare, even at
              100% off.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="discount-code">Code</Label>
              <Input
                id="discount-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME10"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discount-percent">Discount (%)</Label>
              <Input
                id="discount-percent"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="discount-max-redemptions">Max uses</Label>
                <Input
                  id="discount-max-redemptions"
                  type="number"
                  min={1}
                  value={maxRedemptions}
                  onChange={(e) => setMaxRedemptions(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="discount-expires">Expires</Label>
                <Input
                  id="discount-expires"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Creating…" : "Create code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
