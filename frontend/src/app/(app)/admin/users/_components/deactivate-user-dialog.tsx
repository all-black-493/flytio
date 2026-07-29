"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deactivateUser } from "@/lib/api/client";

/** Staff-initiated deactivation - same soft-delete a self-service account
 * deletion already is (see backend/crud/users.py's delete_user_account):
 * identity scrubbed, booking/payment history untouched. Gated on the
 * backend by the "delete_user" permission, not necessarily held by every
 * staff member - a 403 here surfaces as a plain error toast rather than
 * hiding the button (this app has no way to know a viewer's granular
 * permissions client-side, only is_staff/is_superuser). */
export function DeactivateUserDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => deactivateUser(userId),
    onSuccess: () => {
      toast.success(`${email} deactivated.`);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't deactivate this account.");
    },
  });

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Deactivate
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {email}?</DialogTitle>
            <DialogDescription>
              This scrubs their login identity - they won&apos;t be able to sign in again. Their
              booking and payment history is kept, unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Deactivating…" : "Deactivate account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
