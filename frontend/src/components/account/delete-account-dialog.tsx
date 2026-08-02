"use client";

import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { bookingsQuery } from "@/app/(app)/account/_lib/queries";
import { friendlyAuthError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteAccount } from "@/lib/api/client";
import { formLabelClass as labelClass } from "@/lib/utils";

/** Destructive, password-confirmed account deletion - see
 * backend/crud/users.py's delete_user_account for what actually happens
 * (identity scrubbed, booking/payment history kept). Warns (doesn't
 * block) if the account has bookings on file, reusing the same
 * bookingsQuery() the rest of the account page already loads. */
export function DeleteAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data } = useInfiniteQuery(bookingsQuery());
  const bookingCount = data?.pages[0]?.total ?? 0;

  const mutation = useMutation({
    mutationFn: () => deleteAccount(password),
    onSuccess: () => {
      toast.success("Your account has been deleted.");
      router.push("/");
      router.refresh();
    },
    onError: (err) => {
      setError(friendlyAuthError(err, "Couldn't delete your account"));
    },
  });

  return (
    <>
      <Button
        variant="destructive"
        className="w-full font-semibold"
        onClick={() => setOpen(true)}
      >
        Delete account
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPassword("");
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone - you&apos;ll be signed out and won&apos;t be able to
              sign back in.
              {bookingCount > 0 && (
                <>
                  {" "}
                  You have {bookingCount} booking{bookingCount > 1 ? "s" : ""} on file - your
                  account will lose access to them, though any upcoming flights remain valid
                  with the airline.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="delete-account-password" className={labelClass}>
              CONFIRM YOUR PASSWORD
            </FieldLabel>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
            <FieldError errors={[error ? { message: error } : undefined]} />
          </Field>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!password || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Deleting…" : "Permanently delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
