"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setUserStaff } from "@/lib/api/client";

/** Superuser-only on the backend (utils/rbac.py's require_superuser) -
 * only rendered for a viewer who is themselves a superuser, see
 * admin-users-list.tsx. */
export function ToggleStaffButton({
  userId,
  email,
  isStaff,
}: {
  userId: string;
  email: string;
  isStaff: boolean;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => setUserStaff(userId, !isStaff),
    onSuccess: () => {
      toast.success(`${email} is ${!isStaff ? "now" : "no longer"} staff.`);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't update staff access.");
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {isStaff ? "Revoke staff" : "Make staff"}
    </Button>
  );
}
