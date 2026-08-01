"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { adminGroupsQuery } from "@/app/(app)/admin/_lib/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createAdminGroup } from "@/lib/api/client";

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: () => createAdminGroup(name.trim()),
    onSuccess: (group) => {
      toast.success(`Group "${group.name}" created.`);
      setOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: adminGroupsQuery().queryKey });
      router.push(`/admin/groups/${group.id}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't create this group.");
    },
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        + New group
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. support"
            autoFocus
          />
          <DialogFooter>
            <Button
              disabled={mutation.isPending || !name.trim()}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Creating…" : "Create group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
