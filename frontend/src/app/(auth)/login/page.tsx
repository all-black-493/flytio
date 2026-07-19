"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const labelClass =
  "font-mono text-[11px] tracking-widest text-muted-foreground";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      await loginUser(
        String(form.get("email")),
        String(form.get("password")),
      );
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm overflow-hidden py-0 gap-0 shadow-xl">
      <div className="flex items-center justify-between bg-board px-6 py-3">
        <span className="font-mono text-[11px] tracking-[0.25em] text-board-muted">
          CHECK-IN
        </span>
        <span className="font-mono text-[11px] tracking-[0.25em] text-signal">
          GATE 01
        </span>
      </div>
      <CardContent className="p-6">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to manage your trips and fares.
        </p>
        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email" className={labelClass}>
              EMAIL
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password" className={labelClass}>
              PASSWORD
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full font-semibold"
            disabled={pending}
          >
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-5 border-t border-dashed pt-4 text-sm text-muted-foreground">
          New to flyt?{" "}
          <Link href="/register" className="font-semibold text-signal">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
