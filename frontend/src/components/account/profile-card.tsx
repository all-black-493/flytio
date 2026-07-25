"use client";

import { useQuery } from "@tanstack/react-query";

import { meQuery } from "@/app/(app)/account/_lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogout } from "@/lib/auth/use-logout";

export function ProfileCard() {
  const logout = useLogout();
  const { data: user, isPending, isError } = useQuery(meQuery());

  return (
    <Card className="w-full max-w-sm gap-0 overflow-hidden py-0 shadow-xl">
      <div className="flex items-center justify-between bg-board px-6 py-3">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">
          BOARDING PASS
        </span>
        <span className="font-mono text-[11px] tracking-[0.25em] text-signal">FLYT</span>
      </div>
      <CardContent className="p-6">
        <h1 className="text-2xl font-bold tracking-tight">Your account</h1>

        {isPending && <Skeleton className="mt-4 h-5 w-48" />}
        {isError && (
          <p className="mt-4 text-sm text-destructive">Couldn&apos;t load your account details.</p>
        )}
        {user && (
          <div className="mt-4 border-t border-dashed pt-4">
            <p className="font-mono text-[11px] tracking-widest text-muted-foreground">EMAIL</p>
            <p className="mt-1 text-base">{user.email}</p>
          </div>
        )}

        <Button
          variant="outline"
          size="lg"
          className="mt-6 w-full font-semibold"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? "Logging out…" : "Log out"}
        </Button>
      </CardContent>
    </Card>
  );
}
