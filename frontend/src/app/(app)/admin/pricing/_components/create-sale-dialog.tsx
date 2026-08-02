"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { adminPricingSalesQuery } from "@/app/(app)/admin/_lib/queries";
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
import { createAdminPricingSale } from "@/lib/api/client";

/** Schedules a markup-rate override that replaces utils/pricing.py's
 * MARKUP_RATE constant for every customer automatically during its
 * window - no code, no opt-in, applies the moment starts_at hits (see
 * backend/utils/pricing.py's get_active_markup_rate). */
export function CreateSaleDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [markupPercent, setMarkupPercent] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const queryClient = useQueryClient();

  const reset = () => {
    setName("");
    setMarkupPercent("");
    setStartsAt("");
    setEndsAt("");
  };

  const mutation = useMutation({
    mutationFn: () =>
      createAdminPricingSale({
        name: name.trim(),
        markup_rate: Number(markupPercent) / 100,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
      }),
    onSuccess: (sale) => {
      toast.success(`"${sale.name}" scheduled.`);
      setOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: adminPricingSalesQuery().queryKey });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't schedule this sale.");
    },
  });

  const markupValue = Number(markupPercent);
  const valid =
    name.trim() &&
    markupPercent !== "" &&
    markupValue >= 0 &&
    markupValue <= 100 &&
    startsAt &&
    endsAt &&
    new Date(endsAt) > new Date(startsAt);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        + New sale
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New sale</DialogTitle>
            <DialogDescription>
              Replaces the standard markup for every customer during this window - no code
              needed. Can&apos;t overlap an existing sale.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-name">Name</Label>
              <Input
                id="sale-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Black Friday"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-markup">Markup during sale (%)</Label>
              <Input
                id="sale-markup"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
                placeholder="e.g. 3"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sale-starts">Starts</Label>
                <Input
                  id="sale-starts"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-ends">Ends</Label>
                <Input
                  id="sale-ends"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Scheduling…" : "Schedule sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
