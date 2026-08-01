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
import { Textarea } from "@/components/ui/textarea";
import { banUser } from "@/lib/api/client";

/** Unlike DeactivateUserDialog, a ban never scrubs the account's email -
 * it's fully reversible via UnbanUserButton (see backend/crud/users.py's
 * ban_user/unban_user). Gated on the backend by the same "delete_user"
 * permission deactivate uses - a 403 surfaces as a plain error toast,
 * same posture as DeactivateUserDialog's for why. */
export function BanUserDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => banUser(userId, reason.trim()),
    onSuccess: () => {
      toast.success(`${email} banned.`);
      setOpen(false);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't ban this account.");
    },
  });

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Ban
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban {email}?</DialogTitle>
            <DialogDescription>
              Blocks sign-in immediately, including any active session. Unlike deactivating, this
              doesn&apos;t touch their email or identity - it&apos;s fully reversible from this
              page.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required, visible to other admins)"
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={mutation.isPending || !reason.trim()}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Banning…" : "Ban account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
