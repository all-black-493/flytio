"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { unbanUser } from "@/lib/api/client";

export function UnbanUserButton({ userId, email }: { userId: string; email: string }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => unbanUser(userId),
    onSuccess: () => {
      toast.success(`${email} unbanned.`);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't unban this account.");
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? "Unbanning…" : "Unban"}
    </Button>
  );
}
